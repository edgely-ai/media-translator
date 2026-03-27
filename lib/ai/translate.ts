import {
  assertOpenAIResponse,
  getOpenAIBaseUrl,
  getOpenAITextHeaders,
  requireConfiguredOpenAIModel,
} from "@/lib/ai/openai";
import type {
  TranslationResult,
  TranslationSegmentInput,
  TranslationSegmentResult,
} from "@/types/transcript";

export interface TranslateInput {
  sourceLanguage?: string | null;
  targetLanguage: string;
  segments: TranslationSegmentInput[];
}

export interface TranslationProvider {
  translate(input: TranslateInput): Promise<TranslationResult>;
}

export class TranslationProviderNotConfiguredError extends Error {
  constructor(message = "No translation provider is configured.") {
    super(message);
    this.name = "TranslationProviderNotConfiguredError";
  }
}

interface OpenAIChatCompletionResponse {
  id?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
      refusal?: string | null;
    };
  }>;
}

class OpenAITranslationProvider implements TranslationProvider {
  private readonly model: string;

  constructor() {
    this.model = requireConfiguredOpenAIModel({
      envVar: "OPENAI_TRANSLATION_MODEL",
      defaultValue: "gpt-4o-mini",
      selectedProvider: "TRANSLATION_PROVIDER",
      purpose: "translation",
    });
  }

  async translate(input: TranslateInput): Promise<TranslationResult> {
    const response = await assertOpenAIResponse(
      await fetch(`${getOpenAIBaseUrl()}/chat/completions`, {
        method: "POST",
        headers: getOpenAITextHeaders(),
        body: JSON.stringify({
          model: this.model,
          temperature: 0.2,
          response_format: { type: "json_object" },
          messages: [
            {
              role: "developer",
              content: buildDeveloperInstruction(input),
            },
            {
              role: "user",
              content: JSON.stringify({
                sourceLanguage: input.sourceLanguage ?? null,
                targetLanguage: input.targetLanguage,
                segments: input.segments,
              }),
            },
          ],
        }),
      }),
      "translation request",
    );
    const payload = (await response.json()) as OpenAIChatCompletionResponse;
    const message = payload.choices?.[0]?.message;

    if (message?.refusal) {
      throw new Error(`OpenAI translation refused the request: ${message.refusal}`);
    }

    if (typeof message?.content !== "string" || !message.content.trim()) {
      throw new Error("OpenAI translation response did not include JSON content.");
    }

    const parsed = parseTranslationPayload(message.content);
    const segments = normalizeTranslatedSegments(parsed, input.segments.length);

    return {
      provider: "openai",
      providerResponseId: payload.id ?? null,
      sourceLanguage: input.sourceLanguage ?? null,
      targetLanguage: input.targetLanguage,
      segments,
    };
  }
}

function buildDeveloperInstruction(input: TranslateInput): string {
  return [
    "You translate transcript segments for a media localization pipeline.",
    `Translate into ${input.targetLanguage}.`,
    input.sourceLanguage
      ? `The source language is ${input.sourceLanguage}.`
      : "The source language may be unknown; infer it from the input.",
    "Return valid JSON with exactly one key named segments.",
    "segments must be an array with the same length and ordering as the input.",
    "Each item must contain segmentIndex and translatedText.",
    "Preserve meaning, punctuation, and segment boundaries.",
    "Do not omit or merge segments.",
  ].join(" ");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTranslationPayload(content: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(content) as unknown;

    if (!isRecord(parsed)) {
      throw new Error("OpenAI translation returned a non-object JSON payload.");
    }

    return parsed;
  } catch {
    throw new Error("OpenAI translation returned invalid JSON.");
  }
}

function normalizeTranslatedSegments(
  payload: Record<string, unknown>,
  expectedCount: number,
): TranslationSegmentResult[] {
  const keys = Object.keys(payload);

  if (keys.length !== 1 || keys[0] !== "segments") {
    throw new Error(
      "OpenAI translation response must contain exactly one top-level key named segments.",
    );
  }

  const rawSegments = payload.segments;

  if (!Array.isArray(rawSegments) || rawSegments.length !== expectedCount) {
    throw new Error(
      `OpenAI translation returned ${Array.isArray(rawSegments) ? rawSegments.length : 0} segments; expected ${expectedCount}.`,
    );
  }

  return rawSegments.map((segment, index) => {
    if (!isRecord(segment)) {
      throw new Error(
        `OpenAI translation returned a non-object segment at index ${index}.`,
      );
    }

    const segmentKeys = Object.keys(segment).sort();
    const expectedKeys = ["segmentIndex", "translatedText"];

    if (
      segmentKeys.length !== expectedKeys.length ||
      !expectedKeys.every((key, keyIndex) => segmentKeys[keyIndex] === key)
    ) {
      throw new Error(
        `OpenAI translation returned unexpected fields for segment ${index}.`,
      );
    }

    if (
      segment.segmentIndex !== index ||
      typeof segment.translatedText !== "string" ||
      !segment.translatedText.trim()
    ) {
      throw new Error(
        `OpenAI translation returned an invalid translated segment at index ${index}.`,
      );
    }

    return {
      segmentIndex: segment.segmentIndex,
      translatedText: segment.translatedText,
    };
  });
}

class MockTranslationProvider implements TranslationProvider {
  async translate(input: TranslateInput): Promise<TranslationResult> {
    const prefix = process.env.TRANSLATION_MOCK_PREFIX ?? `[${input.targetLanguage}]`;
    const segments: TranslationSegmentResult[] = input.segments.map((segment) => ({
      segmentIndex: segment.segmentIndex,
      translatedText: `${prefix} ${segment.text}`.trim(),
    }));

    return {
      provider: "mock",
      providerResponseId: `mock:${input.targetLanguage}:${input.segments.length}`,
      sourceLanguage: input.sourceLanguage ?? "en",
      targetLanguage: input.targetLanguage,
      segments,
    };
  }
}

class NotConfiguredTranslationProvider implements TranslationProvider {
  async translate(): Promise<TranslationResult> {
    throw new TranslationProviderNotConfiguredError();
  }
}

function getConfiguredProviderName(): string {
  return (process.env.TRANSLATION_PROVIDER ?? "").trim().toLowerCase();
}

export function getTranslationProvider(): TranslationProvider {
  const provider = getConfiguredProviderName();

  if (provider === "openai") {
    return new OpenAITranslationProvider();
  }

  if (provider === "mock") {
    return new MockTranslationProvider();
  }

  return new NotConfiguredTranslationProvider();
}

export async function translateSegments(
  input: TranslateInput,
): Promise<TranslationResult> {
  if (input.segments.length === 0) {
    throw new Error("Translation requires at least one segment.");
  }

  const invalidSegment = input.segments.find(
    (segment, index) =>
      segment.segmentIndex !== index || !segment.text.trim(),
  );

  if (invalidSegment) {
    throw new Error(
      "Translation segments must use sequential indexes starting at 0 and contain non-empty text.",
    );
  }

  if (!input.targetLanguage.trim()) {
    throw new Error("Translation requires a non-empty target language.");
  }

  const provider = getTranslationProvider();

  return provider.translate(input);
}
