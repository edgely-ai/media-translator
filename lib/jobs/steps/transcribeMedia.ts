import {
  transcribeAudio,
  type TranscribeInput,
} from "@/lib/ai/transcribe";
import {
  runInTransactionIfAvailable,
  type DatabaseExecutor,
} from "@/lib/db/client";
import { replaceTranscriptSegmentsForJob } from "@/lib/db/transcript";
import { updateJobMediaPaths, updateJobStatus } from "@/lib/db/jobs";
import type {
  TranscriptionResult,
  TranscriptionSegment,
} from "@/types/transcript";

const TRANSCRIPT_READY_STATUS = "transcript_ready";
const FAILED_STATUS = "failed";

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
        status: TRANSCRIPT_READY_STATUS,
        errorMessage: null,
        completedAt: null,
      });
    });

    return result;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Transcription failed.";

    await updateJobStatus(db, {
      jobId: input.jobId,
      status: FAILED_STATUS,
      errorMessage,
      completedAt: null,
    });

    throw error;
  }
}
