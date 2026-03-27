import type { CreateJobResponse, OutputMode } from "@/types/jobs";

export type UploadFlowPhase = "upload_init" | "storage_upload" | "job_creation";

export class UploadFlowError extends Error {
  constructor(
    public readonly phase: UploadFlowPhase,
    message: string,
  ) {
    super(message);
    this.name = "UploadFlowError";
  }
}

export interface UploadInitClientRequest {
  filename: string;
  mimeType: string;
  fileSizeBytes: number;
  durationSeconds: number;
}

export interface UploadInitClientResponse {
  uploadId: string;
  storageBucket: "media";
  storagePath: string;
  maxFileSizeBytes: number;
  acceptedMimeTypes: string[];
}

export interface StartUploadFlowInput {
  accessToken: string;
  file: File;
  durationSeconds: number;
  outputMode: OutputMode;
  targetLanguages: string[];
  uploadFile: (
    bucket: string,
    path: string,
    file: File,
  ) => Promise<void>;
}

async function parseJsonResponse<T>(response: Response): Promise<T> {
  let payload: unknown;

  try {
    payload = await response.json();
  } catch {
    throw new Error("Server returned an invalid JSON response.");
  }

  if (!response.ok) {
    const errorMessage =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : "Request failed.";

    throw new Error(errorMessage);
  }

  return payload as T;
}

export async function requestUploadInit(
  accessToken: string,
  request: UploadInitClientRequest,
): Promise<UploadInitClientResponse> {
  try {
    const response = await fetch("/api/uploads/init", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(request),
    });

    return parseJsonResponse<UploadInitClientResponse>(response);
  } catch (error) {
    if (error instanceof UploadFlowError) {
      throw error;
    }

    throw new UploadFlowError(
      "upload_init",
      error instanceof Error ? error.message : "Failed to initialize upload.",
    );
  }
}

export async function requestJobCreation(
  accessToken: string,
  request: {
    storageBucket: string;
    storagePath: string;
    sourceFilename: string;
    sourceMimeType: string;
    durationSeconds: number;
    outputMode: OutputMode;
    targetLanguages: string[];
  },
): Promise<CreateJobResponse> {
  try {
    const response = await fetch("/api/jobs/create", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(request),
    });

    return parseJsonResponse<CreateJobResponse>(response);
  } catch (error) {
    if (error instanceof UploadFlowError) {
      throw error;
    }

    throw new UploadFlowError(
      "job_creation",
      error instanceof Error ? error.message : "Failed to create job.",
    );
  }
}

export async function startUploadFlow(
  input: StartUploadFlowInput,
): Promise<CreateJobResponse> {
  const uploadInit = await requestUploadInit(input.accessToken, {
    filename: input.file.name,
    mimeType: input.file.type,
    fileSizeBytes: input.file.size,
    durationSeconds: input.durationSeconds,
  });

  try {
    await input.uploadFile(uploadInit.storageBucket, uploadInit.storagePath, input.file);
  } catch (error) {
    throw new UploadFlowError(
      "storage_upload",
      error instanceof Error ? error.message : "Failed to upload the source file.",
    );
  }

  return requestJobCreation(input.accessToken, {
    storageBucket: uploadInit.storageBucket,
    storagePath: uploadInit.storagePath,
    sourceFilename: input.file.name,
    sourceMimeType: input.file.type,
    durationSeconds: input.durationSeconds,
    outputMode: input.outputMode,
    targetLanguages: input.targetLanguages,
  });
}

export function isUploadFlowError(error: unknown): error is UploadFlowError {
  return error instanceof UploadFlowError;
}
