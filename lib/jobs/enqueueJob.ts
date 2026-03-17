import { DatabaseConflictError, type DatabaseExecutor } from "@/lib/db/client";
import { getJobById, updateJobStatus } from "@/lib/db/jobs";
import { JOB_STATE, canTransitionJobState } from "@/lib/jobs/jobStates";
import type { JobRow } from "@/types/jobs";

export interface EnqueueJobInput {
  jobId: string;
}

export async function enqueueJob(
  db: DatabaseExecutor,
  input: EnqueueJobInput,
): Promise<JobRow> {
  const job = await getJobById(db, input.jobId);

  if (!job) {
    throw new Error(`Job ${input.jobId} was not found.`);
  }

  if (!canTransitionJobState(job.status, JOB_STATE.QUEUED)) {
    throw new DatabaseConflictError(
      `Job ${input.jobId} cannot transition from ${job.status} to ${JOB_STATE.QUEUED}.`,
    );
  }

  return updateJobStatus(db, {
    jobId: input.jobId,
    status: JOB_STATE.QUEUED,
    errorMessage: null,
    completedAt: null,
  });
}
