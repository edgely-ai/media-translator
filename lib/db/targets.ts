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
  const hasSubtitlePath = Object.prototype.hasOwnProperty.call(
    input,
    "subtitlePath",
  );
  const hasDubbedAudioPath = Object.prototype.hasOwnProperty.call(
    input,
    "dubbedAudioPath",
  );
  const hasDubbedVideoPath = Object.prototype.hasOwnProperty.call(
    input,
    "dubbedVideoPath",
  );
  const hasProviderJobId = Object.prototype.hasOwnProperty.call(
    input,
    "providerJobId",
  );
  const hasErrorMessage = Object.prototype.hasOwnProperty.call(
    input,
    "errorMessage",
  );
  const hasCompletedAt = Object.prototype.hasOwnProperty.call(
    input,
    "completedAt",
  );

  return requireOne<JobTargetRow>(
    db,
    `UPDATE job_targets
     SET status = $2,
         subtitle_path = CASE WHEN $3 THEN $4 ELSE subtitle_path END,
         dubbed_audio_path = CASE WHEN $5 THEN $6 ELSE dubbed_audio_path END,
         dubbed_video_path = CASE WHEN $7 THEN $8 ELSE dubbed_video_path END,
         provider_job_id = CASE WHEN $9 THEN $10 ELSE provider_job_id END,
         error_message = CASE WHEN $11 THEN $12 ELSE error_message END,
         completed_at = CASE WHEN $13 THEN $14 ELSE completed_at END,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      input.targetId,
      input.status,
      hasSubtitlePath,
      input.subtitlePath ?? null,
      hasDubbedAudioPath,
      input.dubbedAudioPath ?? null,
      hasDubbedVideoPath,
      input.dubbedVideoPath ?? null,
      hasProviderJobId,
      input.providerJobId ?? null,
      hasErrorMessage,
      input.errorMessage ?? null,
      hasCompletedAt,
      input.completedAt ?? null,
    ],
    `Job target ${input.targetId} was not found.`,
  );
}
