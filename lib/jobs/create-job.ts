import { basename, extname, posix } from "node:path";

import type { User } from "@supabase/supabase-js";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import {
  ALLOWED_UPLOAD_MIME_TYPES,
  MAX_MEDIA_DURATION_SECONDS,
  UPLOAD_STORAGE_BUCKET,
  getNormalizedUploadFilename,
  isSupportedUploadExtension,
  isSupportedUploadMimeType,
} from "@/lib/storage/upload-init";
import type {
  CreateJobRequest,
  CreateJobResponse,
  JobStatus,
  OutputMode,
} from "@/types/jobs";
import { OUTPUT_MODES } from "@/types/jobs";

const TARGET_LANGUAGE_PATTERN = /^[a-z]{2,3}(?:-[a-z]{2})?$/;
const VIDEO_MIME_PREFIX = "video/";

type RouteErrorStatus = 401 | 403 | 404 | 409 | 422 | 500;

class CreateJobRouteError extends Error {
  constructor(
    public readonly status: RouteErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = "CreateJobRouteError";
  }
}

interface JobCreationRpcResult {
  job_id: string;
  status: JobStatus;
  output_mode: OutputMode;
  duration_seconds: number;
  estimated_credits: number;
  reserved_credits: number;
  target_count: number;
}

function isCreateJobRequest(value: unknown): value is CreateJobRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.storageBucket === "string" &&
    typeof candidate.storagePath === "string" &&
    typeof candidate.sourceFilename === "string" &&
    typeof candidate.sourceMimeType === "string" &&
    typeof candidate.durationSeconds === "number" &&
    typeof candidate.outputMode === "string" &&
    Array.isArray(candidate.targetLanguages) &&
    candidate.targetLanguages.every((language) => typeof language === "string")
  );
}

function parseUploadPath(storagePath: string): {
  userId: string;
  extension: string;
} | null {
  const match = /^uploads\/([^/]+)\/([^/]+)\/source(\.[A-Za-z0-9]+)$/.exec(
    storagePath,
  );

  if (!match) {
    return null;
  }

  const [, userId, , extension] = match;

  return {
    userId,
    extension: extension.toLowerCase(),
  };
}

function normalizeAndValidateTargetLanguages(
  targetLanguages: string[],
): string[] {
  const normalized = targetLanguages
    .map((language) => language.trim().toLowerCase())
    .filter(Boolean);

  if (normalized.length === 0) {
    throw new CreateJobRouteError(
      422,
      "targetLanguages must contain at least one language.",
    );
  }

  const unique = [...new Set(normalized)];

  const invalid = unique.find(
    (language) => !TARGET_LANGUAGE_PATTERN.test(language),
  );

  if (invalid) {
    throw new CreateJobRouteError(
      422,
      `target language "${invalid}" is not valid.`,
    );
  }

  return unique;
}

function estimateCredits(
  durationSeconds: number,
  targetCount: number,
  outputMode: OutputMode,
): number {
  const durationMinutes = Math.ceil(durationSeconds / 60);
  const multiplier =
    outputMode === "subtitles" ? 1 : outputMode === "dubbed_audio" ? 1.5 : 3;

  return Math.ceil(durationMinutes * targetCount * multiplier);
}

