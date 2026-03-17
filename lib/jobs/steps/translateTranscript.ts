import { translateSegments } from "@/lib/ai/translate";
import {
  runInTransactionIfAvailable,
  type DatabaseExecutor,
} from "@/lib/db/client";
import { listTranscriptSegmentsByJobId } from "@/lib/db/transcript";
import { replaceTranslatedSegmentsForTarget } from "@/lib/db/translatedSegments";
import { getJobById, updateJobStatus } from "@/lib/db/jobs";
import {
  listTargetsByJobId,
  updateJobTargetStatus,
} from "@/lib/db/targets";
import type { TranslationResult } from "@/types/transcript";

const JOB_TRANSLATING_STATUS = "translating";
const TARGET_TRANSLATING_STATUS = "translating";
const TARGET_FAILED_STATUS = "failed";
const JOB_FAILED_STATUS = "failed";

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
    status: JOB_TRANSLATING_STATUS,
    errorMessage: null,
    completedAt: null,
  });

  try {
    const results: TranslationResult[] = [];

    for (const target of targets) {
      try {
        await updateJobTargetStatus(db, {
          targetId: target.id,
          status: TARGET_TRANSLATING_STATUS,
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
      } catch (error) {
        const targetErrorMessage =
          error instanceof Error
            ? error.message
            : `Translation failed for target ${target.target_language}.`;

        await updateJobTargetStatus(db, {
          targetId: target.id,
          status: TARGET_FAILED_STATUS,
          errorMessage: targetErrorMessage,
          completedAt: null,
        });

        throw error;
      }
    }

    return results;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Transcript translation failed.";

    await updateJobStatus(db, {
      jobId: input.jobId,
      status: JOB_FAILED_STATUS,
      errorMessage,
      completedAt: null,
    });

    throw error;
  }
}
