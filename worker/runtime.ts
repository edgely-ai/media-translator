import { closePostgresPool, withPostgresClient } from "@/lib/db/postgres";
import { getPostgresQueryExecutor } from "@/lib/db/postgres";
import {
  claimNextCreatedJobForProcessing,
  claimNextQueuedJobForProcessing,
  releaseJobExecutionLock,
} from "@/lib/jobs/enqueueJob";
import type { PostgresTransactionExecutor } from "@/lib/db/postgres";
import { listPotentiallyStuckJobs } from "@/lib/ops/stuckJobs";
import { getWorkerRuntimeChecks } from "@/lib/ops/workerRuntimeChecks";
import { processMediaJob } from "@/worker/handlers/process-media-job";
import { logWorkerEvent } from "@/worker/logger";

export interface WorkerRuntimeOptions {
  pollIntervalMs: number;
  queuedScanLimit: number;
  outputRootDir?: string;
  lipSyncCallbackUrl?: string | null;
  runOnce?: boolean;
  heartbeatIntervalMs?: number;
  stuckJobThresholdMs?: number;
  stuckJobSampleLimit?: number;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });
}

async function claimNextJobForExecution(
  db: PostgresTransactionExecutor,
  queuedScanLimit: number,
): Promise<{
  jobId: string;
  status: string;
  claimedFrom: "created" | "queued";
} | null> {
  const createdJob = await claimNextCreatedJobForProcessing(db);

  if (createdJob) {
    return {
      jobId: createdJob.id,
      status: createdJob.status,
      claimedFrom: "created",
    };
  }

  const queuedJob = await claimNextQueuedJobForProcessing(db, queuedScanLimit);

  if (!queuedJob) {
    return null;
  }

  return {
    jobId: queuedJob.id,
    status: queuedJob.status,
    claimedFrom: "queued",
  };
}

async function executeClaimedJob(
  db: PostgresTransactionExecutor,
  jobId: string,
  options: Pick<WorkerRuntimeOptions, "outputRootDir" | "lipSyncCallbackUrl">,
): Promise<void> {
  const startedAt = Date.now();

  logWorkerEvent("info", "job_execution_started", {
    job_id: jobId,
  });

  try {
    const job = await processMediaJob(
      db,
      { jobId },
      {
        outputRootDir: options.outputRootDir,
        lipSyncCallbackUrl: options.lipSyncCallbackUrl ?? null,
      },
    );

    logWorkerEvent("info", "job_execution_completed", {
      job_id: jobId,
      final_status: job.status,
      duration_ms: Date.now() - startedAt,
    });
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Worker execution failed.";

    logWorkerEvent("error", "job_execution_failed", {
      job_id: jobId,
      duration_ms: Date.now() - startedAt,
      error_message: errorMessage,
    });

    throw error;
  } finally {
    const unlocked = await releaseJobExecutionLock(db, jobId).catch(() => false);

    logWorkerEvent(unlocked ? "info" : "warn", "job_execution_lock_released", {
      job_id: jobId,
      released: unlocked,
    });
  }
}

async function emitWorkerHeartbeatIfDue(params: {
  lastHeartbeatAt: number;
  heartbeatIntervalMs: number;
  startedAt: number;
  totalPolls: number;
  idlePollsSinceHeartbeat: number;
  jobsProcessedSinceHeartbeat: number;
  consecutiveIterationErrors: number;
  stuckJobThresholdMs: number;
  stuckJobSampleLimit: number;
}): Promise<number> {
  if (Date.now() - params.lastHeartbeatAt < params.heartbeatIntervalMs) {
    return params.lastHeartbeatAt;
  }

  const stuckJobs = await listPotentiallyStuckJobs(getPostgresQueryExecutor(), {
    olderThanMs: params.stuckJobThresholdMs,
    limit: params.stuckJobSampleLimit,
  }).catch((error) => {
    logWorkerEvent("warn", "worker_stuck_job_check_failed", {
      error_message:
        error instanceof Error
          ? error.message
          : "Failed to query potentially stuck jobs.",
    });

    return [];
  });

  logWorkerEvent("info", "worker_heartbeat", {
    uptime_ms: Date.now() - params.startedAt,
    total_polls: params.totalPolls,
    idle_polls_since_heartbeat: params.idlePollsSinceHeartbeat,
    jobs_processed_since_heartbeat: params.jobsProcessedSinceHeartbeat,
    consecutive_iteration_errors: params.consecutiveIterationErrors,
    stuck_job_count: stuckJobs.length,
    stuck_job_ids: stuckJobs.map((job) => job.id),
  });

  if (stuckJobs.length > 0) {
    logWorkerEvent("warn", "worker_stuck_jobs_detected", {
      threshold_ms: params.stuckJobThresholdMs,
      sample_limit: params.stuckJobSampleLimit,
      jobs: stuckJobs.map((job) => ({
        job_id: job.id,
        status: job.status,
        age_seconds: job.age_seconds,
        cancel_requested_at: job.cancel_requested_at,
      })),
    });
  }

  return Date.now();
}