function validateCreateJobRequest(
  input: CreateJobRequest,
  user: User,
): Omit<CreateJobResponse, "jobId" | "status"> {
  if (input.storageBucket !== UPLOAD_STORAGE_BUCKET) {
    throw new CreateJobRouteError(403, "storageBucket is not allowed.");
  }

  const uploadPath = parseUploadPath(input.storagePath);

  if (!uploadPath) {
    throw new CreateJobRouteError(
      403,
      "storagePath must match the server-owned upload path format.",
    );
  }

  if (uploadPath.userId !== user.id) {
    throw new CreateJobRouteError(
      403,
      "storagePath does not belong to the authenticated user.",
    );
  }

  if (!isSupportedUploadExtension(uploadPath.extension)) {
    throw new CreateJobRouteError(422, "storagePath extension is not supported.");
  }

  const normalizedFilename = getNormalizedUploadFilename(input.sourceFilename);

  if (!normalizedFilename) {
    throw new CreateJobRouteError(422, "sourceFilename is required.");
  }

  const sourceExtension = extname(normalizedFilename).toLowerCase();

  if (!sourceExtension || !isSupportedUploadExtension(sourceExtension)) {
    throw new CreateJobRouteError(
      422,
      "sourceFilename extension is not supported.",
    );
  }

  if (sourceExtension !== uploadPath.extension) {
    throw new CreateJobRouteError(
      422,
      "sourceFilename extension must match storagePath.",
    );
  }

  if (!isSupportedUploadMimeType(input.sourceMimeType)) {
    throw new CreateJobRouteError(
      422,
      `sourceMimeType must be one of: ${ALLOWED_UPLOAD_MIME_TYPES.join(", ")}`,
    );
  }

  if (
    !Number.isFinite(input.durationSeconds) ||
    input.durationSeconds <= 0 ||
    input.durationSeconds > MAX_MEDIA_DURATION_SECONDS
  ) {
    throw new CreateJobRouteError(
      422,
      `durationSeconds must be greater than 0 and at most ${MAX_MEDIA_DURATION_SECONDS}.`,
    );
  }

  if (!OUTPUT_MODES.includes(input.outputMode)) {
    throw new CreateJobRouteError(422, "outputMode is invalid.");
  }

  if (
    input.outputMode === "lip_sync" &&
    !input.sourceMimeType.startsWith(VIDEO_MIME_PREFIX)
  ) {
    throw new CreateJobRouteError(
      422,
      "lip_sync output requires a video source file.",
    );
  }

  const targetLanguages = normalizeAndValidateTargetLanguages(
    input.targetLanguages,
  );
  const estimatedCredits = estimateCredits(
    input.durationSeconds,
    targetLanguages.length,
    input.outputMode,
  );

  return {
    outputMode: input.outputMode,
    storageBucket: UPLOAD_STORAGE_BUCKET,
    storagePath: input.storagePath,
    durationSeconds: input.durationSeconds,
    targetLanguages,
    estimatedCredits,
    reservedCredits: estimatedCredits,
    targetCount: targetLanguages.length,
  };
}

async function verifySourceObjectExists(
  storageBucket: typeof UPLOAD_STORAGE_BUCKET,
  storagePath: string,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const folder = posix.dirname(storagePath);
  const filename = basename(storagePath);

  const { data, error } = await supabase.storage
    .from(storageBucket)
    .list(folder, { search: filename, limit: 100 });

  if (error) {
    throw new CreateJobRouteError(
      500,
      "Failed to verify source object in storage.",
    );
  }

  const found = (data ?? []).some((entry) => entry.name === filename);

  if (!found) {
    throw new CreateJobRouteError(404, "Source object was not found.");
  }
}

async function createJobWithReservation(
  profileId: string,
  request: Omit<CreateJobResponse, "jobId" | "status">,
): Promise<JobCreationRpcResult> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.rpc(
    "create_job_with_credit_reservation",
    {
      p_profile_id: profileId,
      p_source_media_path: request.storagePath,
      p_output_mode: request.outputMode,
      p_duration_seconds: request.durationSeconds,
      p_estimated_credits: request.estimatedCredits,
      p_reserved_credits: request.reservedCredits,
      p_target_languages: request.targetLanguages,
    },
  );

  if (error) {
    if (error.message.includes("insufficient_credits")) {
      throw new CreateJobRouteError(
        409,
        "Insufficient credits for this job.",
      );
    }

    if (error.code === "23503") {
      throw new CreateJobRouteError(
        409,
        "Authenticated user profile is not ready for job creation.",
      );
    }

    throw new CreateJobRouteError(500, "Failed to create job.");
  }

  const row = Array.isArray(data) ? data[0] : null;

  if (!row) {
    throw new CreateJobRouteError(500, "Job creation returned no result.");
  }

  return row as JobCreationRpcResult;
}

export function parseCreateJobBody(body: unknown): CreateJobRequest {
  if (!isCreateJobRequest(body)) {
    throw new CreateJobRouteError(
      422,
      "Request body must include storageBucket, storagePath, sourceFilename, sourceMimeType, durationSeconds, outputMode, and targetLanguages.",
    );
  }

  return body;
}

export async function createJobFromUploadedSource(
  body: unknown,
  user: User,
): Promise<CreateJobResponse> {
  const request = parseCreateJobBody(body);
  const validated = validateCreateJobRequest(request, user);

  await verifySourceObjectExists(validated.storageBucket, validated.storagePath);

  const created = await createJobWithReservation(user.id, validated);

  return {
    jobId: created.job_id,
    status: created.status,
    outputMode: validated.outputMode,
    storageBucket: validated.storageBucket,
    storagePath: validated.storagePath,
    durationSeconds: validated.durationSeconds,
    targetLanguages: validated.targetLanguages,
    estimatedCredits: validated.estimatedCredits,
    reservedCredits: validated.reservedCredits,
    targetCount: validated.targetCount,
  };
}

export function isCreateJobRouteError(
  error: unknown,
): error is CreateJobRouteError {
  return error instanceof CreateJobRouteError;
}
