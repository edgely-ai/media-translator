import { requestLipSync as requestLipSyncFromProvider } from "@/lib/ai/lipsync";
import type { DatabaseExecutor } from "@/lib/db/client";
import { getJobById, updateJobStatus } from "@/lib/db/jobs";
import { JOB_STATE, TARGET_STATE } from "@/lib/jobs/jobStates";
import { throwIfCancellationRequested } from "@/lib/jobs/cancellation";
import {
  logJobStepCompleted,
  logJobStepStarted,
  logJobTargetEvent,
} from "@/lib/jobs/stepLogging";
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

  const eligibleTargets = targets.filter(
    (target) => target.status !== TARGET_STATE.FAILED,
  );

  logJobStepStarted({
    jobId: input.jobId,
    step: STEP_NAME,
    target_count: targets.length,
  });

  const successes: LipSyncRequestResult[] = [];
  const failures: string[] = [];

  await throwIfCancellationRequested(db, input.jobId, STEP_NAME);

  for (const target of eligibleTargets) {
    await throwIfCancellationRequested(
      db,
      input.jobId,
      `${STEP_NAME}:before_target:${target.target_language}`,
    );

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
      logJobTargetEvent("info", "[jobs] target lip-sync requested", {
        jobId: input.jobId,
        step: STEP_NAME,
        target_id: target.id,
        target_language: target.target_language,
        provider_job_id: result.providerJobId,
      });
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
      logJobTargetEvent("error", "[jobs] target lip-sync request failed", {
        jobId: input.jobId,
        step: STEP_NAME,
        target_id: target.id,
        target_language: target.target_language,
        error_message: message,
      });
    }
  }

  if (successes.length === 0) {
    const errorMessage =
      failures[0] ?? "Lip-sync requests could not be submitted for any target.";

    await updateJobStatus(db, {
      jobId: input.jobId,
      status: JOB_STATE.PARTIAL_SUCCESS,
      errorMessage,
      completedAt: null,
    });

    logJobStepCompleted({
      jobId: input.jobId,
      step: STEP_NAME,
      startedAt,
      target_count: eligibleTargets.length,
      skipped_failed_target_count: targets.length - eligibleTargets.length,
      success_count: 0,
      failure_count: failures.length,
      outcome: JOB_STATE.PARTIAL_SUCCESS,
      error_message: errorMessage,
    });

    return [];
  }

  const nextStatus =
    failures.length > 0 ? JOB_STATE.PARTIAL_SUCCESS : JOB_STATE.LIP_SYNC_PENDING;

  await updateJobStatus(db, {
    jobId: input.jobId,
    status: nextStatus,
    errorMessage: failures.length > 0 ? failures.join(" | ") : null,
    completedAt: null,
  });

  logJobStepCompleted({
    jobId: input.jobId,
    step: STEP_NAME,
    startedAt,
    target_count: eligibleTargets.length,
    skipped_failed_target_count: targets.length - eligibleTargets.length,
    success_count: successes.length,
    failure_count: failures.length,
  });

  return successes;
}
