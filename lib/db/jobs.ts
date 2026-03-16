import { type DatabaseExecutor, queryMany, queryOne, requireOne } from "@/lib/db/client";
import type { JobRow, JobStatus, OutputMode } from "@/types/jobs";

export interface CreateJobInput {
  profileId: string;
  planId?: string | null;
  sourceMediaPath: string;
  outputMode: OutputMode;
  durationSeconds?: number | null;
  estimatedCredits?: number;
  reservedCredits?: number;
}

export interface UpdateJobStatusInput {
  jobId: string;
  status: JobStatus;
  errorMessage?: string | null;
  completedAt?: string | null;
}

export interface UpdateJobMediaPathsInput {
  jobId: string;
  normalizedMediaPath?: string | null;
  extractedAudioPath?: string | null;
  sourceLanguage?: string | null;
}

export async function createJob(
  db: DatabaseExecutor,
  input: CreateJobInput,
): Promise<JobRow> {
  return requireOne<JobRow>(
    db,
    `INSERT INTO jobs (
       profile_id,
       plan_id,
       source_media_path,
       output_mode,
       duration_seconds,
       estimated_credits,
       reserved_credits
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.profileId,
      input.planId ?? null,
      input.sourceMediaPath,
      input.outputMode,
      input.durationSeconds ?? null,
      input.estimatedCredits ?? 0,
      input.reservedCredits ?? 0,
    ],
    "Failed to create job.",
  );
}

export async function getJobById(
  db: DatabaseExecutor,
  jobId: string,
): Promise<JobRow | null> {
  return queryOne<JobRow>(db, "SELECT * FROM jobs WHERE id = $1", [jobId]);
}

export async function listJobsByProfileId(
  db: DatabaseExecutor,
  profileId: string,
  limit = 25,
): Promise<JobRow[]> {
  return queryMany<JobRow>(
    db,
    `SELECT *
     FROM jobs
     WHERE profile_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [profileId, limit],
  );
}

export async function updateJobStatus(
  db: DatabaseExecutor,
  input: UpdateJobStatusInput,
): Promise<JobRow> {
  return requireOne<JobRow>(
    db,
    `UPDATE jobs
     SET status = $2,
         error_message = $3,
         completed_at = $4,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      input.jobId,
      input.status,
      input.errorMessage ?? null,
      input.completedAt ?? null,
    ],
    `Job ${input.jobId} was not found.`,
  );
}

export async function updateJobMediaPaths(
  db: DatabaseExecutor,
  input: UpdateJobMediaPathsInput,
): Promise<JobRow> {
  return requireOne<JobRow>(
    db,
    `UPDATE jobs
     SET normalized_media_path = COALESCE($2, normalized_media_path),
         extracted_audio_path = COALESCE($3, extracted_audio_path),
         source_language = COALESCE($4, source_language),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      input.jobId,
      input.normalizedMediaPath ?? null,
      input.extractedAudioPath ?? null,
      input.sourceLanguage ?? null,
    ],
    `Job ${input.jobId} was not found.`,
  );
}
