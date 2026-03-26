import { readFile } from "node:fs/promises";

import {
  assertOpenAIResponse,
  getOpenAIBaseUrl,
  getOpenAIFormHeaders,
  getOpenAIRequestId,
  OpenAIProviderConfigurationError,
} from "@/lib/ai/openai";
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

interface OpenAITranscriptionSegment {
  id?: number | string;
  start?: number;
  end?: number;
  text?: string;
}

interface OpenAITranscriptionResponse {
  language?: string | null;
  segments?: OpenAITranscriptionSegment[];
  text?: string;
}

class OpenAITranscriptionProvider implements TranscriptionProvider {
  private readonly model: string;

  constructor() {
    this.model = (process.env.OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1").trim();

    if (!this.model) {
      throw new OpenAIProviderConfigurationError(
        "OPENAI_TRANSCRIPTION_MODEL must be set when TRANSCRIPTION_PROVIDER=openai.",
      );
    }

    if (this.model !== "whisper-1") {
      throw new OpenAIProviderConfigurationError(
        "OPENAI_TRANSCRIPTION_MODEL must be whisper-1 because the current pipeline requires timestamped segments.",
      );
    }
  }

  async transcribe(input: TranscribeInput): Promise<TranscriptionResult> {
    const audioBytes = await readFile(input.audioPath);
    const formData = new FormData();

    formData.append(
      "file",
      new Blob([audioBytes]),
      input.audioPath.split(/[\\/]/).pop() ?? "audio.wav",
    );
    formData.append("model", this.model);
    formData.append("response_format", "verbose_json");
    formData.append("timestamp_granularities[]", "segment");

    const normalizedLanguageHint = normalizeLanguageHint(input.languageHint);

    if (normalizedLanguageHint) {
      formData.append("language", normalizedLanguageHint);
    }

    const prompt = process.env.OPENAI_TRANSCRIPTION_PROMPT?.trim();

    if (prompt) {
      formData.append("prompt", prompt);
    }

    const response = await assertOpenAIResponse(
      await fetch(`${getOpenAIBaseUrl()}/audio/transcriptions`, {
        method: "POST",
        headers: getOpenAIFormHeaders(),
        body: formData,
      }),
      "transcription request",
    );
    const payload = (await response.json()) as OpenAITranscriptionResponse;
    const providerResponseId = getOpenAIRequestId(response);
    const segments = buildSegments(payload);

    return {
      provider: "openai",
      providerResponseId,
      detectedLanguage: payload.language ?? input.languageHint ?? null,
      segments,
    };
  }
}

function normalizeLanguageHint(languageHint?: string | null): string | null {
  const normalized = languageHint?.trim().toLowerCase() ?? "";

  if (/^[a-z]{2,3}$/.test(normalized)) {
    return normalized;
  }

  return null;
}

function buildSegments(
  payload: OpenAITranscriptionResponse,
): TranscriptionSegment[] {
  if (Array.isArray(payload.segments) && payload.segments.length > 0) {
    return payload.segments.map((segment, index) => {
      if (
        typeof segment.start !== "number" ||
        typeof segment.end !== "number" ||
        typeof segment.text !== "string"
      ) {
        throw new Error("OpenAI transcription response is missing segment timing data.");
      }

      return {
        segmentIndex: index,
        startMs: Math.round(segment.start * 1000),
        endMs: Math.round(segment.end * 1000),
        text: segment.text,
      };
    });
  }

  if (typeof payload.text === "string" && payload.text.trim()) {
    return [
      {
        segmentIndex: 0,
        startMs: 0,
        endMs: 1000,
        text: payload.text,
      },
    ];
  }

  throw new Error("OpenAI transcription response did not contain usable transcript text.");
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

  if (provider === "openai") {
    return new OpenAITranscriptionProvider();
  }

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