export async function runWorkerRuntime(
  options: WorkerRuntimeOptions,
): Promise<void> {
  let shouldStop = false;
  const startedAt = Date.now();
  const heartbeatIntervalMs = options.heartbeatIntervalMs ?? 60_000;
  const stuckJobThresholdMs = options.stuckJobThresholdMs ?? 15 * 60 * 1000;
  const stuckJobSampleLimit = options.stuckJobSampleLimit ?? 5;
  let lastHeartbeatAt = Date.now();
  let totalPolls = 0;
  let idlePollsSinceHeartbeat = 0;
  let jobsProcessedSinceHeartbeat = 0;
  let consecutiveIterationErrors = 0;
  const runtimeChecks = getWorkerRuntimeChecks();

  const stop = (signal: NodeJS.Signals) => {
    shouldStop = true;
    logWorkerEvent("info", "worker_shutdown_requested", {
      signal,
    });
  };

  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  logWorkerEvent("info", "worker_runtime_started", {
    poll_interval_ms: options.pollIntervalMs,
    heartbeat_interval_ms: heartbeatIntervalMs,
    stuck_job_threshold_ms: stuckJobThresholdMs,
    stuck_job_sample_limit: stuckJobSampleLimit,
    queued_scan_limit: options.queuedScanLimit,
    output_root_dir: options.outputRootDir ?? "media",
    run_once: options.runOnce ?? false,
    runtime_checks: runtimeChecks,
    limitations: [
      "automatic retry/backoff is still unresolved",
      "worker requires ffmpeg plus writable local staging/output directories",
      "monitoring remains log-driven without an external metrics backend",
    ],
  });

  try {
    while (!shouldStop) {
      let claimedJob: Awaited<ReturnType<typeof claimNextJobForExecution>> = null;
      totalPolls += 1;

      try {
        claimedJob = await withPostgresClient(async (db) => {
          const nextJob = await claimNextJobForExecution(db, options.queuedScanLimit);

          if (!nextJob) {
            return null;
          }

          logWorkerEvent("info", "job_picked_up", {
            job_id: nextJob.jobId,
            claimed_from: nextJob.claimedFrom,
            current_status: nextJob.status,
          });

          await executeClaimedJob(db, nextJob.jobId, options);

          return nextJob;
        });
        consecutiveIterationErrors = 0;
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Worker loop iteration failed.";
        consecutiveIterationErrors += 1;

        logWorkerEvent("error", "worker_iteration_failed", {
          error_message: errorMessage,
          consecutive_iteration_errors: consecutiveIterationErrors,
          total_polls: totalPolls,
        });

        if (options.runOnce) {
          throw error;
        }

        await sleep(options.pollIntervalMs);
        continue;
      }

      if (!claimedJob) {
        idlePollsSinceHeartbeat += 1;

        const heartbeatAt = await emitWorkerHeartbeatIfDue({
          lastHeartbeatAt,
          heartbeatIntervalMs,
          startedAt,
          totalPolls,
          idlePollsSinceHeartbeat,
          jobsProcessedSinceHeartbeat,
          consecutiveIterationErrors,
          stuckJobThresholdMs,
          stuckJobSampleLimit,
        });

        if (heartbeatAt !== lastHeartbeatAt) {
          lastHeartbeatAt = heartbeatAt;
          idlePollsSinceHeartbeat = 0;
          jobsProcessedSinceHeartbeat = 0;
        }

        if (options.runOnce) {
          break;
        }

        await sleep(options.pollIntervalMs);
        continue;
      }

      jobsProcessedSinceHeartbeat += 1;

      const heartbeatAt = await emitWorkerHeartbeatIfDue({
        lastHeartbeatAt,
        heartbeatIntervalMs,
        startedAt,
        totalPolls,
        idlePollsSinceHeartbeat,
        jobsProcessedSinceHeartbeat,
        consecutiveIterationErrors,
        stuckJobThresholdMs,
        stuckJobSampleLimit,
      });

      if (heartbeatAt !== lastHeartbeatAt) {
        lastHeartbeatAt = heartbeatAt;
        idlePollsSinceHeartbeat = 0;
        jobsProcessedSinceHeartbeat = 0;
      }

      if (options.runOnce) {
        break;
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await closePostgresPool();
    logWorkerEvent("info", "worker_runtime_stopped", {
      uptime_ms: Date.now() - startedAt,
      total_polls: totalPolls,
      consecutive_iteration_errors: consecutiveIterationErrors,
    });
  }
}
