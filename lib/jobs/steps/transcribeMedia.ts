import {
  transcribeAudio,
  type TranscribeInput,
} from "@/lib/ai/transcribe";
import { JOB_STATE } from "@/lib/jobs/jobStates";
import {
  runInTransactionIfAvailable,
  type DatabaseExecutor,
} from "@/lib/db/client";
import { replaceTranscriptSegmentsForJob } from "@/lib/db/transcript";
import { updateJobMediaPaths, updateJobStatus } from "@/lib/db/jobs";
import {
  logJobStepCompleted,
  logJobStepFailed,
  logJobStepStarted,
} from "@/lib/jobs/stepLogging";
import type {
  TranscriptionResult,
  TranscriptionSegment,
} from "@/types/transcript";

const STEP_NAME = "transcribeMedia";

export interface TranscribeMediaInput extends TranscribeInput {
  jobId: string;
}

function validateSegment(
  segment: TranscriptionSegment,
  expectedIndex: number,
): void {
  if (segment.segmentIndex !== expectedIndex) {
    throw new Error(
      `Transcript segments must use sequential indexes starting at 0. Expected ${expectedIndex}, received ${segment.segmentIndex}.`,
    );
  }

  if (!Number.isFinite(segment.startMs) || !Number.isFinite(segment.endMs)) {
    throw new Error("Transcript segments must have finite start and end times.");
  }

  if (segment.startMs < 0 || segment.endMs <= segment.startMs) {
    throw new Error("Transcript segments must satisfy startMs >= 0 and endMs > startMs.");
  }

  if (!segment.text.trim()) {
    throw new Error("Transcript segments must contain non-empty text.");
  }
}

function validateTranscriptionResult(result: TranscriptionResult): void {
  if (result.segments.length === 0) {
    throw new Error("Transcription returned zero segments.");
  }

  result.segments.forEach((segment, index) => validateSegment(segment, index));
}

export async function transcribeMedia(
  db: DatabaseExecutor,
  input: TranscribeMediaInput,
): Promise<TranscriptionResult> {
  const startedAt = Date.now();

  logJobStepStarted({
    jobId: input.jobId,
    step: STEP_NAME,
    audio_path: input.audioPath,
    language_hint: input.languageHint ?? null,
  });

  try {
    const result = await transcribeAudio({
      audioPath: input.audioPath,
      languageHint: input.languageHint ?? null,
    });

    validateTranscriptionResult(result);

    await runInTransactionIfAvailable(db, async (transactionDb) => {
      await replaceTranscriptSegmentsForJob(
        transactionDb,
        input.jobId,
        result.segments,
      );

      await updateJobMediaPaths(transactionDb, {
        jobId: input.jobId,
        sourceLanguage: result.detectedLanguage,
      });

      await updateJobStatus(transactionDb, {
        jobId: input.jobId,
        status: JOB_STATE.TRANSCRIPT_READY,
        errorMessage: null,
        completedAt: null,
      });
    });

    logJobStepCompleted({
      jobId: input.jobId,
      step: STEP_NAME,
      startedAt,
      provider_response_id: result.providerResponseId,
      detected_language: result.detectedLanguage,
      segment_count: result.segments.length,
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Transcription failed.";

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
      error,
      audio_path: input.audioPath,
    });

    throw error;
  }
}
