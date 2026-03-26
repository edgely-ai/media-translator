import { mkdir, rm, writeFile } from "node:fs/promises";
import { basename, extname, join, resolve } from "node:path";

import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { UPLOAD_STORAGE_BUCKET } from "@/lib/storage/upload-init";

const DEFAULT_WORKER_STAGING_ROOT = ".worker-staging";

export interface StageSourceMediaInput {
  jobId: string;
  storagePath: string;
  storageBucket?: string;
}

export interface StagedSourceMedia {
  jobId: string;
  storageBucket: string;
  storagePath: string;
  stagingRoot: string;
  stagingDir: string;
  localPath: string;
}

function getWorkerStagingRoot(): string {
  const configured = process.env.WORKER_STAGING_ROOT?.trim();

  if (!configured) {
    return resolve(DEFAULT_WORKER_STAGING_ROOT);
  }

  return resolve(configured);
}

function getStagedFilename(storagePath: string): string {
  const originalName = basename(storagePath);
  const extension = extname(originalName).toLowerCase();

  if (extension) {
    return `source${extension}`;
  }

  return "source.bin";
}

export async function stageSourceMedia(
  input: StageSourceMediaInput,
): Promise<StagedSourceMedia> {
  const storageBucket = input.storageBucket ?? UPLOAD_STORAGE_BUCKET;
  const stagingRoot = getWorkerStagingRoot();
  const stagingDir = join(stagingRoot, input.jobId);
  const localPath = join(stagingDir, getStagedFilename(input.storagePath));

  console.info("[storage] staging started", {
    job_id: input.jobId,
    storage_bucket: storageBucket,
    storage_path: input.storagePath,
    local_path: localPath,
  });

  await rm(stagingDir, { recursive: true, force: true });
  await mkdir(stagingDir, { recursive: true });

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase.storage
    .from(storageBucket)
    .download(input.storagePath);

  if (error || !data) {
    throw new Error(
      `Failed to download source media from storage path ${input.storagePath}.`,
    );
  }

  const sourceBuffer = Buffer.from(await data.arrayBuffer());
  await writeFile(localPath, sourceBuffer);

  console.info("[storage] staging completed", {
    job_id: input.jobId,
    storage_bucket: storageBucket,
    storage_path: input.storagePath,
    local_path: localPath,
    bytes_written: sourceBuffer.byteLength,
  });

  return {
    jobId: input.jobId,
    storageBucket,
    storagePath: input.storagePath,
    stagingRoot,
    stagingDir,
    localPath,
  };
}

export async function cleanupStagedSourceMedia(
  stagedSourceMedia: StagedSourceMedia,
): Promise<void> {
  await rm(stagedSourceMedia.stagingDir, {
    recursive: true,
    force: true,
  });

  console.info("[storage] staging cleaned up", {
    job_id: stagedSourceMedia.jobId,
    storage_bucket: stagedSourceMedia.storageBucket,
    storage_path: stagedSourceMedia.storagePath,
    staging_dir: stagedSourceMedia.stagingDir,
  });
}
