import type { LipSyncRequest, LipSyncRequestResult } from "@/types/video";

export interface LipSyncProvider {
  request(input: LipSyncRequest): Promise<LipSyncRequestResult>;
}

export class LipSyncProviderNotConfiguredError extends Error {
  constructor(message = "No lip-sync provider is configured.") {
    super(message);
    this.name = "LipSyncProviderNotConfiguredError";
  }
}

function getConfiguredProviderName(): string {
  return (process.env.LIPSYNC_PROVIDER ?? "").trim().toLowerCase();
}

function validateLipSyncRequest(input: LipSyncRequest): void {
  if (!input.targetLanguage.trim()) {
    throw new Error("Lip-sync requests require a target language.");
  }

  if (!input.sourceVideoPath.trim()) {
    throw new Error("Lip-sync requests require a source video path.");
  }

  if (!input.dubbedAudioPath.trim()) {
    throw new Error("Lip-sync requests require a dubbed audio path.");
  }
}

class MockLipSyncProvider implements LipSyncProvider {
  async request(input: LipSyncRequest): Promise<LipSyncRequestResult> {
    return {
      provider: "mock",
      providerJobId: `mock:${input.targetLanguage}:${input.sourceVideoPath}`,
      targetLanguage: input.targetLanguage,
      status: "requested",
      submittedAt: new Date().toISOString(),
    };
  }
}

class NotConfiguredLipSyncProvider implements LipSyncProvider {
  async request(): Promise<LipSyncRequestResult> {
    throw new LipSyncProviderNotConfiguredError();
  }
}

export function getLipSyncProvider(): LipSyncProvider {
  const provider = getConfiguredProviderName();

  if (provider === "mock") {
    return new MockLipSyncProvider();
  }

  return new NotConfiguredLipSyncProvider();
}

export async function requestLipSync(
  input: LipSyncRequest,
): Promise<LipSyncRequestResult> {
  validateLipSyncRequest(input);

  const provider = getLipSyncProvider();

  return provider.request(input);
}
