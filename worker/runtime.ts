import { closePostgresPool, withPostgresClient } from "@/lib/db/postgres";
import {
  claimNextCreatedJobForProcessing,
  claimNextQueuedJobForProcessing,
  releaseJobExecutionLock,
} from "@/lib/jobs/enqueueJob";
import type { PostgresTransactionExecutor } from "@/lib/db/postgres";
import { processMediaJob } from "@/worker/handlers/process-media-job";
import { logWorkerEvent } from "@/worker/logger";

export interface WorkerRuntimeOptions {
  pollIntervalMs: number;
  queuedScanLimit: number;
  outputRootDir?: string;
  lipSyncCallbackUrl?: string | null;
  runOnce?: boolean;
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

export async function runWorkerRuntime(
  options: WorkerRuntimeOptions,
): Promise<void> {
  let shouldStop = false;

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
    queued_scan_limit: options.queuedScanLimit,
    output_root_dir: options.outputRootDir ?? "media",
    run_once: options.runOnce ?? false,
    limitations: [
      "source media local access is still unresolved",
      "durable output persistence is still unresolved",
      "provider integrations are still mostly mock or not configured",
    ],
  });

  try {
    while (!shouldStop) {
      let claimedJob: Awaited<ReturnType<typeof claimNextJobForExecution>> = null;

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
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Worker loop iteration failed.";

        logWorkerEvent("error", "worker_iteration_failed", {
          error_message: errorMessage,
        });

        if (options.runOnce) {
          throw error;
        }

        await sleep(options.pollIntervalMs);
        continue;
      }

      if (!claimedJob) {
        logWorkerEvent("info", "worker_poll_idle", {
          poll_interval_ms: options.pollIntervalMs,
        });

        if (options.runOnce) {
          break;
        }

        await sleep(options.pollIntervalMs);
        continue;
      }

      if (options.runOnce) {
        break;
      }
    }
  } finally {
    process.removeListener("SIGINT", stop);
    process.removeListener("SIGTERM", stop);
    await closePostgresPool();
    logWorkerEvent("info", "worker_runtime_stopped");
  }
}
