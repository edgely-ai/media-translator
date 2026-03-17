import type { DatabaseExecutor } from "@/lib/db/client";
import { processJob } from "@/lib/jobs/processJob";
import type { JobRow } from "@/types/jobs";

export interface ProcessMediaJobPayload {
  jobId: string;
}

export interface ProcessMediaJobOptions {
  outputRootDir?: string;
  lipSyncCallbackUrl?: string | null;
}

export async function processMediaJob(
  db: DatabaseExecutor,
  payload: ProcessMediaJobPayload,
  options: ProcessMediaJobOptions = {},
): Promise<JobRow> {
  return processJob(db, {
    jobId: payload.jobId,
    outputRootDir: options.outputRootDir,
    lipSyncCallbackUrl: options.lipSyncCallbackUrl ?? null,
  });
}
