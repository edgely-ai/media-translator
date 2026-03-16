import { randomUUID } from "node:crypto";
import { extname } from "node:path";

export const MAX_UPLOAD_SIZE_BYTES = 500 * 1024 * 1024;
export const MAX_MEDIA_DURATION_SECONDS = 5 * 60;

const ALLOWED_MIME_TYPES = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

const ALLOWED_EXTENSIONS = new Set([
  ".m4a",
  ".mov",
  ".mp3",
  ".mp4",
  ".wav",
  ".webm",
]);

export interface UploadInitRequest {
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds?: number | null;
}

export interface UploadInitResponse {
  uploadId: string;
  storageBucket: "media";
  storagePath: string;
  maxFileSizeBytes: number;
  acceptedMimeTypes: string[];
}

export interface UploadValidationResult {
  ok: boolean;
  message?: string;
}

function normalizeFilename(filename: string): string {
  return filename.trim().replace(/\s+/g, "-").replace(/[^A-Za-z0-9._-]/g, "");
}

function validateFilename(filename: string): UploadValidationResult {
  const normalized = normalizeFilename(filename);

  if (!normalized) {
    return { ok: false, message: "filename is required" };
  }

  if (normalized.length > 200) {
    return { ok: false, message: "filename is too long" };
  }

  const extension = extname(normalized).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return {
      ok: false,
      message: "filename extension is not supported",
    };
  }

  return { ok: true };
}

function validateMimeType(mimeType: string): UploadValidationResult {
  if (!mimeType || !ALLOWED_MIME_TYPES.has(mimeType)) {
    return { ok: false, message: "mimeType is not supported" };
  }

  return { ok: true };
}

function validateFileSize(fileSizeBytes: number): UploadValidationResult {
  if (!Number.isFinite(fileSizeBytes) || fileSizeBytes <= 0) {
    return { ok: false, message: "fileSizeBytes must be greater than zero" };
  }

  if (fileSizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return {
      ok: false,
      message: `fileSizeBytes exceeds ${MAX_UPLOAD_SIZE_BYTES} bytes`,
    };
  }

  return { ok: true };
}

function validateDuration(
  durationSeconds: number | null | undefined,
): UploadValidationResult {
  if (durationSeconds == null) {
    return { ok: true };
  }

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return { ok: false, message: "durationSeconds must be greater than zero" };
  }

  if (durationSeconds > MAX_MEDIA_DURATION_SECONDS) {
    return {
      ok: false,
      message: `durationSeconds exceeds ${MAX_MEDIA_DURATION_SECONDS} seconds`,
    };
  }

  return { ok: true };
}

export function validateUploadInitRequest(
  input: UploadInitRequest,
): UploadValidationResult {
  const filenameResult = validateFilename(input.filename);

  if (!filenameResult.ok) {
    return filenameResult;
  }

  const mimeTypeResult = validateMimeType(input.mimeType);

  if (!mimeTypeResult.ok) {
    return mimeTypeResult;
  }

  const fileSizeResult = validateFileSize(input.fileSizeBytes);

  if (!fileSizeResult.ok) {
    return fileSizeResult;
  }

  return validateDuration(input.durationSeconds);
}

export function buildUploadInitResponse(
  input: UploadInitRequest,
): UploadInitResponse {
  const normalizedFilename = normalizeFilename(input.filename);
  const uploadId = randomUUID();
  const extension = extname(normalizedFilename).toLowerCase();

  return {
    uploadId,
    storageBucket: "media",
    storagePath: `uploads/${uploadId}/source${extension}`,
    maxFileSizeBytes: MAX_UPLOAD_SIZE_BYTES,
    acceptedMimeTypes: [...ALLOWED_MIME_TYPES].sort(),
  };
}
