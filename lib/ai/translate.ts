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

  const provider = getTranslationProvider();

  return provider.translate(input);
}
