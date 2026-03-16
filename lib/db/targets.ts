import { type DatabaseExecutor, queryMany, queryOne, requireOne } from "@/lib/db/client";
import type { JobTargetRow, JobTargetStatus } from "@/types/jobs";

export interface CreateJobTargetInput {
  jobId: string;
  targetLanguage: string;
}

export interface UpdateJobTargetStatusInput {
  targetId: string;
  status: JobTargetStatus;
  subtitlePath?: string | null;
  dubbedAudioPath?: string | null;
  dubbedVideoPath?: string | null;
  providerJobId?: string | null;
  errorMessage?: string | null;
  completedAt?: string | null;
}

export async function createJobTarget(
  db: DatabaseExecutor,
  input: CreateJobTargetInput,
): Promise<JobTargetRow> {
  return requireOne<JobTargetRow>(
    db,
    `INSERT INTO job_targets (job_id, target_language)
     VALUES ($1, $2)
     RETURNING *`,
    [input.jobId, input.targetLanguage],
    "Failed to create job target.",
  );
}

export async function getJobTargetById(
  db: DatabaseExecutor,
  targetId: string,
): Promise<JobTargetRow | null> {
  return queryOne<JobTargetRow>(
    db,
    "SELECT * FROM job_targets WHERE id = $1",
    [targetId],
  );
}

export async function getJobTargetByProviderJobId(
  db: DatabaseExecutor,
  providerJobId: string,
): Promise<JobTargetRow | null> {
  return queryOne<JobTargetRow>(
    db,
    "SELECT * FROM job_targets WHERE provider_job_id = $1",
    [providerJobId],
  );
}

export async function listTargetsByJobId(
  db: DatabaseExecutor,
  jobId: string,
): Promise<JobTargetRow[]> {
  return queryMany<JobTargetRow>(
    db,
    `SELECT *
     FROM job_targets
     WHERE job_id = $1
     ORDER BY created_at ASC`,
    [jobId],
  );
}

export async function updateJobTargetStatus(
  db: DatabaseExecutor,
  input: UpdateJobTargetStatusInput,
): Promise<JobTargetRow> {
  return requireOne<JobTargetRow>(
    db,
    `UPDATE job_targets
     SET status = $2,
         subtitle_path = COALESCE($3, subtitle_path),
         dubbed_audio_path = COALESCE($4, dubbed_audio_path),
         dubbed_video_path = COALESCE($5, dubbed_video_path),
         provider_job_id = COALESCE($6, provider_job_id),
         error_message = COALESCE($7, error_message),
         completed_at = COALESCE($8, completed_at),
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      input.targetId,
      input.status,
      input.subtitlePath ?? null,
      input.dubbedAudioPath ?? null,
      input.dubbedVideoPath ?? null,
      input.providerJobId ?? null,
      input.errorMessage ?? null,
      input.completedAt ?? null,
    ],
    `Job target ${input.targetId} was not found.`,
  );
}
