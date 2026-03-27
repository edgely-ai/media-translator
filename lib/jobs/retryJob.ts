import { calculateCredits } from "@/lib/credits/calculateCredits";
import { queryOne } from "@/lib/db/client";
import { getPostgresQueryExecutor } from "@/lib/db/postgres";
import { getJobById } from "@/lib/db/jobs";
import { listTargetsByJobId } from "@/lib/db/targets";
import {
  getRetryTargetLanguages,
  isRetryableStatus,
} from "@/lib/jobs/retryPlanning";
import type { JobStatus, RetryJobResponse } from "@/types/jobs";

type RouteErrorStatus = 403 | 404 | 409 | 500;

class RetryJobRouteError extends Error {
  constructor(
    public readonly status: RouteErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = "RetryJobRouteError";
  }
}

interface JobCreationRpcResult {
  job_id: string;
  status: JobStatus;
  output_mode: RetryJobResponse["outputMode"];
  duration_seconds: number;
  estimated_credits: number;
  reserved_credits: number;
  target_count: number;
}

async function createJobWithReservation(params: {
  profileId: string;
  sourceMediaPath: string;
  outputMode: RetryJobResponse["outputMode"];
  durationSeconds: number;
  estimatedCredits: number;
  reservedCredits: number;
  targetLanguages: string[];
  retryOfJobId: string;
}): Promise<JobCreationRpcResult> {
  const db = getPostgresQueryExecutor();

  const row = await queryOne<JobCreationRpcResult>(
    db,
    `SELECT *
     FROM create_job_with_credit_reservation(
       $1::uuid,
       $2::text,
       $3::text,
       $4::integer,
       $5::integer,
       $6::integer,
       $7::text[],
       $8::uuid
     )`,
    [
      params.profileId,
      params.sourceMediaPath,
      params.outputMode,
      params.durationSeconds,
      params.estimatedCredits,
      params.reservedCredits,
      params.targetLanguages,
      params.retryOfJobId,
    ],
  );

  if (!row) {
    throw new RetryJobRouteError(500, "Retry job creation did not return a job.");
  }

  return row;
}

export async function createOwnedRetryAttempt(
  profileId: string,
  jobId: string,
): Promise<RetryJobResponse> {
  const db = getPostgresQueryExecutor();
  const job = await getJobById(db, jobId);

  if (!job) {
    throw new RetryJobRouteError(404, "Job was not found.");
  }

  if (job.profile_id !== profileId) {
    throw new RetryJobRouteError(403, "You do not own this job.");
  }

  if (!isRetryableStatus(job.status)) {
    throw new RetryJobRouteError(
      409,
      "Only failed or partial-success jobs can be retried.",
    );
  }

  if (!job.duration_seconds) {
    throw new RetryJobRouteError(
      409,
      "Retry requires a job duration so credits can be reserved safely.",
    );
  }

  const targets = await listTargetsByJobId(db, job.id);
  const targetLanguages = getRetryTargetLanguages(job.status, targets);

  if (targetLanguages.length === 0) {
    throw new RetryJobRouteError(
      409,
      "This job has no failed targets to retry.",
    );
  }

  const estimatedCredits = calculateCredits({
    durationSeconds: job.duration_seconds,
    targetCount: targetLanguages.length,
    outputMode: job.output_mode,
  });

  console.info("[jobs] retry requested", {
    original_job_id: job.id,
    original_status: job.status,
    retried_target_languages: targetLanguages,
  });

  const created = await createJobWithReservation({
    profileId,
    sourceMediaPath: job.source_media_path,
    outputMode: job.output_mode,
    durationSeconds: job.duration_seconds,
    estimatedCredits,
    reservedCredits: estimatedCredits,
    targetLanguages,
    retryOfJobId: job.id,
  });

  console.info("[jobs] retry created", {
    original_job_id: job.id,
    retry_job_id: created.job_id,
    retried_target_languages: targetLanguages,
  });

  return {
    jobId: created.job_id,
    status: created.status,
    outputMode: created.output_mode,
    storageBucket: "media",
    storagePath: job.source_media_path,
    durationSeconds: created.duration_seconds,
    targetLanguages,
    estimatedCredits: created.estimated_credits,
    reservedCredits: created.reserved_credits,
    targetCount: created.target_count,
    retryOfJobId: job.id,
    retriedTargetLanguages: targetLanguages,
  };
}

export function isRetryJobRouteError(error: unknown): error is RetryJobRouteError {
  return error instanceof RetryJobRouteError;
}
