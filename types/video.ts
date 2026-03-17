export interface LipSyncRequest {
  targetLanguage: string;
  sourceVideoPath: string;
  dubbedAudioPath: string;
  callbackUrl?: string | null;
}

export interface LipSyncRequestResult {
  provider: string;
  providerJobId: string | null;
  targetLanguage: string;
  status: "requested";
  submittedAt: string;
}

export interface LipSyncWebhookPayload {
  providerJobId: string;
  status: "completed" | "failed";
  dubbedVideoPath?: string | null;
  errorMessage?: string | null;
}
