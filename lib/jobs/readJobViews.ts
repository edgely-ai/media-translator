import { basename } from "node:path";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { JobRow, JobStatus, JobTargetRow, JobTargetStatus, OutputMode } from "@/types/jobs";

type RouteErrorStatus = 401 | 403 | 404 | 500;

type OwnedJobSummaryRow = Pick<
  JobRow,
  | "id"
  | "profile_id"
  | "source_media_path"
  | "output_mode"
  | "status"
  | "created_at"
  | "updated_at"
  | "completed_at"
  | "error_message"
>;

type OwnedJobDetailRow = Pick<
  JobRow,
  | "id"
  | "profile_id"
  | "source_media_path"
  | "normalized_media_path"
  | "extracted_audio_path"
  | "source_language"
  | "output_mode"
  | "status"
  | "duration_seconds"
  | "estimated_credits"
  | "reserved_credits"
  | "finalized_credits"
  | "error_message"
  | "cancel_requested_at"
  | "cancel_reason"
  | "retry_of_job_id"
  | "created_at"
  | "updated_at"
  | "completed_at"
>;

type JobTargetArtifactRow = Pick<
  JobTargetRow,
  | "id"
  | "job_id"
  | "target_language"
  | "status"
  | "subtitle_path"
  | "dubbed_audio_path"
  | "dubbed_video_path"
  | "provider_job_id"
  | "error_message"
  | "created_at"
  | "updated_at"
  | "completed_at"
>;

export interface DashboardRecentJobView {
  id: string;
  sourceName: string;
  status: JobStatus;
  outputMode: OutputMode;
  targetCount: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
}

export interface JobTargetArtifactView {
  id: string;
  targetLanguage: string;
  status: JobTargetStatus;
  subtitlePath: string | null;
  subtitleUrl: string | null;
  dubbedAudioPath: string | null;
  dubbedAudioUrl: string | null;
  dubbedVideoPath: string | null;
  dubbedVideoUrl: string | null;
  providerJobId: string | null;
  errorMessage: string | null;
  completedAt: string | null;
}

export interface JobDetailView {
  id: string;
  sourceName: string;
  sourceMediaPath: string;
  normalizedMediaPath: string | null;
  extractedAudioPath: string | null;
  sourceLanguage: string | null;
  outputMode: OutputMode;
  status: JobStatus;
  durationSeconds: number | null;
  estimatedCredits: number;
  reservedCredits: number;
  finalizedCredits: number;
  errorMessage: string | null;
  cancelRequestedAt: string | null;
  cancelReason: string | null;
  retryOfJobId: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  targets: JobTargetArtifactView[];
}

class JobReadRouteError extends Error {
  constructor(
    public readonly status: RouteErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = "JobReadRouteError";
  }
}

function toSourceName(sourceMediaPath: string): string {
  return basename(sourceMediaPath);
}

async function createSignedUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from("media")
    .createSignedUrl(storagePath, 60 * 60);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

async function requireOwnedJob(
  profileId: string,
  jobId: string,
): Promise<OwnedJobDetailRow> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .select(
      "id, profile_id, source_media_path, normalized_media_path, extracted_audio_path, source_language, output_mode, status, duration_seconds, estimated_credits, reserved_credits, finalized_credits, error_message, cancel_requested_at, cancel_reason, retry_of_job_id, created_at, updated_at, completed_at",
    )
    .eq("id", jobId)
    .maybeSingle<OwnedJobDetailRow>();

  if (error) {
    throw new JobReadRouteError(500, "Failed to load job.");
  }

  if (!data) {
    throw new JobReadRouteError(404, "Job was not found.");
  }

  if (data.profile_id !== profileId) {
    throw new JobReadRouteError(403, "You do not own this job.");
  }

  return data;
}

export async function listRecentJobsForProfile(
  profileId: string,
  limit = 10,
): Promise<DashboardRecentJobView[]> {
  const supabase = createSupabaseAdminClient();
  const { data: jobs, error } = await supabase
    .from("jobs")
    .select(
      "id, profile_id, source_media_path, output_mode, status, created_at, updated_at, completed_at, error_message",
    )
    .eq("profile_id", profileId)
    .order("updated_at", { ascending: false })
    .limit(limit)
    .returns<OwnedJobSummaryRow[]>();

  if (error) {
    throw new JobReadRouteError(500, "Failed to load recent jobs.");
  }

  if (!jobs || jobs.length === 0) {
    return [];
  }

  const jobIds = jobs.map((job) => job.id);
  const { data: targets, error: targetsError } = await supabase
    .from("job_targets")
    .select("job_id")
    .in("job_id", jobIds);

  if (targetsError) {
    throw new JobReadRouteError(500, "Failed to load recent job targets.");
  }

  const targetCounts = new Map<string, number>();

  for (const target of targets ?? []) {
    const jobId = target.job_id as string;
    targetCounts.set(jobId, (targetCounts.get(jobId) ?? 0) + 1);
  }

  return jobs.map((job) => ({
    id: job.id,
    sourceName: toSourceName(job.source_media_path),
    status: job.status,
    outputMode: job.output_mode,
    targetCount: targetCounts.get(job.id) ?? 0,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    completedAt: job.completed_at,
  }));
}

export async function getJobDetailForProfile(
  profileId: string,
  jobId: string,
): Promise<JobDetailView> {
  const job = await requireOwnedJob(profileId, jobId);
  const supabase = createSupabaseAdminClient();
  const { data: targets, error } = await supabase
    .from("job_targets")
    .select(
      "id, job_id, target_language, status, subtitle_path, dubbed_audio_path, dubbed_video_path, provider_job_id, error_message, created_at, updated_at, completed_at",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
    .returns<JobTargetArtifactRow[]>();

  if (error) {
    throw new JobReadRouteError(500, "Failed to load job targets.");
  }

  const artifactTargets = await Promise.all(
    (targets ?? []).map(async (target) => ({
      id: target.id,
      targetLanguage: target.target_language,
      status: target.status,
      subtitlePath: target.subtitle_path,
      subtitleUrl: await createSignedUrl(target.subtitle_path),
      dubbedAudioPath: target.dubbed_audio_path,
      dubbedAudioUrl: await createSignedUrl(target.dubbed_audio_path),
      dubbedVideoPath: target.dubbed_video_path,
      dubbedVideoUrl: await createSignedUrl(target.dubbed_video_path),
      providerJobId: target.provider_job_id,
      errorMessage: target.error_message,
      completedAt: target.completed_at,
    })),
  );

  return {
    id: job.id,
    sourceName: toSourceName(job.source_media_path),
    sourceMediaPath: job.source_media_path,
    normalizedMediaPath: job.normalized_media_path,
    extractedAudioPath: job.extracted_audio_path,
    sourceLanguage: job.source_language,
    outputMode: job.output_mode,
    status: job.status,
    durationSeconds: job.duration_seconds,
    estimatedCredits: job.estimated_credits,
    reservedCredits: job.reserved_credits,
    finalizedCredits: job.finalized_credits,
    errorMessage: job.error_message,
    cancelRequestedAt: job.cancel_requested_at,
    cancelReason: job.cancel_reason,
    retryOfJobId: job.retry_of_job_id,
    createdAt: job.created_at,
    updatedAt: job.updated_at,
    completedAt: job.completed_at,
    targets: artifactTargets,
  };
}

export function isJobReadRouteError(error: unknown): error is JobReadRouteError {
  return error instanceof JobReadRouteError;
}
