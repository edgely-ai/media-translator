import { MAX_MEDIA_DURATION_SECONDS } from "@/lib/storage/upload-init";
import { isUploadFlowError, type UploadFlowPhase } from "@/lib/storage/upload-flow";
import type { JobDetailView } from "@/lib/jobs/readJobViews";
import type { OutputMode } from "@/types/jobs";

export interface UploadErrorDisplay {
  title: string;
  message: string;
}

export interface JobOutcomeMessage {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
}

export function getUploadValidationError(params: {
  file: File | null;
  durationSeconds: string;
  outputMode: OutputMode;
  targetLanguageInput: string;
}): UploadErrorDisplay | null {
  const { file, durationSeconds, outputMode, targetLanguageInput } = params;

  if (!file) {
    return {
      title: "Choose a source file",
      message: "Select an audio or video file before creating a job.",
    };
  }

  const parsedDuration = Number(durationSeconds);

  if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
    return {
      title: "Enter a valid duration",
      message: "Duration must be a positive number of seconds.",
    };
  }

  if (parsedDuration > MAX_MEDIA_DURATION_SECONDS) {
    return {
      title: "Media is too long for V1",
      message: `Version 1 supports media up to ${MAX_MEDIA_DURATION_SECONDS} seconds.`,
    };
  }

  if (!targetLanguageInput.trim()) {
    return {
      title: "Add at least one target language",
      message: "Enter one or more target language codes, separated by commas.",
    };
  }

  if (outputMode === "lip_sync" && !file.type.startsWith("video/")) {
    return {
      title: "Lip-sync needs a video file",
      message: "Choose a video source if you want lip-sync output.",
    };
  }

  return null;
}

function formatUploadPhaseTitle(phase: UploadFlowPhase): string {
  switch (phase) {
    case "upload_init":
      return "Could not prepare the upload";
    case "storage_upload":
      return "File upload failed";
    case "job_creation":
      return "Upload succeeded, but job creation failed";
    default:
      return "Job setup failed";
  }
}

function mapBackendErrorMessage(message: string): string {
  if (message.includes("mimeType is not supported")) {
    return "This file type is not supported. Choose a supported audio or video format.";
  }

  if (message.includes("filename extension is not supported")) {
    return "This file extension is not supported. Rename the file with a supported extension or choose a different file.";
  }

  if (message.includes("durationSeconds exceeds")) {
    return `This media exceeds the V1 limit of ${MAX_MEDIA_DURATION_SECONDS} seconds.`;
  }

  if (message.includes("targetLanguages must contain at least one language")) {
    return "Add at least one target language before creating a job.";
  }

  if (message.includes("outputMode is invalid")) {
    return "Choose a valid output mode before creating a job.";
  }

  if (message.includes("lip_sync output requires a video source file")) {
    return "Lip-sync output requires a video source file.";
  }

  if (message.includes("Insufficient credits")) {
    return "You do not have enough credits for this job. Review billing or lower the scope of the request.";
  }

  if (message.includes("Source object was not found")) {
    return "The upload finished, but the source file could not be found in storage. Try uploading again.";
  }

  if (message.includes("Failed to verify source object in storage")) {
    return "We could not verify the uploaded file in storage right now. Please try again.";
  }

  if (message.includes("Authentication is required")) {
    return "Sign in again to continue.";
  }

  if (message.includes("Server returned an invalid JSON response")) {
    return "The server returned an unexpected response. Please try again.";
  }

  return message;
}

export function getUploadErrorDisplay(error: unknown): UploadErrorDisplay {
  if (isUploadFlowError(error)) {
    return {
      title: formatUploadPhaseTitle(error.phase),
      message: mapBackendErrorMessage(error.message),
    };
  }

  if (error instanceof Error) {
    return {
      title: "Job setup failed",
      message: mapBackendErrorMessage(error.message),
    };
  }

  return {
    title: "Job setup failed",
    message: "Something went wrong while uploading media or creating the job.",
  };
}

export function getJobOutcomeMessage(job: JobDetailView): JobOutcomeMessage | null {
  if (job.status === "completed") {
    return {
      tone: "success",
      title: "Job completed",
      message: "All requested targets finished successfully and the available outputs are ready below.",
    };
  }

  if (job.status === "partial_success") {
    const lipSyncFailures = job.targets.filter(
      (target) =>
        target.status === "failed" &&
        Boolean(target.subtitlePath || target.dubbedAudioPath) &&
        !target.dubbedVideoPath,
    );

    if (lipSyncFailures.length > 0) {
      return {
        tone: "warning",
        title: "Usable outputs are available",
        message:
          "Some lip-sync renders failed, but subtitles or dubbed audio succeeded for other targets. Download the available outputs below.",
      };
    }

    return {
      tone: "warning",
      title: "Job partially succeeded",
      message:
        "Some targets completed and some failed. Available outputs are still usable and remain listed below.",
      };
  }

  if (job.status === "failed") {
    return {
      tone: "error",
      title: "Job failed",
      message:
        job.errorMessage ??
        "Processing stopped before any usable output was produced for this job.",
    };
  }

  return {
    tone: "info",
    title: "Job is still processing",
    message: "Outputs will appear as each pipeline stage completes.",
  };
}

export function getTargetFailureMessage(
  target: JobDetailView["targets"][number],
): string | null {
  if (target.status !== "failed") {
    return null;
  }

  if ((target.subtitlePath || target.dubbedAudioPath) && !target.dubbedVideoPath) {
    return "Lip-sync failed for this target, but earlier outputs are still available.";
  }

  return target.errorMessage ?? "This target failed before a usable output was produced.";
}
