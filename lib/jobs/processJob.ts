import type { DatabaseExecutor } from "@/lib/db/client";
import { getJobById, updateJobMediaPaths, updateJobStatus } from "@/lib/db/jobs";
import { extractAudio } from "@/lib/ffmpeg/extractAudio";
import { normalizeMedia, type NormalizedMediaKind } from "@/lib/ffmpeg/normalizeMedia";
import { JOB_STATE, canTransitionJobState } from "@/lib/jobs/jobStates";
import { reconcileJobOutputs } from "@/lib/jobs/reconcileJobOutputs";
import {
  logJobStepCompleted,
  logJobStepFailed,
  logJobStepStarted,
} from "@/lib/jobs/stepLogging";
import { generateDubbedAudio } from "@/lib/jobs/steps/generateDubbedAudio";
import { generateSubtitles } from "@/lib/jobs/steps/generateSubtitles";
import { requestLipSync } from "@/lib/jobs/steps/requestLipSync";
import { transcribeMedia } from "@/lib/jobs/steps/transcribeMedia";
import { translateTranscript } from "@/lib/jobs/steps/translateTranscript";
import {
  cleanupStagedSourceMedia,
  stageSourceMedia,
  type StagedSourceMedia,
} from "@/lib/storage/stageSourceMedia";
import {
  buildExtractedAudioStoragePath,
  buildNormalizedMediaStoragePath,
  cleanupLocalArtifact,
  uploadLocalArtifactToStorage,
} from "@/lib/storage/uploadArtifact";
import type { JobRow } from "@/types/jobs";

const STEP_NAME = "processJob";

export interface ProcessJobInput {
  jobId: string;
  outputRootDir?: string;
  lipSyncCallbackUrl?: string | null;
}

function inferNormalizedMediaKind(sourcePath: string): NormalizedMediaKind {
  const normalizedPath = sourcePath.toLowerCase();

  if (
    normalizedPath.endsWith(".mp4") ||
    normalizedPath.endsWith(".mov") ||
    normalizedPath.endsWith(".webm")
  ) {
    return "video";
  }

  return "audio";
}

async function reloadJob(db: DatabaseExecutor, jobId: string): Promise<JobRow> {
  const job = await getJobById(db, jobId);

  if (!job) {
    throw new Error(`Job ${jobId} was not found.`);
  }

  return job;
}

async function transitionJobStatus(
  db: DatabaseExecutor,
  job: JobRow,
  nextStatus: JobRow["status"],
): Promise<JobRow> {
  if (!canTransitionJobState(job.status, nextStatus)) {
    throw new Error(
      `Job ${job.id} cannot transition from ${job.status} to ${nextStatus}.`,
    );
  }

  return updateJobStatus(db, {
    jobId: job.id,
    status: nextStatus,
    errorMessage: null,
    completedAt: null,
  });
}

