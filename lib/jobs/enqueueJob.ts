import {
  DatabaseConflictError,
  queryMany,
  queryOne,
  type DatabaseExecutor,
  type TransactionCapableDatabaseExecutor,
} from "@/lib/db/client";
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

interface JobIdRow {
  id: string;
}

interface AdvisoryLockRow {
  locked: boolean;
}

export async function tryAcquireJobExecutionLock(
  db: DatabaseExecutor,
  jobId: string,
): Promise<boolean> {
  const row = await queryOne<AdvisoryLockRow>(
    db,
    "SELECT pg_try_advisory_lock(hashtext($1)) AS locked",
    [jobId],
  );

  return Boolean(row?.locked);
}

export async function releaseJobExecutionLock(
  db: DatabaseExecutor,
  jobId: string,
): Promise<boolean> {
  const row = await queryOne<AdvisoryLockRow>(
    db,
    "SELECT pg_advisory_unlock(hashtext($1)) AS locked",
    [jobId],
  );

  return Boolean(row?.locked);
}

export async function claimNextCreatedJobForProcessing(
  db: TransactionCapableDatabaseExecutor,
): Promise<JobRow | null> {
  return db.transaction(async (transactionDb) => {
    const candidate = await queryOne<JobIdRow>(
      transactionDb,
      `SELECT id
       FROM jobs
       WHERE status = $1
       ORDER BY created_at ASC
       FOR UPDATE SKIP LOCKED
       LIMIT 1`,
      [JOB_STATE.CREATED],
    );

    if (!candidate) {
      return null;
    }

    const queuedJob = await enqueueJob(transactionDb, {
      jobId: candidate.id,
    });
    const locked = await tryAcquireJobExecutionLock(transactionDb, queuedJob.id);

    if (!locked) {
      throw new DatabaseConflictError(
        `Job ${queuedJob.id} was queued but could not acquire execution lock.`,
      );
    }

    return queuedJob;
  });
}

export async function claimNextQueuedJobForProcessing(
  db: DatabaseExecutor,
  limit = 10,
): Promise<JobRow | null> {
  const queuedJobs = await queryMany<JobRow>(
    db,
    `SELECT *
     FROM jobs
     WHERE status = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [JOB_STATE.QUEUED, limit],
  );

  for (const queuedJob of queuedJobs) {
    const locked = await tryAcquireJobExecutionLock(db, queuedJob.id);

    if (locked) {
      return queuedJob;
    }
  }

  return null;
}
