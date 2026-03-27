import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { getJobById, updateJobStatus } from "@/lib/db/jobs";
import { JOB_STATE, TARGET_STATE } from "@/lib/jobs/jobStates";
import { throwIfCancellationRequested } from "@/lib/jobs/cancellation";
import {
  logJobStepCompleted,
  logJobStepFailed,
  logJobStepStarted,
  logJobTargetEvent,
} from "@/lib/jobs/stepLogging";
import {
  listSubtitleSegmentsByJobTargetId,
} from "@/lib/db/translatedSegments";
import { listTargetsByJobId, updateJobTargetStatus } from "@/lib/db/targets";
import type { DatabaseExecutor } from "@/lib/db/client";
import {
  buildSubtitleStoragePath,
  cleanupLocalArtifact,
  uploadLocalArtifactToStorage,
} from "@/lib/storage/uploadArtifact";
import type { JobRow } from "@/types/jobs";
import type { SubtitleSegmentRow } from "@/types/transcript";

const STEP_NAME = "generateSubtitles";
export interface GenerateSubtitlesInput {
  jobId: string;
  outputRootDir?: string;
}

export interface GeneratedSubtitleResult {
  targetId: string;
  targetLanguage: string;
  subtitlePath: string;
}

function formatSrtTimestamp(totalMilliseconds: number): string {
  const safeMilliseconds = Math.max(0, Math.floor(totalMilliseconds));
  const hours = Math.floor(safeMilliseconds / 3_600_000);
  const minutes = Math.floor((safeMilliseconds % 3_600_000) / 60_000);
  const seconds = Math.floor((safeMilliseconds % 60_000) / 1_000);
  const milliseconds = safeMilliseconds % 1_000;

  return [
    hours.toString().padStart(2, "0"),
    minutes.toString().padStart(2, "0"),
    seconds.toString().padStart(2, "0"),
  ].join(":") + `,${milliseconds.toString().padStart(3, "0")}`;
}

function validateSubtitleSegments(segments: SubtitleSegmentRow[]): void {
  if (segments.length === 0) {
    throw new Error("Translated segments are required before generating subtitles.");
  }

  segments.forEach((segment, index) => {
    if (segment.segment_index !== index) {
      throw new Error(
        `Subtitle segments must be sequential starting at 0. Expected ${index}, received ${segment.segment_index}.`,
      );
    }

    if (segment.source_end_ms <= segment.source_start_ms) {
      throw new Error(
        `Subtitle segment ${segment.segment_index} must end after it starts.`,
      );
    }

    if (!segment.translated_text.trim()) {
      throw new Error(
        `Subtitle segment ${segment.segment_index} must contain translated text.`,
      );
    }
  });
}

function buildSrtContent(segments: SubtitleSegmentRow[]): string {
  return segments
    .map((segment, index) => {
      const text = segment.translated_text.trim().replace(/\r\n/g, "\n");

      return [
        String(index + 1),
        `${formatSrtTimestamp(segment.source_start_ms)} --> ${formatSrtTimestamp(segment.source_end_ms)}`,
        text,
      ].join("\n");
    })
    .join("\n\n") + "\n";
}

function buildSubtitlePath(
  jobId: string,
  targetLanguage: string,
  outputRootDir = "media",
): string {
  return join(outputRootDir, jobId, "subtitles", `${targetLanguage}.srt`);
}

function getSuccessJobStatus(job: JobRow): JobRow["status"] {
  if (job.output_mode === "subtitles") {
    return JOB_STATE.COMPLETED;
  }

  return JOB_STATE.GENERATING_DUBBED_AUDIO;
}

