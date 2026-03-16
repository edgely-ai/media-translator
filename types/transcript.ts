export interface TranscriptSegmentRow {
  id: string;
  job_id: string;
  segment_index: number;
  source_start_ms: number;
  source_end_ms: number;
  source_text: string;
  edited_source_text: string | null;
  created_at: string;
  updated_at: string;
}

export interface TranslatedSegmentRow {
  id: string;
  job_id: string;
  job_target_id: string;
  transcript_segment_id: string;
  translated_text: string;
  created_at: string;
  updated_at: string;
}
