export const OUTPUT_MODES = [
  "subtitles",
  "dubbed_audio",
  "lip_sync",
] as const;

export type OutputMode = (typeof OUTPUT_MODES)[number];

export const JOB_STATUSES = [
  "created",
  "queued",
  "normalizing",
  "extracting_audio",
  "transcribing",
  "transcript_ready",
  "translating",
  "generating_subtitles",
  "generating_dubbed_audio",
  "lip_sync_pending",
  "completed",
  "partial_success",
  "failed",
  "canceled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_TARGET_STATUSES = [
  "pending",
  "translating",
  "subtitles_ready",
  "audio_ready",
  "lipsync_requested",
  "completed",
  "failed",
] as const;

export type JobTargetStatus = (typeof JOB_TARGET_STATUSES)[number];

export interface JobRow {
  id: string;
  profile_id: string;
  plan_id: string | null;
  source_media_path: string;
  normalized_media_path: string | null;
  extracted_audio_path: string | null;
  source_language: string | null;
  output_mode: OutputMode;
  status: JobStatus;
  duration_seconds: number | null;
  estimated_credits: number;
  reserved_credits: number;
  finalized_credits: number;
  error_message: string | null;
  cancel_requested_at: string | null;
  cancel_reason: string | null;
  canceled_at: string | null;
  retry_of_job_id: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface JobTargetRow {
  id: string;
  job_id: string;
  target_language: string;
  status: JobTargetStatus;
  subtitle_path: string | null;
  dubbed_audio_path: string | null;
  dubbed_video_path: string | null;
  provider_job_id: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface CreateJobRequest {
  storageBucket: string;
  storagePath: string;
  sourceFilename: string;
  sourceMimeType: string;
  durationSeconds: number;
  outputMode: OutputMode;
  targetLanguages: string[];
}

export interface CreateJobResponse {
  jobId: string;
  status: JobStatus;
  outputMode: OutputMode;
  storageBucket: "media";
  storagePath: string;
  durationSeconds: number;
  targetLanguages: string[];
  estimatedCredits: number;
  reservedCredits: number;
  targetCount: number;
}

export interface CancelJobResponse {
  jobId: string;
  status: JobStatus;
  cancelRequestedAt: string;
  cancelReason: string | null;
}

export interface RetryJobResponse extends CreateJobResponse {
  retryOfJobId: string;
  retriedTargetLanguages: string[];
}
