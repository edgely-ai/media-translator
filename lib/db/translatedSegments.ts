import { type DatabaseExecutor, queryMany } from "@/lib/db/client";
import type {
  SubtitleSegmentRow,
  TranslatedSegmentRow,
  TranslationSegmentResult,
} from "@/types/transcript";

export async function listTranslatedSegmentsByJobTargetId(
  db: DatabaseExecutor,
  jobTargetId: string,
): Promise<TranslatedSegmentRow[]> {
  return queryMany<TranslatedSegmentRow>(
    db,
    `SELECT id,
            translated_segments.job_id,
            translated_segments.job_target_id,
            translated_segments.transcript_segment_id,
            translated_segments.translated_text,
            translated_segments.created_at,
            translated_segments.updated_at
     FROM translated_segments
     INNER JOIN transcript_segments
       ON transcript_segments.id = translated_segments.transcript_segment_id
     WHERE job_target_id = $1
     ORDER BY transcript_segments.segment_index ASC`,
    [jobTargetId],
  );
}

export async function listSubtitleSegmentsByJobTargetId(
  db: DatabaseExecutor,
  jobTargetId: string,
): Promise<SubtitleSegmentRow[]> {
  return queryMany<SubtitleSegmentRow>(
    db,
    `SELECT translated_segments.transcript_segment_id,
            transcript_segments.segment_index,
            transcript_segments.source_start_ms,
            transcript_segments.source_end_ms,
            translated_segments.translated_text
     FROM translated_segments
     INNER JOIN transcript_segments
       ON transcript_segments.id = translated_segments.transcript_segment_id
     WHERE translated_segments.job_target_id = $1
     ORDER BY transcript_segments.segment_index ASC`,
    [jobTargetId],
  );
}

export async function replaceTranslatedSegmentsForTarget(
  db: DatabaseExecutor,
  jobId: string,
  jobTargetId: string,
  transcriptSegments: Array<{
    transcriptSegmentId: string;
    segmentIndex: number;
  }>,
  translatedSegments: TranslationSegmentResult[],
): Promise<void> {
  await db.query("DELETE FROM translated_segments WHERE job_target_id = $1", [
    jobTargetId,
  ]);

  const orderedTranscriptSegments = [...transcriptSegments].sort(
    (left, right) => left.segmentIndex - right.segmentIndex,
  );
  const translatedByIndex = new Map(
    translatedSegments.map((segment) => [segment.segmentIndex, segment]),
  );

  for (const transcriptSegment of orderedTranscriptSegments) {
    const translatedSegment = translatedByIndex.get(transcriptSegment.segmentIndex);

    if (!translatedSegment) {
      throw new Error(
        `Missing translated segment for transcript segment index ${transcriptSegment.segmentIndex}.`,
      );
    }

    await db.query(
      `INSERT INTO translated_segments (
         job_id,
         job_target_id,
         transcript_segment_id,
         translated_text
       )
       VALUES ($1, $2, $3, $4)`,
      [
        jobId,
        jobTargetId,
        transcriptSegment.transcriptSegmentId,
        translatedSegment.translatedText,
      ],
    );
  }
}
