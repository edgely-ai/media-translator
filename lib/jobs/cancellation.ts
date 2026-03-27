import type { DatabaseExecutor } from "@/lib/db/client";
import {
  getJobById,
  markJobCancellationHonored,
  requestJobCancellation,
} from "@/lib/db/jobs";
import { listTargetsByJobId, updateJobTargetStatus } from "@/lib/db/targets";
import { JOB_STATE, TARGET_STATE } from "@/lib/jobs/jobStates";
import { reconcileJobOutputs } from "@/lib/jobs/reconcileJobOutputs";
import { logJobTargetEvent } from "@/lib/jobs/stepLogging";
import { getPostgresQueryExecutor } from "@/lib/db/postgres";
import type { CancelJobResponse, JobRow, JobTargetRow } from "@/types/jobs";

type RouteErrorStatus = 400 | 403 | 404 | 409 | 500;

const CANCELLATION_MESSAGE = "Processing canceled by user request.";

export class JobCancellationRequestedError extends Error {
  constructor(
    public readonly jobId: string,
    public readonly finalStatus: JobRow["status"],
  ) {
    super(`Job ${jobId} cancellation was honored with final status ${finalStatus}.`);
    this.name = "JobCancellationRequestedError";
  }
}

export class CancelJobRouteError extends Error {
  constructor(
    public readonly status: RouteErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = "CancelJobRouteError";
  }
}

function isTerminalStatus(status: JobRow["status"]): boolean {
  return (
    status === JOB_STATE.COMPLETED ||
    status === JOB_STATE.PARTIAL_SUCCESS ||
    status === JOB_STATE.FAILED ||
    status === JOB_STATE.CANCELED
  );
}

function shouldFailTargetForCancellation(
  outputMode: JobRow["output_mode"],
  target: JobTargetRow,
): boolean {
  if (target.status === TARGET_STATE.FAILED || target.status === TARGET_STATE.COMPLETED) {
    return false;
  }

  if (outputMode === "subtitles" && target.status === TARGET_STATE.SUBTITLES_READY) {
    return false;
  }

  return true;
}

function buildCancellationMessage(cancelReason: string | null): string {
  const normalizedReason = cancelReason?.trim();

  if (!normalizedReason) {
    return CANCELLATION_MESSAGE;
  }

  return `${CANCELLATION_MESSAGE} Reason: ${normalizedReason}`;
}

async function markRemainingTargetsCanceled(
  db: DatabaseExecutor,
  job: JobRow,
  checkpoint: string,
): Promise<number> {
  const targets = await listTargetsByJobId(db, job.id);
  const message = buildCancellationMessage(job.cancel_reason);
  let updatedCount = 0;

  for (const target of targets) {
    if (!shouldFailTargetForCancellation(job.output_mode, target)) {
      continue;
    }

    await updateJobTargetStatus(db, {
      targetId: target.id,
      status: TARGET_STATE.FAILED,
      errorMessage: message,
      completedAt: null,
    });

    updatedCount += 1;
    logJobTargetEvent("warn", "[jobs] target canceled", {
      jobId: job.id,
      step: checkpoint,
      target_id: target.id,
      target_language: target.target_language,
      error_message: message,
    });
  }

  return updatedCount;
}

async function honorCancellation(
  db: DatabaseExecutor,
  job: JobRow,
  checkpoint: string,
): Promise<JobRow> {
  await markRemainingTargetsCanceled(db, job, checkpoint);
  await markJobCancellationHonored(db, {
    jobId: job.id,
  });
  const reconciliation = await reconcileJobOutputs(job.id);
  const finalJob = await getJobById(db, job.id);

  if (!finalJob) {
    throw new Error(`Job ${job.id} was not found after cancellation reconciliation.`);
  }

  logJobTargetEvent("warn", "[jobs] cancel honored", {
    jobId: job.id,
    step: checkpoint,
    final_status: reconciliation.status,
    cancel_requested_at: job.cancel_requested_at,
  });

  return finalJob;
}

export async function throwIfCancellationRequested(
  db: DatabaseExecutor,
  jobId: string,
  checkpoint: string,
): Promise<void> {
  const job = await getJobById(db, jobId);

  if (!job) {
    throw new Error(`Job ${jobId} was not found.`);
  }

  if (!job.cancel_requested_at) {
    return;
  }

  const finalJob = await honorCancellation(db, job, checkpoint);
  throw new JobCancellationRequestedError(jobId, finalJob.status);
}

export function isJobCancellationRequestedError(
  error: unknown,
): error is JobCancellationRequestedError {
  return error instanceof JobCancellationRequestedError;
}

export async function requestOwnedJobCancellation(
  profileId: string,
  jobId: string,
  cancelReason?: string | null,
): Promise<CancelJobResponse> {
  const db = getPostgresQueryExecutor();
  const job = await getJobById(db, jobId);

  if (!job) {
    throw new CancelJobRouteError(404, "Job was not found.");
  }

  if (job.profile_id !== profileId) {
    throw new CancelJobRouteError(403, "You do not own this job.");
  }

  if (isTerminalStatus(job.status)) {
    throw new CancelJobRouteError(409, "Only queued or active jobs can be canceled.");
  }

  const updatedJob = await requestJobCancellation(db, {
    jobId,
    cancelReason,
  });

  console.info("[jobs] cancel requested", {
    job_id: updatedJob.id,
    status: updatedJob.status,
    cancel_requested_at: updatedJob.cancel_requested_at,
  });

  return {
    jobId: updatedJob.id,
    status: updatedJob.status,
    cancelRequestedAt:
      updatedJob.cancel_requested_at ?? new Date().toISOString(),
    cancelReason: updatedJob.cancel_reason,
  };
}

export function isCancelJobRouteError(error: unknown): error is CancelJobRouteError {
  return error instanceof CancelJobRouteError;
}
