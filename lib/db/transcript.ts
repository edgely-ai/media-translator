import { type DatabaseExecutor, queryMany } from "@/lib/db/client";
import type {
  TranscriptSegmentRow,
  TranscriptionSegment,
} from "@/types/transcript";

export async function listTranscriptSegmentsByJobId(
  db: DatabaseExecutor,
  jobId: string,
): Promise<TranscriptSegmentRow[]> {
  return queryMany<TranscriptSegmentRow>(
    db,
    `SELECT id,
            job_id,
            segment_index,
            source_start_ms,
            source_end_ms,
            source_text,
            edited_source_text,
            created_at,
            updated_at
     FROM transcript_segments
     WHERE job_id = $1
     ORDER BY segment_index ASC`,
    [jobId],
  );
}

export async function replaceTranscriptSegmentsForJob(
  db: DatabaseExecutor,
  jobId: string,
  segments: TranscriptionSegment[],
): Promise<void> {
  await db.query("DELETE FROM transcript_segments WHERE job_id = $1", [jobId]);

  for (const segment of segments) {
    await db.query(
      `INSERT INTO transcript_segments (
         job_id,
         segment_index,
         source_start_ms,
         source_end_ms,
         source_text,
         edited_source_text
       )
       VALUES ($1, $2, $3, $4, $5, NULL)`,
      [
        jobId,
        segment.segmentIndex,
        segment.startMs,
        segment.endMs,
        segment.text,
      ],
    );
  }
}
