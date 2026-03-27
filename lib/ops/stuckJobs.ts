import { queryMany, type DatabaseExecutor } from "@/lib/db/client";
import type { JobStatus } from "@/types/jobs";

export const ACTIVE_JOB_STATUSES: JobStatus[] = [
  "queued",
  "normalizing",
  "extracting_audio",
  "transcribing",
  "translating",
  "generating_subtitles",
  "generating_dubbed_audio",
  "lip_sync_pending",
];

export interface PotentiallyStuckJob {
  id: string;
  profile_id: string;
  status: JobStatus;
  output_mode: string;
  updated_at: string;
  created_at: string;
  cancel_requested_at: string | null;
  age_seconds: number;
}

export interface ListPotentiallyStuckJobsInput {
  olderThanMs: number;
  limit?: number;
}

export async function listPotentiallyStuckJobs(
  db: DatabaseExecutor,
  input: ListPotentiallyStuckJobsInput,
): Promise<PotentiallyStuckJob[]> {
  const limit = input.limit ?? 25;
  const olderThanSeconds = Math.max(1, Math.floor(input.olderThanMs / 1000));

  return queryMany<PotentiallyStuckJob>(
    db,
    `SELECT
       id,
       profile_id,
       status,
       output_mode,
       updated_at,
       created_at,
       cancel_requested_at,
       GREATEST(EXTRACT(EPOCH FROM (now() - updated_at)), 0)::int AS age_seconds
     FROM jobs
     WHERE status = ANY($1::text[])
       AND updated_at <= now() - make_interval(secs => $2::int)
     ORDER BY updated_at ASC
     LIMIT $3`,
    [ACTIVE_JOB_STATUSES, olderThanSeconds, limit],
  );
}
