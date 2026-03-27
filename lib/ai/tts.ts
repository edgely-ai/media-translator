import {
  assertOpenAIResponse,
  getOpenAIBaseUrl,
  getOpenAIRequestId,
  getOpenAITextHeaders,
  OpenAIProviderConfigurationError,
  requireConfiguredOpenAIModel,
} from "@/lib/ai/openai";
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

class OpenAITTSProvider implements TTSProvider {
  private readonly model: string;
  private readonly voice: string;

  constructor() {
    this.model = requireConfiguredOpenAIModel({
      envVar: "OPENAI_TTS_MODEL",
      defaultValue: "gpt-4o-mini-tts",
      selectedProvider: "TTS_PROVIDER",
      purpose: "tts",
    });
    this.voice = (process.env.OPENAI_TTS_VOICE ?? "coral").trim();

    if (!this.voice) {
      throw new OpenAIProviderConfigurationError(
        "OPENAI_TTS_VOICE must be set when TTS_PROVIDER=openai.",
      );
    }
  }

  async synthesize(input: SynthesizeSpeechInput): Promise<TTSResult> {
    const speechInput = buildSpeechInputText(input.segments);

    if (!speechInput) {
      throw new Error("Speech synthesis requires at least one segment with usable text.");
    }

    const response = await assertOpenAIResponse(
      await fetch(`${getOpenAIBaseUrl()}/audio/speech`, {
        method: "POST",
        headers: getOpenAITextHeaders(),
        body: JSON.stringify({
          model: this.model,
          voice: this.voice,
          input: speechInput,
          instructions: buildSpeechInstructions(input),
          response_format: "wav",
        }),
      }),
      "speech synthesis request",
    );
    const audioBuffer = await response.arrayBuffer();
    const audio = new Uint8Array(audioBuffer);
    const wavMetadata = parseWavMetadata(audio);

    if (!wavMetadata) {
      throw new Error("OpenAI TTS returned invalid or unsupported WAV audio.");
    }

    return {
      provider: "openai",
      providerResponseId: getOpenAIRequestId(response),
      targetLanguage: input.targetLanguage,
      mimeType: "audio/wav",
      format: "wav",
      sampleRateHz: wavMetadata.sampleRateHz,
      channels: wavMetadata.channels,
      audio,
    };
  }
}

function buildSpeechInputText(segments: TTSSegmentInput[]): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter((text) => text.length > 0)
    .join(" ");
}

function buildSpeechInstructions(input: SynthesizeSpeechInput): string {
  const instructions = [
    `Speak naturally in ${input.targetLanguage}.`,
    "Maintain a clear dubbing-style delivery suitable for translated media.",
  ];

  if (input.voiceHint?.trim()) {
    instructions.push(`Preferred voice style: ${input.voiceHint.trim()}.`);
  }

  return instructions.join(" ");
}

function parseWavMetadata(
  audio: Uint8Array,
): { sampleRateHz: number; channels: number } | null {
  if (audio.byteLength < 44) {
    return null;
  }

  const view = new DataView(audio.buffer, audio.byteOffset, audio.byteLength);
  const riff =
    String.fromCharCode(audio[0], audio[1], audio[2], audio[3]) === "RIFF";
  const wave =
    String.fromCharCode(audio[8], audio[9], audio[10], audio[11]) === "WAVE";

  if (!riff || !wave) {
    return null;
  }

  const fmtChunk =
    String.fromCharCode(audio[12], audio[13], audio[14], audio[15]) === "fmt ";

  if (!fmtChunk) {
    return null;
  }

  const audioFormat = view.getUint16(20, true);
  const channels = view.getUint16(22, true);
  const sampleRateHz = view.getUint32(24, true);
  const bitsPerSample = view.getUint16(34, true);
  const dataHeaderOffset = 36;
  const dataChunk =
    String.fromCharCode(
      audio[dataHeaderOffset],
      audio[dataHeaderOffset + 1],
      audio[dataHeaderOffset + 2],
      audio[dataHeaderOffset + 3],
    ) === "data";

  if (!dataChunk) {
    return null;
  }

  const dataSize = view.getUint32(40, true);

  if (
    (audioFormat !== 1 && audioFormat !== 3) ||
    channels <= 0 ||
    sampleRateHz <= 0 ||
    bitsPerSample <= 0 ||
    dataSize <= 0 ||
    audio.byteLength < 44 + dataSize
  ) {
    return null;
  }

  return {
    channels,
    sampleRateHz,
  };
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

  if (provider === "openai") {
    return new OpenAITTSProvider();
  }

  if (provider === "mock") {
    return new MockTTSProvider();
  }

  return new NotConfiguredTTSProvider();
}

export async function synthesizeSpeech(
  input: SynthesizeSpeechInput,
): Promise<TTSResult> {
  if (!input.targetLanguage.trim()) {
    throw new Error("Speech synthesis requires a non-empty target language.");
  }

  validateSegments(input.segments);

  const provider = getTTSProvider();
  const result = await provider.synthesize(input);

  if (!result.audio || result.audio.byteLength === 0) {
    throw new Error("Speech synthesis returned empty audio bytes.");
  }

  if (result.format !== "wav" || result.mimeType !== "audio/wav") {
    throw new Error("Speech synthesis returned an unsupported audio format.");
  }

  if (!parseWavMetadata(result.audio)) {
    throw new Error("Speech synthesis returned invalid WAV audio.");
  }

  if (!Number.isInteger(result.sampleRateHz) || result.sampleRateHz <= 0) {
    throw new Error("Speech synthesis returned an invalid sample rate.");
  }

  if (!Number.isInteger(result.channels) || result.channels <= 0) {
    throw new Error("Speech synthesis returned an invalid channel count.");
  }

  return result;
}
