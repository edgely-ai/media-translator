import { TARGET_STATE } from "@/lib/jobs/jobStates";
import { reconcileJobOutputs } from "@/lib/jobs/reconcileJobOutputs";
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

  const reconciliation = await reconcileJobOutputs(target.job_id);

  return {
    jobId: target.job_id,
    targetId: target.id,
    targetLanguage: target.target_language,
    targetStatus: nextTargetStatus,
    jobStatus: reconciliation.status,
  };
}

export function isLipSyncWebhookError(
  error: unknown,
): error is LipSyncWebhookError {
  return error instanceof LipSyncWebhookError;
}
