import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { randomUUID } from "node:crypto";

import {
  buildLipSyncStoragePath,
  uploadArtifactBytesToStorage,
} from "@/lib/storage/uploadArtifact";

interface PersistLipSyncOutputInput {
  jobId: string;
  targetLanguage: string;
  sourcePath: string;
}

function isHttpUrl(value: string): boolean {
  return /^https?:\/\//i.test(value);
}

async function readLipSyncSourceBytes(sourcePath: string): Promise<Uint8Array> {
  if (isHttpUrl(sourcePath)) {
    const response = await fetch(sourcePath);

    if (!response.ok) {
      throw new Error(
        `Failed to download lip-sync output from provider URL: ${response.status} ${response.statusText}`,
      );
    }

    return new Uint8Array(await response.arrayBuffer());
  }

  return readFile(sourcePath);
}

export async function persistLipSyncOutput(
  input: PersistLipSyncOutputInput,
): Promise<string> {
  const stagingDir = await mkdtemp(join(tmpdir(), `media-translator-lipsync-${input.jobId}-`));
  const localPath = join(stagingDir, `${input.targetLanguage}-${randomUUID()}.mp4`);

  try {
    const fileBytes = await readLipSyncSourceBytes(input.sourcePath);

    await writeFile(localPath, Buffer.from(fileBytes));

    console.info("[storage] lip-sync output staged", {
      job_id: input.jobId,
      target_language: input.targetLanguage,
      source_path: input.sourcePath,
      local_path: localPath,
      filename: basename(localPath),
    });

    return await uploadArtifactBytesToStorage({
      jobId: input.jobId,
      fileBytes,
      storagePath: buildLipSyncStoragePath(input.jobId, input.targetLanguage),
      contentType: "video/mp4",
      artifactKind: "lip_sync_video",
    });
  } finally {
    await rm(stagingDir, { recursive: true, force: true }).catch((cleanupError) => {
      const errorMessage =
        cleanupError instanceof Error
          ? cleanupError.message
          : "Failed to clean up staged lip-sync output.";

      console.warn("[storage] lip-sync staging cleanup failed", {
        job_id: input.jobId,
        target_language: input.targetLanguage,
        staging_dir: stagingDir,
        error_message: errorMessage,
      });
    });
  }
}
