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

export interface TranscriptionSegment {
  segmentIndex: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface TranscriptionResult {
  provider: string;
  providerResponseId: string | null;
  detectedLanguage: string | null;
  segments: TranscriptionSegment[];
}

export interface TranslationSegmentInput {
  segmentIndex: number;
  text: string;
}

export interface TranslationSegmentResult {
  segmentIndex: number;
  translatedText: string;
}

export interface TranslationResult {
  provider: string;
  providerResponseId: string | null;
  sourceLanguage: string | null;
  targetLanguage: string;
  segments: TranslationSegmentResult[];
}
