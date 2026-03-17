import { requestLipSync as requestLipSyncFromProvider } from "@/lib/ai/lipsync";
import type { DatabaseExecutor } from "@/lib/db/client";
import { getJobById, updateJobStatus } from "@/lib/db/jobs";
import { JOB_STATE, TARGET_STATE } from "@/lib/jobs/jobStates";
import { listTargetsByJobId, updateJobTargetStatus } from "@/lib/db/targets";
import type { JobRow } from "@/types/jobs";
import type { LipSyncRequestResult } from "@/types/video";

const STEP_NAME = "requestLipSync";

export interface RequestLipSyncInput {
  jobId: string;
  callbackUrl?: string | null;
}

function validateJob(job: JobRow): string {
  if (job.output_mode !== "lip_sync") {
    throw new Error("Lip-sync requests are only valid for lip_sync jobs.");
  }

  if (!job.normalized_media_path) {
    throw new Error("Lip-sync requests require a normalized source video path.");
  }

  return job.normalized_media_path;
}

export async function requestLipSync(
  db: DatabaseExecutor,
  input: RequestLipSyncInput,
): Promise<LipSyncRequestResult[]> {
  const startedAt = Date.now();
  const job = await getJobById(db, input.jobId);

  if (!job) {
    throw new Error(`Job ${input.jobId} was not found.`);
  }

  const sourceVideoPath = validateJob(job);
  const targets = await listTargetsByJobId(db, input.jobId);

  if (targets.length === 0) {
    throw new Error(`Job ${input.jobId} has no targets for lip-sync requests.`);
  }

  console.info("[jobs] step started", {
    job_id: input.jobId,
    step: STEP_NAME,
    target_count: targets.length,
  });

  const successes: LipSyncRequestResult[] = [];
  const failures: string[] = [];

  for (const target of targets) {
    try {
      if (!target.dubbed_audio_path) {
        throw new Error(
          `Target ${target.target_language} requires dubbed audio before lip-sync can be requested.`,
        );
      }

      const result = await requestLipSyncFromProvider({
        targetLanguage: target.target_language,
        sourceVideoPath,
        dubbedAudioPath: target.dubbed_audio_path,
        callbackUrl: input.callbackUrl,
      });

      await updateJobTargetStatus(db, {
        targetId: target.id,
        status: TARGET_STATE.LIPSYNC_REQUESTED,
        providerJobId: result.providerJobId,
        errorMessage: null,
        completedAt: null,
      });

      successes.push(result);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Lip-sync request failed for ${target.target_language}.`;

      await updateJobTargetStatus(db, {
        targetId: target.id,
        status: TARGET_STATE.FAILED,
        errorMessage: message,
        completedAt: null,
      });

      failures.push(`${target.target_language}: ${message}`);
    }
  }

  const durationMs = Date.now() - startedAt;

  if (successes.length === 0) {
    const errorMessage =
      failures[0] ?? "Lip-sync requests could not be submitted for any target.";

    await updateJobStatus(db, {
      jobId: input.jobId,
      status: JOB_STATE.PARTIAL_SUCCESS,
      errorMessage,
      completedAt: null,
    });

    console.error("[jobs] step completed with no requests", {
      job_id: input.jobId,
      step: STEP_NAME,
      duration_ms: durationMs,
      error_message: errorMessage,
    });

    throw new Error(errorMessage);
  }

  const nextStatus =
    failures.length > 0 ? JOB_STATE.PARTIAL_SUCCESS : JOB_STATE.LIP_SYNC_PENDING;

  await updateJobStatus(db, {
    jobId: input.jobId,
    status: nextStatus,
    errorMessage: failures.length > 0 ? failures.join(" | ") : null,
    completedAt: null,
  });

  console.info("[jobs] step completed", {
    job_id: input.jobId,
    step: STEP_NAME,
    duration_ms: durationMs,
    success_count: successes.length,
    failure_count: failures.length,
  });

  return successes;
}
