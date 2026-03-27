import { translateSegments } from "@/lib/ai/translate";
import { JOB_STATE, TARGET_STATE } from "@/lib/jobs/jobStates";
import {
  runInTransactionIfAvailable,
  type DatabaseExecutor,
} from "@/lib/db/client";
import { listTranscriptSegmentsByJobId } from "@/lib/db/transcript";
import { replaceTranslatedSegmentsForTarget } from "@/lib/db/translatedSegments";
import { getJobById, updateJobStatus } from "@/lib/db/jobs";
import {
  isJobCancellationRequestedError,
  throwIfCancellationRequested,
} from "@/lib/jobs/cancellation";
import {
  logJobStepCompleted,
  logJobStepFailed,
  logJobStepStarted,
  logJobTargetEvent,
} from "@/lib/jobs/stepLogging";
import {
  listTargetsByJobId,
  updateJobTargetStatus,
} from "@/lib/db/targets";
import type { TranslationResult } from "@/types/transcript";

const STEP_NAME = "translateTranscript";

export interface TranslateTranscriptInput {
  jobId: string;
}

function buildTranslationSegments(
  transcriptSegments: Awaited<ReturnType<typeof listTranscriptSegmentsByJobId>>,
) {
  return transcriptSegments.map((segment) => ({
    transcriptSegmentId: segment.id,
    segmentIndex: segment.segment_index,
    text: segment.edited_source_text ?? segment.source_text,
  }));
}

function validateTranslationResult(
  result: TranslationResult,
  expectedCount: number,
): void {
  if (result.segments.length !== expectedCount) {
    throw new Error(
      `Expected ${expectedCount} translated segments but received ${result.segments.length}.`,
    );
  }

  result.segments.forEach((segment, index) => {
    if (segment.segmentIndex !== index) {
      throw new Error(
        `Translated segments must use sequential indexes starting at 0. Expected ${index}, received ${segment.segmentIndex}.`,
      );
    }

    if (!segment.translatedText.trim()) {
      throw new Error("Translated segments must contain non-empty text.");
    }
  });
}

export async function translateTranscript(
  db: DatabaseExecutor,
  input: TranslateTranscriptInput,
): Promise<TranslationResult[]> {
  const startedAt = Date.now();
  const job = await getJobById(db, input.jobId);

  if (!job) {
    throw new Error(`Job ${input.jobId} was not found.`);
  }

  const transcriptSegments = await listTranscriptSegmentsByJobId(db, input.jobId);

  if (transcriptSegments.length === 0) {
    throw new Error(`Job ${input.jobId} has no transcript segments to translate.`);
  }

  const translationSegments = buildTranslationSegments(transcriptSegments);
  const targets = await listTargetsByJobId(db, input.jobId);

  if (targets.length === 0) {
    throw new Error(`Job ${input.jobId} has no targets to translate.`);
  }

  await updateJobStatus(db, {
    jobId: input.jobId,
    status: JOB_STATE.TRANSLATING,
    errorMessage: null,
    completedAt: null,
  });

  logJobStepStarted({
    jobId: input.jobId,
    step: STEP_NAME,
    target_count: targets.length,
  });

  try {
    await throwIfCancellationRequested(db, input.jobId, STEP_NAME);

    const results: TranslationResult[] = [];
    const failures: string[] = [];

    for (const target of targets) {
      await throwIfCancellationRequested(
        db,
        input.jobId,
        `${STEP_NAME}:before_target:${target.target_language}`,
      );

      try {
        await updateJobTargetStatus(db, {
          targetId: target.id,
          status: TARGET_STATE.TRANSLATING,
          errorMessage: null,
          completedAt: null,
        });

        const result = await translateSegments({
          sourceLanguage: job.source_language,
          targetLanguage: target.target_language,
          segments: translationSegments.map((segment) => ({
            segmentIndex: segment.segmentIndex,
            text: segment.text,
          })),
        });

        validateTranslationResult(result, translationSegments.length);

        await runInTransactionIfAvailable(db, async (transactionDb) => {
          await replaceTranslatedSegmentsForTarget(
            transactionDb,
            input.jobId,
            target.id,
            translationSegments.map((segment) => ({
              transcriptSegmentId: segment.transcriptSegmentId,
              segmentIndex: segment.segmentIndex,
            })),
            result.segments,
          );
        });

        results.push(result);
        logJobTargetEvent("info", "[jobs] target translation completed", {
          jobId: input.jobId,
          step: STEP_NAME,
          target_id: target.id,
          target_language: target.target_language,
          provider_response_id: result.providerResponseId,
          segment_count: result.segments.length,
        });
      } catch (error) {
        const targetErrorMessage =
          error instanceof Error
            ? error.message
            : `Translation failed for target ${target.target_language}.`;

        await updateJobTargetStatus(db, {
          targetId: target.id,
          status: TARGET_STATE.FAILED,
          errorMessage: targetErrorMessage,
          completedAt: null,
        });

        failures.push(`${target.target_language}: ${targetErrorMessage}`);
        logJobTargetEvent("error", "[jobs] target translation failed", {
          jobId: input.jobId,
          step: STEP_NAME,
          target_id: target.id,
          target_language: target.target_language,
          error_message: targetErrorMessage,
        });
      }
    }

    if (results.length === 0) {
      const error = new Error(
        failures[0] ?? "Transcript translation failed for all targets.",
      );

      await updateJobStatus(db, {
        jobId: input.jobId,
        status: JOB_STATE.FAILED,
        errorMessage: error.message,
        completedAt: null,
      });

      throw error;
    }

    if (failures.length > 0) {
      await updateJobStatus(db, {
        jobId: input.jobId,
        status: JOB_STATE.TRANSLATING,
        errorMessage: failures.join(" | "),
        completedAt: null,
      });
    }

    logJobStepCompleted({
      jobId: input.jobId,
      step: STEP_NAME,
      startedAt,
      target_count: targets.length,
      success_count: results.length,
      failure_count: failures.length,
    });

    return results;
  } catch (error) {
    if (isJobCancellationRequestedError(error)) {
      throw error;
    }

    const errorMessage =
      error instanceof Error ? error.message : "Transcript translation failed.";

    const latestJob = await getJobById(db, input.jobId);

    if (latestJob?.status !== JOB_STATE.FAILED) {
      await updateJobStatus(db, {
        jobId: input.jobId,
        status: JOB_STATE.FAILED,
        errorMessage,
        completedAt: null,
      });
    }

    logJobStepFailed({
      jobId: input.jobId,
      step: STEP_NAME,
      startedAt,
      error,
      target_count: targets.length,
    });

    throw error;
  }
}
