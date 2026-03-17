import type { TTSResult, TTSSegmentInput } from "@/types/audio";

export interface SynthesizeSpeechInput {
  targetLanguage: string;
  voiceHint?: string | null;
  segments: TTSSegmentInput[];
}

export interface TTSProvider {
  synthesize(input: SynthesizeSpeechInput): Promise<TTSResult>;
}

export class TTSProviderNotConfiguredError extends Error {
  constructor(message = "No TTS provider is configured.") {
    super(message);
    this.name = "TTSProviderNotConfiguredError";
  }
}

const MOCK_SAMPLE_RATE_HZ = 16_000;
const MOCK_CHANNELS = 1;
const MOCK_BITS_PER_SAMPLE = 16;

function getConfiguredProviderName(): string {
  return (process.env.TTS_PROVIDER ?? "").trim().toLowerCase();
}

function validateSegments(segments: TTSSegmentInput[]): void {
  if (segments.length === 0) {
    throw new Error("Speech synthesis requires at least one segment.");
  }

  segments.forEach((segment, index) => {
    if (segment.segmentIndex !== index) {
      throw new Error(
        `Speech synthesis segments must use sequential indexes starting at 0. Expected ${index}, received ${segment.segmentIndex}.`,
      );
    }

    if (segment.endMs <= segment.startMs) {
      throw new Error(
        `Speech synthesis segment ${segment.segmentIndex} must end after it starts.`,
      );
    }

    if (!segment.text.trim()) {
      throw new Error(
        `Speech synthesis segment ${segment.segmentIndex} must contain non-empty text.`,
      );
    }
  });
}

function createSilentWav(durationMs: number): Uint8Array {
  const safeDurationMs = Math.max(durationMs, 250);
  const totalSamples = Math.ceil((safeDurationMs / 1000) * MOCK_SAMPLE_RATE_HZ);
  const blockAlign = (MOCK_CHANNELS * MOCK_BITS_PER_SAMPLE) / 8;
  const byteRate = MOCK_SAMPLE_RATE_HZ * blockAlign;
  const dataSize = totalSamples * blockAlign;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);

  let offset = 0;
  const writeAscii = (value: string) => {
    for (let index = 0; index < value.length; index += 1) {
      view.setUint8(offset, value.charCodeAt(index));
      offset += 1;
    }
  };

  writeAscii("RIFF");
  view.setUint32(offset, 36 + dataSize, true);
  offset += 4;
  writeAscii("WAVE");
  writeAscii("fmt ");
  view.setUint32(offset, 16, true);
  offset += 4;
  view.setUint16(offset, 1, true);
  offset += 2;
  view.setUint16(offset, MOCK_CHANNELS, true);
  offset += 2;
  view.setUint32(offset, MOCK_SAMPLE_RATE_HZ, true);
  offset += 4;
  view.setUint32(offset, byteRate, true);
  offset += 4;
  view.setUint16(offset, blockAlign, true);
  offset += 2;
  view.setUint16(offset, MOCK_BITS_PER_SAMPLE, true);
  offset += 2;
  writeAscii("data");
  view.setUint32(offset, dataSize, true);

  return bytes;
}

class MockTTSProvider implements TTSProvider {
  async synthesize(input: SynthesizeSpeechInput): Promise<TTSResult> {
    const totalDurationMs = input.segments.reduce(
      (maxDuration, segment) => Math.max(maxDuration, segment.endMs),
      0,
    );

    return {
      provider: "mock",
      providerResponseId: `mock:${input.targetLanguage}:${input.segments.length}`,
      targetLanguage: input.targetLanguage,
      mimeType: "audio/wav",
      format: "wav",
      sampleRateHz: MOCK_SAMPLE_RATE_HZ,
      channels: MOCK_CHANNELS,
      audio: createSilentWav(totalDurationMs),
    };
  }
}

class NotConfiguredTTSProvider implements TTSProvider {
  async synthesize(): Promise<TTSResult> {
    throw new TTSProviderNotConfiguredError();
  }
}

export function getTTSProvider(): TTSProvider {
  const provider = getConfiguredProviderName();

  if (provider === "mock") {
    return new MockTTSProvider();
  }

  return new NotConfiguredTTSProvider();
}

export async function synthesizeSpeech(
  input: SynthesizeSpeechInput,
): Promise<TTSResult> {
  validateSegments(input.segments);

  const provider = getTTSProvider();

  return provider.synthesize(input);
}
