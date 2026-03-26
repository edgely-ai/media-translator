import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { synthesizeSpeech } from "@/lib/ai/tts";
import type { DatabaseExecutor } from "@/lib/db/client";
import { getJobById, updateJobStatus } from "@/lib/db/jobs";
import { listSubtitleSegmentsByJobTargetId } from "@/lib/db/translatedSegments";
import { JOB_STATE, TARGET_STATE } from "@/lib/jobs/jobStates";
import { listTargetsByJobId, updateJobTargetStatus } from "@/lib/db/targets";
import {
  buildDubbedAudioStoragePath,
  cleanupLocalArtifact,
  uploadLocalArtifactToStorage,
} from "@/lib/storage/uploadArtifact";
import type { JobRow, JobTargetRow } from "@/types/jobs";
import type { TTSSegmentInput } from "@/types/audio";
import type { SubtitleSegmentRow } from "@/types/transcript";
const STEP_NAME = "generateDubbedAudio";

export interface GenerateDubbedAudioInput {
  jobId: string;
  outputRootDir?: string;
}

export interface GeneratedDubbedAudioResult {
  targetId: string;
  targetLanguage: string;
  dubbedAudioPath: string;
  format: string;
  mimeType: string;
}

function validateJobOutputMode(job: JobRow): void {
  if (job.output_mode === "subtitles") {
    throw new Error("Dubbed audio generation is not valid for subtitles-only jobs.");
  }
}

function validateTranslatedSegments(segments: SubtitleSegmentRow[]): void {
  if (segments.length === 0) {
    throw new Error("Translated segments are required before generating dubbed audio.");
  }

  segments.forEach((segment, index) => {
    if (segment.segment_index !== index) {
      throw new Error(
        `Dubbed audio segments must be sequential starting at 0. Expected ${index}, received ${segment.segment_index}.`,
      );
    }

    if (segment.source_end_ms <= segment.source_start_ms) {
      throw new Error(
        `Dubbed audio segment ${segment.segment_index} must end after it starts.`,
      );
    }

    if (!segment.translated_text.trim()) {
      throw new Error(
        `Dubbed audio segment ${segment.segment_index} must contain translated text.`,
      );
    }
  });
}

function buildSpeechSegments(segments: SubtitleSegmentRow[]): TTSSegmentInput[] {
  return segments.map((segment) => ({
    segmentIndex: segment.segment_index,
    startMs: segment.source_start_ms,
    endMs: segment.source_end_ms,
    text: segment.translated_text,
  }));
}

function buildDubbedAudioPath(
  jobId: string,
  targetLanguage: string,
  format: string,
  outputRootDir = "media",
): string {
  return join(outputRootDir, jobId, "dubbed", `${targetLanguage}.${format}`);
}

function getSuccessfulTargetStatus(job: JobRow): JobTargetRow["status"] {
  if (job.output_mode === "dubbed_audio") {
    return TARGET_STATE.COMPLETED;
  }

  return TARGET_STATE.AUDIO_READY;
}

function getSuccessfulJobStatus(job: JobRow): JobRow["status"] {
  if (job.output_mode === "dubbed_audio") {
    return JOB_STATE.COMPLETED;
  }

  return JOB_STATE.LIP_SYNC_PENDING;
}

export async function generateDubbedAudio(
  db: DatabaseExecutor,
  input: GenerateDubbedAudioInput,
): Promise<GeneratedDubbedAudioResult[]> {
  const startedAt = Date.now();
  const job = await getJobById(db, input.jobId);

  if (!job) {
    throw new Error(`Job ${input.jobId} was not found.`);
  }

  validateJobOutputMode(job);

  const targets = await listTargetsByJobId(db, input.jobId);

  if (targets.length === 0) {
    throw new Error(`Job ${input.jobId} has no targets for dubbed audio generation.`);
  }

  console.info("[jobs] step started", {
    job_id: input.jobId,
    step: STEP_NAME,
    target_count: targets.length,
  });

  await updateJobStatus(db, {
    jobId: input.jobId,
    status: JOB_STATE.GENERATING_DUBBED_AUDIO,
    errorMessage: null,
    completedAt: null,
  });

  const outputDir = join(input.outputRootDir ?? "media", input.jobId, "dubbed");
  await mkdir(outputDir, { recursive: true });

  const successes: GeneratedDubbedAudioResult[] = [];
  const failures: string[] = [];

  for (const target of targets) {
    try {
      const segments = await listSubtitleSegmentsByJobTargetId(db, target.id);

      validateTranslatedSegments(segments);

      const synthesizedAudio = await synthesizeSpeech({
        targetLanguage: target.target_language,
        segments: buildSpeechSegments(segments),
      });
      const localDubbedAudioPath = buildDubbedAudioPath(
        input.jobId,
        target.target_language,
        synthesizedAudio.format,
        input.outputRootDir,
      );
      const durableDubbedAudioPath = buildDubbedAudioStoragePath(
        input.jobId,
        target.target_language,
        synthesizedAudio.format,
      );

      await writeFile(localDubbedAudioPath, Buffer.from(synthesizedAudio.audio));
      await uploadLocalArtifactToStorage({
        jobId: input.jobId,
        localPath: localDubbedAudioPath,
        storagePath: durableDubbedAudioPath,
        contentType: synthesizedAudio.mimeType,
        artifactKind: "dubbed_audio",
      });

      const targetStatus = getSuccessfulTargetStatus(job);
      await updateJobTargetStatus(db, {
        targetId: target.id,
        status: targetStatus,
        dubbedAudioPath: durableDubbedAudioPath,
        errorMessage: null,
        completedAt:
          targetStatus === TARGET_STATE.COMPLETED
            ? new Date().toISOString()
            : null,
      });
      await cleanupLocalArtifact(
        input.jobId,
        "dubbed_audio",
        localDubbedAudioPath,
      );

      successes.push({
        targetId: target.id,
        targetLanguage: target.target_language,
        dubbedAudioPath: durableDubbedAudioPath,
        format: synthesizedAudio.format,
        mimeType: synthesizedAudio.mimeType,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Dubbed audio generation failed for ${target.target_language}.`;

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
    const errorMessage = failures[0] ?? "Dubbed audio generation failed.";

    await updateJobStatus(db, {
      jobId: input.jobId,
      status: JOB_STATE.FAILED,
      errorMessage,
      completedAt: null,
    });

    console.error("[jobs] step failed", {
      job_id: input.jobId,
      step: STEP_NAME,
      duration_ms: durationMs,
      error_message: errorMessage,
    });

    throw new Error(errorMessage);
  }

  const nextStatus =
    failures.length > 0 ? JOB_STATE.PARTIAL_SUCCESS : getSuccessfulJobStatus(job);
  const completedAt =
    nextStatus === JOB_STATE.COMPLETED ? new Date().toISOString() : null;

  await updateJobStatus(db, {
    jobId: input.jobId,
    status: nextStatus,
    errorMessage: failures.length > 0 ? failures.join(" | ") : null,
    completedAt,
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