export async function generateSubtitles(
  db: DatabaseExecutor,
  input: GenerateSubtitlesInput,
): Promise<GeneratedSubtitleResult[]> {
  const startedAt = Date.now();
  const job = await getJobById(db, input.jobId);

  if (!job) {
    throw new Error(`Job ${input.jobId} was not found.`);
  }

  const targets = await listTargetsByJobId(db, input.jobId);

  if (targets.length === 0) {
    throw new Error(`Job ${input.jobId} has no targets for subtitle generation.`);
  }

  const eligibleTargets = targets.filter(
    (target) => target.status !== TARGET_STATE.FAILED,
  );

  logJobStepStarted({
    jobId: input.jobId,
    step: STEP_NAME,
    target_count: targets.length,
  });

  await updateJobStatus(db, {
    jobId: input.jobId,
    status: JOB_STATE.GENERATING_SUBTITLES,
    errorMessage: null,
    completedAt: null,
  });

  const successes: GeneratedSubtitleResult[] = [];
  const failures: string[] = [];

  await throwIfCancellationRequested(db, input.jobId, STEP_NAME);

  for (const target of eligibleTargets) {
    await throwIfCancellationRequested(
      db,
      input.jobId,
      `${STEP_NAME}:before_target:${target.target_language}`,
    );

    try {
      const segments = await listSubtitleSegmentsByJobTargetId(db, target.id);

      validateSubtitleSegments(segments);

      const localSubtitlePath = buildSubtitlePath(
        input.jobId,
        target.target_language,
        input.outputRootDir,
      );
      const durableSubtitlePath = buildSubtitleStoragePath(
        input.jobId,
        target.target_language,
      );
      const subtitleContent = buildSrtContent(segments);

      await mkdir(join(input.outputRootDir ?? "media", input.jobId, "subtitles"), {
        recursive: true,
      });
      await writeFile(localSubtitlePath, subtitleContent, "utf8");
      await uploadLocalArtifactToStorage({
        jobId: input.jobId,
        localPath: localSubtitlePath,
        storagePath: durableSubtitlePath,
        contentType: "application/x-subrip",
        artifactKind: "subtitle",
      });

      await updateJobTargetStatus(db, {
        targetId: target.id,
        status: TARGET_STATE.SUBTITLES_READY,
        subtitlePath: durableSubtitlePath,
        errorMessage: null,
        completedAt:
          job.output_mode === "subtitles" ? new Date().toISOString() : null,
      });
      await cleanupLocalArtifact(input.jobId, "subtitle", localSubtitlePath);

      successes.push({
        targetId: target.id,
        targetLanguage: target.target_language,
        subtitlePath: durableSubtitlePath,
      });
      logJobTargetEvent("info", "[jobs] target subtitles ready", {
        jobId: input.jobId,
        step: STEP_NAME,
        target_id: target.id,
        target_language: target.target_language,
        subtitle_path: durableSubtitlePath,
      });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : `Subtitle generation failed for ${target.target_language}.`;

      await updateJobTargetStatus(db, {
        targetId: target.id,
        status: TARGET_STATE.FAILED,
        errorMessage: message,
        completedAt: null,
      });

      failures.push(`${target.target_language}: ${message}`);
      logJobTargetEvent("error", "[jobs] target subtitle generation failed", {
        jobId: input.jobId,
        step: STEP_NAME,
        target_id: target.id,
        target_language: target.target_language,
        error_message: message,
      });
    }
  }

  if (successes.length === 0) {
    const errorMessage = failures[0] ?? "Subtitle generation failed.";

    await updateJobStatus(db, {
      jobId: input.jobId,
      status: JOB_STATE.FAILED,
      errorMessage,
      completedAt: null,
    });

    logJobStepFailed({
      jobId: input.jobId,
      step: STEP_NAME,
      startedAt,
      error: new Error(errorMessage),
      target_count: eligibleTargets.length,
      skipped_failed_target_count: targets.length - eligibleTargets.length,
      success_count: 0,
      failure_count: failures.length,
    });

    throw new Error(errorMessage);
  }

  const nextStatus =
    failures.length > 0 ? JOB_STATE.PARTIAL_SUCCESS : getSuccessJobStatus(job);
  const completedAt =
    nextStatus === JOB_STATE.COMPLETED ? new Date().toISOString() : null;

  await updateJobStatus(db, {
    jobId: input.jobId,
    status: nextStatus,
    errorMessage: failures.length > 0 ? failures.join(" | ") : null,
    completedAt,
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
