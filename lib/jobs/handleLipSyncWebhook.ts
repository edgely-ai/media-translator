import { JOB_STATE, TARGET_STATE } from "@/lib/jobs/jobStates";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type { JobStatus, JobTargetRow } from "@/types/jobs";
import type { LipSyncWebhookPayload } from "@/types/video";

type WebhookErrorStatus = 400 | 401 | 404 | 422 | 500;

type JobTargetWebhookRow = Pick<
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
>;

class LipSyncWebhookError extends Error {
  constructor(
    public readonly status: WebhookErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = "LipSyncWebhookError";
  }
}

export interface HandleLipSyncWebhookResult {
  jobId: string;
  targetId: string;
  targetLanguage: string;
  targetStatus: JobTargetRow["status"];
  jobStatus: JobStatus;
}

function requireWebhookSecret(): string {
  const secret = process.env.LIPSYNC_WEBHOOK_SECRET;

  if (!secret) {
    throw new LipSyncWebhookError(
      500,
      "Lip-sync webhook secret is not configured.",
    );
  }

  return secret;
}

function validateWebhookSecret(request: Request): void {
  const headerSecret = request.headers.get("x-lipsync-webhook-secret");

  if (!headerSecret || headerSecret !== requireWebhookSecret()) {
    throw new LipSyncWebhookError(401, "Webhook signature is invalid.");
  }
}

function isLipSyncWebhookPayload(value: unknown): value is LipSyncWebhookPayload {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  const hasValidStatus =
    candidate.status === "completed" || candidate.status === "failed";
  const hasValidDubbedVideoPath =
    typeof candidate.dubbedVideoPath === "undefined" ||
    candidate.dubbedVideoPath === null ||
    typeof candidate.dubbedVideoPath === "string";
  const hasValidErrorMessage =
    typeof candidate.errorMessage === "undefined" ||
    candidate.errorMessage === null ||
    typeof candidate.errorMessage === "string";

  return (
    typeof candidate.providerJobId === "string" &&
    hasValidStatus &&
    hasValidDubbedVideoPath &&
    hasValidErrorMessage
  );
}

function parseWebhookBody(body: unknown): LipSyncWebhookPayload {
  if (!isLipSyncWebhookPayload(body)) {
    throw new LipSyncWebhookError(
      422,
      "Webhook body must include providerJobId and a valid status.",
    );
  }

  if (!body.providerJobId.trim()) {
    throw new LipSyncWebhookError(422, "providerJobId is required.");
  }

  if (body.status === "completed" && !body.dubbedVideoPath?.trim()) {
    throw new LipSyncWebhookError(
      422,
      "dubbedVideoPath is required when lip-sync completes successfully.",
    );
  }

  return {
    providerJobId: body.providerJobId.trim(),
    status: body.status,
    dubbedVideoPath: body.dubbedVideoPath?.trim() ?? null,
    errorMessage: body.errorMessage?.trim() ?? null,
  };
}

function reconcileJobStatus(targets: JobTargetWebhookRow[]): JobStatus {
  const hasPendingTargets = targets.some(
    (target) => target.status === TARGET_STATE.LIPSYNC_REQUESTED,
  );

  if (hasPendingTargets) {
    return JOB_STATE.LIP_SYNC_PENDING;
  }

  const completedCount = targets.filter(
    (target) => target.status === TARGET_STATE.COMPLETED,
  ).length;
  const failedCount = targets.filter(
    (target) => target.status === TARGET_STATE.FAILED,
  ).length;

  if (completedCount === targets.length) {
    return JOB_STATE.COMPLETED;
  }

  if (completedCount > 0) {
    return JOB_STATE.PARTIAL_SUCCESS;
  }

  const hasFallbackOutputs = targets.some(
    (target) => target.dubbed_audio_path || target.subtitle_path,
  );

  if (failedCount === targets.length && hasFallbackOutputs) {
    return JOB_STATE.PARTIAL_SUCCESS;
  }

  return JOB_STATE.FAILED;
}

export async function handleLipSyncWebhook(
  request: Request,
  body: unknown,
): Promise<HandleLipSyncWebhookResult> {
  validateWebhookSecret(request);

  const payload = parseWebhookBody(body);
  const supabase = createSupabaseAdminClient();

  const { data: target, error: targetError } = await supabase
    .from("job_targets")
    .select(
      "id, job_id, target_language, status, subtitle_path, dubbed_audio_path, dubbed_video_path, provider_job_id, error_message",
    )
    .eq("provider_job_id", payload.providerJobId)
    .maybeSingle<JobTargetWebhookRow>();

  if (targetError) {
    throw new LipSyncWebhookError(500, "Failed to look up lip-sync target.");
  }

  if (!target) {
    throw new LipSyncWebhookError(404, "Unknown providerJobId.");
  }

  const nextTargetStatus =
    payload.status === TARGET_STATE.COMPLETED
      ? TARGET_STATE.COMPLETED
      : TARGET_STATE.FAILED;
  const completedAt =
    payload.status === TARGET_STATE.COMPLETED ? new Date().toISOString() : null;

  const { error: updateTargetError } = await supabase
    .from("job_targets")
    .update({
      status: nextTargetStatus,
      dubbed_video_path:
        payload.status === TARGET_STATE.COMPLETED ? payload.dubbedVideoPath : null,
      error_message:
        payload.status === TARGET_STATE.COMPLETED
          ? null
          : payload.errorMessage ?? "Lip-sync rendering failed.",
      completed_at: completedAt,
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.id);

  if (updateTargetError) {
    throw new LipSyncWebhookError(500, "Failed to update lip-sync target.");
  }

  const { data: targets, error: targetsError } = await supabase
    .from("job_targets")
    .select(
      "id, job_id, target_language, status, subtitle_path, dubbed_audio_path, dubbed_video_path, provider_job_id, error_message",
    )
    .eq("job_id", target.job_id)
    .returns<JobTargetWebhookRow[]>();

  if (targetsError || !targets) {
    throw new LipSyncWebhookError(500, "Failed to reconcile job targets.");
  }

  const nextJobStatus = reconcileJobStatus(targets);

  const { error: updateJobError } = await supabase
    .from("jobs")
    .update({
      status: nextJobStatus,
      error_message:
        nextJobStatus === JOB_STATE.COMPLETED
          ? null
          : payload.status === TARGET_STATE.FAILED
            ? payload.errorMessage ?? "Lip-sync rendering failed."
            : null,
      completed_at:
        nextJobStatus === JOB_STATE.COMPLETED ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", target.job_id);

  if (updateJobError) {
    throw new LipSyncWebhookError(500, "Failed to update job status.");
  }

  return {
    jobId: target.job_id,
    targetId: target.id,
    targetLanguage: target.target_language,
    targetStatus: nextTargetStatus,
    jobStatus: nextJobStatus,
  };
}

export function isLipSyncWebhookError(
  error: unknown,
): error is LipSyncWebhookError {
  return error instanceof LipSyncWebhookError;
}
