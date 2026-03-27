import type { JobDetailView } from "@/lib/jobs/readJobViews";
import type { JobStatus, RetryJobResponse } from "@/types/jobs";

export interface JobActionMessage {
  tone: "success" | "warning" | "error" | "info";
  title: string;
  message: string;
  href?: string;
  hrefLabel?: string;
}

type RoutePayload = { error?: string };

const CANCELABLE_STATUSES: JobStatus[] = [
  "created",
  "queued",
  "normalizing",
  "extracting_audio",
  "transcribing",
  "transcript_ready",
  "translating",
  "generating_subtitles",
  "generating_dubbed_audio",
  "lip_sync_pending",
];

export function canCancelJob(job: Pick<JobDetailView, "status" | "cancelRequestedAt">): boolean {
  return CANCELABLE_STATUSES.includes(job.status) && !job.cancelRequestedAt;
}

export function canRetryJob(status: JobStatus): boolean {
  return status === "failed" || status === "partial_success";
}

export function getRetryButtonCopy(job: Pick<JobDetailView, "status">): string {
  return job.status === "partial_success" ? "Retry failed targets" : "Retry job";
}

export function getCancelPendingMessage(
  job: Pick<JobDetailView, "status" | "cancelRequestedAt">,
): JobActionMessage | null {
  if (!job.cancelRequestedAt || !CANCELABLE_STATUSES.includes(job.status)) {
    return null;
  }

  return {
    tone: "info",
    title: "Cancellation requested",
    message:
      "Cancellation requested. The worker will stop at the next safe checkpoint.",
  };
}

export function getCancelSuccessMessage(): JobActionMessage {
  return {
    tone: "info",
    title: "Cancellation requested",
    message:
      "Cancellation requested. The worker will stop at the next safe checkpoint.",
  };
}

export function getRetrySuccessMessage(
  job: Pick<JobDetailView, "status">,
  response: RetryJobResponse,
): JobActionMessage {
  return {
    tone: "success",
    title: "Retry started as a new job attempt",
    message:
      job.status === "partial_success"
        ? "This retry will run only for targets that previously failed. Existing successful outputs remain available on the original job."
        : "This retry will run as a new attempt for all original targets. The original job remains unchanged.",
    href: `/dashboard/jobs/${response.jobId}`,
    hrefLabel: "Open retry attempt",
  };
}

function mapRouteErrorMessage(action: "cancel" | "retry", message: string): string {
  if (message.includes("Authentication is required")) {
    return "Sign in again to continue.";
  }

  if (action === "cancel" && message.includes("Only queued or active jobs can be canceled")) {
    return "This job can no longer be canceled.";
  }

  if (action === "retry" && message.includes("Only failed or partial-success jobs can be retried")) {
    return "This job is not eligible for retry.";
  }

  if (action === "retry" && message.includes("This job has no failed targets to retry")) {
    return "There are no failed targets left to retry for this job.";
  }

  if (action === "retry" && message.includes("Retry requires a job duration")) {
    return "This job cannot be retried safely because the original duration is missing.";
  }

  return message;
}

export function getJobActionErrorMessage(
  action: "cancel" | "retry",
  error: unknown,
): JobActionMessage {
  const title = action === "cancel" ? "Could not request cancellation" : "Could not start retry";

  if (error instanceof Error) {
    return {
      tone: "error",
      title,
      message: mapRouteErrorMessage(action, error.message),
    };
  }

  return {
    tone: "error",
    title,
    message:
      action === "cancel"
        ? "Something went wrong while requesting cancellation."
        : "Something went wrong while starting the retry attempt.",
  };
}

export async function parseRoutePayload<TResponse>(
  response: Response,
  fallbackMessage: string,
): Promise<TResponse> {
  let payload: TResponse | RoutePayload | null = null;

  try {
    payload = (await response.json()) as TResponse | RoutePayload;
  } catch {
    throw new Error(fallbackMessage);
  }

  if (!response.ok) {
    const routeError =
      payload &&
      typeof payload === "object" &&
      "error" in payload &&
      typeof payload.error === "string"
        ? payload.error
        : fallbackMessage;

    throw new Error(routeError);
  }

  return payload as TResponse;
}
