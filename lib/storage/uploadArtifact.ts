import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { UPLOAD_STORAGE_BUCKET } from "@/lib/storage/upload-init";

export type ArtifactKind =
  | "normalized_media"
  | "extracted_audio"
  | "subtitle"
  | "dubbed_audio"
  | "lip_sync_video";

export interface UploadArtifactInput {
  jobId: string;
  localPath: string;
  storagePath: string;
  contentType: string;
  artifactKind: ArtifactKind;
  storageBucket?: string;
}

export interface UploadArtifactBytesInput {
  jobId: string;
  fileBytes: Uint8Array;
  storagePath: string;
  contentType: string;
  artifactKind: ArtifactKind;
  storageBucket?: string;
}

export function buildNormalizedMediaStoragePath(
  jobId: string,
  format: "mp4" | "wav",
): string {
  return join("media", jobId, `source.${format}`);
}

export function buildExtractedAudioStoragePath(jobId: string): string {
  return join("media", jobId, "audio.wav");
}

export function buildSubtitleStoragePath(
  jobId: string,
  targetLanguage: string,
): string {
  return join("media", jobId, "subtitles", `${targetLanguage}.srt`);
}

export function buildDubbedAudioStoragePath(
  jobId: string,
  targetLanguage: string,
  format: string,
): string {
  return join("media", jobId, "dubbed", `${targetLanguage}.${format}`);
}

export function buildLipSyncStoragePath(
  jobId: string,
  targetLanguage: string,
): string {
  return join("media", jobId, "lip_sync", `${targetLanguage}.mp4`);
}

export async function uploadArtifactBytesToStorage(
  input: UploadArtifactBytesInput,
): Promise<string> {
  const storageBucket = input.storageBucket ?? UPLOAD_STORAGE_BUCKET;

  console.info("[storage] artifact upload started", {
    job_id: input.jobId,
    artifact_kind: input.artifactKind,
    storage_bucket: storageBucket,
    storage_path: input.storagePath,
  });

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase.storage
    .from(storageBucket)
    .upload(input.storagePath, input.fileBytes, {
      upsert: true,
      contentType: input.contentType,
    });

  if (error) {
    throw new Error(
      `Failed to upload ${input.artifactKind} to storage path ${input.storagePath}.`,
    );
  }

  console.info("[storage] artifact upload completed", {
    job_id: input.jobId,
    artifact_kind: input.artifactKind,
    storage_bucket: storageBucket,
    storage_path: input.storagePath,
    bytes_uploaded: input.fileBytes.byteLength,
  });

  return input.storagePath;
}

export async function uploadLocalArtifactToStorage(
  input: UploadArtifactInput,
): Promise<string> {
  const fileBytes = await readFile(input.localPath);
  console.info("[storage] local artifact read for upload", {
    job_id: input.jobId,
    artifact_kind: input.artifactKind,
    local_path: input.localPath,
    storage_path: input.storagePath,
  });

  return uploadArtifactBytesToStorage({
    jobId: input.jobId,
    fileBytes,
    storagePath: input.storagePath,
    contentType: input.contentType,
    artifactKind: input.artifactKind,
    storageBucket: input.storageBucket,
  });
}

export async function cleanupLocalArtifact(
  jobId: string,
  artifactKind: ArtifactKind,
  localPath: string,
): Promise<void> {
  await rm(localPath, { force: true });

  console.info("[storage] local artifact cleaned up", {
    job_id: jobId,
    artifact_kind: artifactKind,
    local_path: localPath,
    local_dir: dirname(localPath),
  });
}
