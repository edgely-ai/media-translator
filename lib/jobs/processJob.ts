import type { DatabaseExecutor } from "@/lib/db/client";
import { getJobById, updateJobMediaPaths, updateJobStatus } from "@/lib/db/jobs";
import { extractAudio } from "@/lib/ffmpeg/extractAudio";
import { normalizeMedia, type NormalizedMediaKind } from "@/lib/ffmpeg/normalizeMedia";
import { JOB_STATE, canTransitionJobState } from "@/lib/jobs/jobStates";
import { reconcileJobOutputs } from "@/lib/jobs/reconcileJobOutputs";
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

function logProcessCompletion(
  jobId: string,
  startedAt: number,
  finalStatus: JobRow["status"],
): void {
  console.info("[jobs] step completed", {
    job_id: jobId,
    step: STEP_NAME,
    duration_ms: Date.now() - startedAt,
    final_status: finalStatus,
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

  if (job.status !== JOB_STATE.QUEUED) {
    throw new Error(
      `Job ${input.jobId} must be ${JOB_STATE.QUEUED} before processing starts.`,
    );
  }

  console.info("[jobs] step started", {
    job_id: input.jobId,
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

    job = await updateJobMediaPaths(db, {
      jobId: job.id,
      normalizedMediaPath: normalized.outputPath,
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

    job = await updateJobMediaPaths(db, {
      jobId: job.id,
      extractedAudioPath,
    });

    job = await transitionJobStatus(db, job, JOB_STATE.TRANSCRIBING);

    await transcribeMedia(db, {
      jobId: job.id,
      audioPath: extractedAudioPath,
      languageHint: job.source_language,
    });

    await translateTranscript(db, { jobId: job.id });
    await generateSubtitles(db, {
      jobId: job.id,
      outputRootDir,
    });

    job = await reloadJob(db, job.id);

    if (job.output_mode === "subtitles") {
      await reconcileJobOutputs(job.id);
      const finalJob = await reloadJob(db, job.id);
      logProcessCompletion(input.jobId, startedAt, finalJob.status);
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
      logProcessCompletion(input.jobId, startedAt, finalJob.status);
      return finalJob;
    }

    await requestLipSync(db, {
      jobId: job.id,
      callbackUrl: input.lipSyncCallbackUrl ?? null,
    });

    job = await reloadJob(db, job.id);
    logProcessCompletion(input.jobId, startedAt, job.status);

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

    console.error("[jobs] step failed", {
      job_id: input.jobId,
      step: STEP_NAME,
      duration_ms: Date.now() - startedAt,
      error_message: errorMessage,
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
