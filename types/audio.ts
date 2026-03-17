export interface TTSSegmentInput {
  segmentIndex: number;
  startMs: number;
  endMs: number;
  text: string;
}

export interface TTSResult {
  provider: string;
  providerResponseId: string | null;
  targetLanguage: string;
  mimeType: string;
  format: string;
  sampleRateHz: number;
  channels: number;
  audio: Uint8Array;
}
