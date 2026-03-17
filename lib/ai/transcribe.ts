import type {
  TranscriptionResult,
  TranscriptionSegment,
} from "@/types/transcript";

export interface TranscribeInput {
  audioPath: string;
  languageHint?: string | null;
}

export interface TranscriptionProvider {
  transcribe(input: TranscribeInput): Promise<TranscriptionResult>;
}

export class TranscriptionProviderNotConfiguredError extends Error {
  constructor(message = "No transcription provider is configured.") {
    super(message);
    this.name = "TranscriptionProviderNotConfiguredError";
  }
}

class MockTranscriptionProvider implements TranscriptionProvider {
  async transcribe(input: TranscribeInput): Promise<TranscriptionResult> {
    const text =
      process.env.TRANSCRIPTION_MOCK_TEXT ??
      "Mock transcription output for local development.";
    const segments: TranscriptionSegment[] = [
      {
        segmentIndex: 0,
        startMs: 0,
        endMs: 1000,
        text,
      },
    ];

    return {
      provider: "mock",
      providerResponseId: `mock:${input.audioPath}`,
      detectedLanguage: input.languageHint ?? "en",
      segments,
    };
  }
}

class NotConfiguredTranscriptionProvider implements TranscriptionProvider {
  async transcribe(): Promise<TranscriptionResult> {
    throw new TranscriptionProviderNotConfiguredError();
  }
}

function getConfiguredProviderName(): string {
  return (process.env.TRANSCRIPTION_PROVIDER ?? "").trim().toLowerCase();
}

export function getTranscriptionProvider(): TranscriptionProvider {
  const provider = getConfiguredProviderName();

  if (provider === "mock") {
    return new MockTranscriptionProvider();
  }

  return new NotConfiguredTranscriptionProvider();
}

export async function transcribeAudio(
  input: TranscribeInput,
): Promise<TranscriptionResult> {
  const provider = getTranscriptionProvider();

  return provider.transcribe(input);
}