export async function processJob(
  db: DatabaseExecutor,
  input: ProcessJobInput,
): Promise<JobRow> {
  const startedAt = Date.now();
  let job = await reloadJob(db, input.jobId);
  let stagedSourceMedia: StagedSourceMedia | null = null;
  let processingError: unknown = null;
  let localNormalizedMediaPath: string | null = null;
  let localExtractedAudioPath: string | null = null;

  if (job.status !== JOB_STATE.QUEUED) {
    throw new Error(
      `Job ${input.jobId} must be ${JOB_STATE.QUEUED} before processing starts.`,
    );
  }

  logJobStepStarted({
    jobId: input.jobId,
    step: STEP_NAME,
    output_mode: job.output_mode,
  });

  try {
    stagedSourceMedia = await stageSourceMedia({
      jobId: job.id,
      storagePath: job.source_media_path,
    });

    job = await transitionJobStatus(db, job, JOB_STATE.NORMALIZING);

    const outputRootDir = input.outputRootDir ?? "media";
    const normalizationOutputDir = `${outputRootDir}/${job.id}`;
    const normalizedKind = inferNormalizedMediaKind(stagedSourceMedia.localPath);
    const normalized = await normalizeMedia({
      inputPath: stagedSourceMedia.localPath,
      outputDir: normalizationOutputDir,
      kind: normalizedKind,
    });
    localNormalizedMediaPath = normalized.outputPath;
    const durableNormalizedMediaPath = await uploadLocalArtifactToStorage({
      jobId: job.id,
      localPath: normalized.outputPath,
      storagePath: buildNormalizedMediaStoragePath(job.id, normalized.format),
      contentType: normalized.format === "mp4" ? "video/mp4" : "audio/wav",
      artifactKind: "normalized_media",
    });

    job = await updateJobMediaPaths(db, {
      jobId: job.id,
      normalizedMediaPath: durableNormalizedMediaPath,
    });

    job = await transitionJobStatus(db, job, JOB_STATE.EXTRACTING_AUDIO);

    const extractedAudioPath =
      normalized.kind === "audio"
        ? normalized.outputPath
        : (
            await extractAudio({
              inputPath: normalized.outputPath,
              outputDir: normalizationOutputDir,
            })
          ).outputPath;
    localExtractedAudioPath = extractedAudioPath;
    const durableExtractedAudioPath = await uploadLocalArtifactToStorage({
      jobId: job.id,
      localPath: extractedAudioPath,
      storagePath: buildExtractedAudioStoragePath(job.id),
      contentType: "audio/wav",
      artifactKind: "extracted_audio",
    });

    job = await updateJobMediaPaths(db, {
      jobId: job.id,
      extractedAudioPath: durableExtractedAudioPath,
    });

    if (normalized.kind === "video" && localNormalizedMediaPath) {
      await cleanupLocalArtifact(
        job.id,
        "normalized_media",
        localNormalizedMediaPath,
      );
      localNormalizedMediaPath = null;
    }

    job = await transitionJobStatus(db, job, JOB_STATE.TRANSCRIBING);

    await transcribeMedia(db, {
      jobId: job.id,
      audioPath: extractedAudioPath,
      languageHint: job.source_language,
    });

    if (localExtractedAudioPath) {
      await cleanupLocalArtifact(
        job.id,
        "extracted_audio",
        localExtractedAudioPath,
      );
      localExtractedAudioPath = null;
    }

    if (localNormalizedMediaPath) {
      await cleanupLocalArtifact(
        job.id,
        "normalized_media",
        localNormalizedMediaPath,
      );
      localNormalizedMediaPath = null;
    }

    await translateTranscript(db, { jobId: job.id });
    await generateSubtitles(db, {
      jobId: job.id,
      outputRootDir,
    });

    job = await reloadJob(db, job.id);

    if (job.output_mode === "subtitles") {
      await reconcileJobOutputs(job.id);
      const finalJob = await reloadJob(db, job.id);
      logJobStepCompleted({
        jobId: input.jobId,
        step: STEP_NAME,
        startedAt,
        final_status: finalJob.status,
      });
      return finalJob;
    }

    await generateDubbedAudio(db, {
      jobId: job.id,
      outputRootDir,
    });

    job = await reloadJob(db, job.id);

    if (job.output_mode === "dubbed_audio") {
      await reconcileJobOutputs(job.id);
      const finalJob = await reloadJob(db, job.id);
      logJobStepCompleted({
        jobId: input.jobId,
        step: STEP_NAME,
        startedAt,
        final_status: finalJob.status,
      });
      return finalJob;
    }

    await requestLipSync(db, {
      jobId: job.id,
      callbackUrl: input.lipSyncCallbackUrl ?? null,
    });

    job = await reloadJob(db, job.id);
    logJobStepCompleted({
      jobId: input.jobId,
      step: STEP_NAME,
      startedAt,
      final_status: job.status,
    });

    return job;
  } catch (error) {
    processingError = error;
    const latestJob = await reloadJob(db, input.jobId).catch(() => null);
    const errorMessage =
      error instanceof Error ? error.message : "Worker job processing failed.";

    if (latestJob && latestJob.status !== JOB_STATE.FAILED) {
      await updateJobStatus(db, {
        jobId: latestJob.id,
        status: JOB_STATE.FAILED,
        errorMessage,
        completedAt: null,
      });
    }

    const failedJob = await reloadJob(db, input.jobId).catch(() => latestJob);

    if (failedJob) {
      await reconcileJobOutputs(failedJob.id);
    }

    logJobStepFailed({
      jobId: input.jobId,
      step: STEP_NAME,
      startedAt,
      error,
    });

    throw error;
  } finally {
    if (stagedSourceMedia) {
      try {
        await cleanupStagedSourceMedia(stagedSourceMedia);
      } catch (cleanupError) {
        const cleanupMessage =
          cleanupError instanceof Error
            ? cleanupError.message
            : "Failed to clean up staged source media.";

        console.warn("[storage] staging cleanup failed", {
          job_id: input.jobId,
          staging_dir: stagedSourceMedia.stagingDir,
          error_message: cleanupMessage,
          processing_error:
            processingError instanceof Error ? processingError.message : null,
        });
      }
    }
  }
}
