"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { getBrowserSession } from "@/lib/supabase/browser";
import { JobProgressTimeline } from "@/components/job-progress-timeline";
import type { CancelJobResponse, RetryJobResponse } from "@/types/jobs";
import type { JobDetailView as JobDetailViewModel } from "@/lib/jobs/readJobViews";
import {
  getJobOutcomeMessage,
  getTargetFailureMessage,
} from "@/lib/ui/errorMessages";
import {
  canCancelJob,
  canRetryJob,
  getCancelPendingMessage,
  getCancelSuccessMessage,
  getJobActionErrorMessage,
  getRetryButtonCopy,
  getRetrySuccessMessage,
  parseRoutePayload,
  type JobActionMessage,
} from "@/lib/ui/jobActions";

interface JobDetailViewProps {
  jobId: string;
}

type JobDetailResponse =
  | JobDetailViewModel
  | { error?: string };

function isJobDetailPayload(payload: JobDetailResponse): payload is JobDetailViewModel {
  return "id" in payload && "targets" in payload;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Not available yet";
  }

  return new Date(value).toLocaleString();
}

function formatDuration(durationSeconds: number | null): string {
  if (durationSeconds === null) {
    return "Unknown";
  }

  const minutes = Math.floor(durationSeconds / 60);
  const seconds = durationSeconds % 60;

  return `${minutes} min ${String(seconds).padStart(2, "0")} sec`;
}

function getJobStatusTone(status: JobDetailViewModel["status"]): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "partial_success":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    case "canceled":
      return "border-stone-300 bg-stone-100 text-stone-700";
    default:
      return "border-sky-200 bg-sky-50 text-sky-800";
  }
}

function getTargetStatusTone(status: JobDetailViewModel["targets"][number]["status"]): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "audio_ready":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "lipsync_requested":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-stone-200 bg-stone-50 text-stone-700";
  }
}

function getOutcomeToneClass(
  tone: "success" | "warning" | "error" | "info",
): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-900";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-900";
    case "error":
      return "border-red-200 bg-red-50 text-red-800";
    default:
      return "border-sky-200 bg-sky-50 text-sky-900";
  }
}

async function fetchJobDetail(jobId: string): Promise<JobDetailViewModel> {
  const session = await getBrowserSession();

  if (!session?.access_token) {
    throw new Error("Sign in to load this job.");
  }

  const response = await fetch(`/api/jobs/${jobId}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
    },
    cache: "no-store",
  });
  const payload = (await response.json()) as JobDetailResponse;

  if (!response.ok) {
    throw new Error(
      "error" in payload && typeof payload.error === "string"
        ? payload.error
        : "Failed to load job details.",
    );
  }

  if (!isJobDetailPayload(payload)) {
    throw new Error("Failed to load job details.");
  }

  return payload;
}

export function JobDetailView({ jobId }: JobDetailViewProps) {
  const router = useRouter();
  const [job, setJob] = useState<JobDetailViewModel | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionState, setActionState] = useState<"cancel" | "retry" | null>(null);
  const [actionMessage, setActionMessage] = useState<JobActionMessage | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadJob() {
      setIsLoading(true);
      setError(null);

      try {
        const nextJob = await fetchJobDetail(jobId);

        if (!cancelled) {
          setJob(nextJob);
        }
      } catch (loadError) {
        if (!cancelled) {
          setJob(null);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load job details.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadJob();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function refreshJobAfterAction(): Promise<JobDetailViewModel> {
    const nextJob = await fetchJobDetail(jobId);
    setJob(nextJob);
    router.refresh();
    return nextJob;
  }

  async function handleCancel() {
    if (!job || !canCancelJob(job)) {
      return;
    }

    setActionState("cancel");
    setActionMessage(null);

    try {
      const session = await getBrowserSession();

      if (!session?.access_token) {
        throw new Error("Authentication is required.");
      }

      const response = await fetch(`/api/jobs/${jobId}/cancel`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      });
      await parseRoutePayload<CancelJobResponse>(
        response,
        "Failed to request cancellation.",
      );

      await refreshJobAfterAction();
      setActionMessage(getCancelSuccessMessage());
    } catch (actionError) {
      setActionMessage(getJobActionErrorMessage("cancel", actionError));
    } finally {
      setActionState(null);
    }
  }

  async function handleRetry() {
    if (!job || !canRetryJob(job.status)) {
      return;
    }

    setActionState("retry");
    setActionMessage(null);

    try {
      const session = await getBrowserSession();

      if (!session?.access_token) {
        throw new Error("Authentication is required.");
      }

      const response = await fetch(`/api/jobs/${jobId}/retry`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      const payload = await parseRoutePayload<RetryJobResponse>(
        response,
        "Failed to start retry attempt.",
      );

      await refreshJobAfterAction();
      setActionMessage(getRetrySuccessMessage(job, payload));
    } catch (actionError) {
      setActionMessage(getJobActionErrorMessage("retry", actionError));
    } finally {
      setActionState(null);
    }
  }

  if (isLoading) {
    return (
      <section className="rounded-[2rem] border border-dashed border-stone-300 bg-stone-50 p-8 text-sm text-stone-600">
        Loading job details...
      </section>
    );
  }

  if (error) {
    return (
      <section className="rounded-[2rem] border border-red-200 bg-red-50 p-8 text-sm text-red-700">
        {error}
      </section>
    );
  }

  if (!job) {
    return (
      <section className="rounded-[2rem] border border-dashed border-stone-300 bg-stone-50 p-8 text-sm text-stone-600">
        Job details are not available.
      </section>
    );
  }

  const outcomeMessage = getJobOutcomeMessage(job);
  const pendingCancelMessage = getCancelPendingMessage(job);
  const showCancel = canCancelJob(job);
  const showRetry = canRetryJob(job.status);

  return (
    <>
      <section className="rounded-[2rem] border border-stone-200/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(66,50,20,0.08)] backdrop-blur">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
              Job detail
            </p>
            <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950">
              {job.sourceName}
            </h1>
            <div className="mt-4 flex flex-wrap gap-3 text-sm text-stone-600">
              <span className="rounded-full bg-stone-100 px-4 py-2">Job ID: {job.id}</span>
              <span className="rounded-full bg-stone-100 px-4 py-2">Mode: {job.outputMode}</span>
              <span className="rounded-full bg-stone-100 px-4 py-2">Status: {job.status}</span>
              <span className="rounded-full bg-stone-100 px-4 py-2">
                Targets: {job.targets.length}
              </span>
            </div>
          </div>

          {showCancel || showRetry ? (
            <div className="flex flex-col gap-3 lg:min-w-[18rem]">
              {showCancel ? (
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={actionState !== null}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-red-300 bg-red-50 px-5 text-sm font-semibold text-red-700 transition hover:border-red-500 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionState === "cancel" ? "Requesting cancellation..." : "Cancel job"}
                </button>
              ) : null}

              {showRetry ? (
                <button
                  type="button"
                  onClick={handleRetry}
                  disabled={actionState !== null}
                  className="inline-flex h-12 items-center justify-center rounded-full border border-stone-300 bg-white px-5 text-sm font-semibold text-stone-800 transition hover:border-stone-900 hover:text-stone-950 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {actionState === "retry"
                    ? "Starting retry..."
                    : getRetryButtonCopy(job)}
                </button>
              ) : null}

              {showRetry ? (
                <p className="text-sm leading-6 text-stone-600">
                  {job.status === "partial_success"
                    ? "This retry will run only for targets that previously failed. Existing successful outputs remain on this job."
                    : "This retry creates a new attempt for all original targets and leaves this job unchanged."}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </section>

      {pendingCancelMessage ? (
        <section
          className={`rounded-[2rem] border p-6 shadow-[0_12px_40px_rgba(30,41,59,0.06)] ${getOutcomeToneClass(pendingCancelMessage.tone)}`}
        >
          <p className="text-sm font-semibold uppercase tracking-[0.2em]">
            {pendingCancelMessage.title}
          </p>
          <p className="mt-2 text-sm leading-7">{pendingCancelMessage.message}</p>
        </section>
      ) : null}

      {actionMessage ? (
        <section
          className={`rounded-[2rem] border p-6 shadow-[0_12px_40px_rgba(30,41,59,0.06)] ${getOutcomeToneClass(actionMessage.tone)}`}
        >
          <p className="text-sm font-semibold uppercase tracking-[0.2em]">
            {actionMessage.title}
          </p>
          <p className="mt-2 text-sm leading-7">{actionMessage.message}</p>
          {actionMessage.href && actionMessage.hrefLabel ? (
            <div className="mt-4">
              <Link
                href={actionMessage.href}
                className="inline-flex h-11 items-center justify-center rounded-full border border-current/30 px-5 text-sm font-semibold transition hover:border-current"
              >
                {actionMessage.hrefLabel}
              </Link>
            </div>
          ) : null}
        </section>
      ) : null}

      {outcomeMessage ? (
        <section
          className={`rounded-[2rem] border p-6 shadow-[0_12px_40px_rgba(30,41,59,0.06)] ${getOutcomeToneClass(outcomeMessage.tone)}`}
        >
          <p className="text-sm font-semibold uppercase tracking-[0.2em]">
            {outcomeMessage.title}
          </p>
          <p className="mt-2 text-sm leading-7">{outcomeMessage.message}</p>
        </section>
      ) : null}

      <section className="grid gap-6 lg:grid-cols-[1fr_0.95fr_0.95fr]">
        <article className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
          <h2 className="text-xl font-semibold text-stone-950">Source media</h2>
          <dl className="mt-5 grid gap-3 text-sm text-stone-600">
            <div>
              <dt className="font-medium text-stone-800">File</dt>
              <dd>{job.sourceName}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Duration</dt>
              <dd>{formatDuration(job.durationSeconds)}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Original path</dt>
              <dd className="break-all">{job.sourceMediaPath}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Normalized path</dt>
              <dd className="break-all">{job.normalizedMediaPath ?? "Not available yet"}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Extracted audio</dt>
              <dd className="break-all">{job.extractedAudioPath ?? "Not available yet"}</dd>
            </div>
          </dl>
        </article>

        <article className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
          <h2 className="text-xl font-semibold text-stone-950">Job status</h2>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <span
              className={`rounded-full border px-4 py-2 text-sm font-semibold ${getJobStatusTone(job.status)}`}
            >
              {job.status}
            </span>
            <span className="rounded-full bg-stone-100 px-4 py-2 text-sm text-stone-700">
              Mode: {job.outputMode}
            </span>
          </div>
          <dl className="mt-5 grid gap-3 text-sm text-stone-600">
            <div>
              <dt className="font-medium text-stone-800">Source language</dt>
              <dd>{job.sourceLanguage ?? "Not detected yet"}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Estimated credits</dt>
              <dd>{job.estimatedCredits}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Reserved credits</dt>
              <dd>{job.reservedCredits}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Finalized credits</dt>
              <dd>{job.finalizedCredits}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Created at</dt>
              <dd>{formatDateTime(job.createdAt)}</dd>
            </div>
            <div>
              <dt className="font-medium text-stone-800">Completed at</dt>
              <dd>{job.completedAt ? formatDateTime(job.completedAt) : "Still running"}</dd>
            </div>
            {job.cancelRequestedAt ? (
              <div>
                <dt className="font-medium text-stone-800">Cancel requested at</dt>
                <dd>{formatDateTime(job.cancelRequestedAt)}</dd>
              </div>
            ) : null}
            {job.retryOfJobId ? (
              <div>
                <dt className="font-medium text-stone-800">Retry of job</dt>
                <dd>
                  <Link
                    href={`/dashboard/jobs/${job.retryOfJobId}`}
                    className="text-stone-900 underline decoration-stone-300 underline-offset-4"
                  >
                    {job.retryOfJobId}
                  </Link>
                </dd>
              </div>
            ) : null}
            {job.errorMessage ? (
              <div>
                <dt className="font-medium text-red-700">Latest job error</dt>
                <dd className="text-red-600">
                  {job.status === "partial_success"
                    ? `Some outputs are still available. ${job.errorMessage}`
                    : job.errorMessage}
                </dd>
              </div>
            ) : null}
          </dl>
        </article>

        <article className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
          <h2 className="text-xl font-semibold text-stone-950">Progress timeline</h2>
          <p className="mt-2 text-sm leading-7 text-stone-600">
            This now reflects the real job state and the current target-level
            outcome counts.
          </p>
          <div className="mt-6">
            <JobProgressTimeline
              status={job.status}
              outputMode={job.outputMode}
              targets={job.targets.map((target) => ({
                status: target.status,
                targetLanguage: target.targetLanguage,
              }))}
            />
          </div>
        </article>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold text-stone-950">Output artifacts</h2>
              <p className="mt-2 max-w-2xl text-sm leading-7 text-stone-600">
                Target rows are now driven by real `job_targets` data and signed
                storage URLs for artifacts that already exist durably.
              </p>
            </div>
            <Link
              href="/dashboard"
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
            >
              Back to dashboard
            </Link>
          </div>

          <div className="mt-8 grid gap-4">
            {job.targets.map((target) => (
              <article
                key={target.id}
                className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 p-5"
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="text-lg font-semibold text-stone-950">
                        {target.targetLanguage.toUpperCase()}
                      </h3>
                      <span
                        className={`rounded-full border px-3 py-1 text-xs font-medium ${getTargetStatusTone(target.status)}`}
                      >
                        {target.status}
                      </span>
                    </div>

                    <dl className="grid gap-2 text-sm text-stone-600">
                      <div>
                        <dt className="font-medium text-stone-800">Subtitle path</dt>
                        <dd className="break-all">{target.subtitlePath ?? "Not available yet"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-stone-800">Dubbed audio path</dt>
                        <dd className="break-all">{target.dubbedAudioPath ?? "Not available yet"}</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-stone-800">Lip-sync video path</dt>
                        <dd className="break-all">{target.dubbedVideoPath ?? "Not available yet"}</dd>
                      </div>
                      {target.providerJobId ? (
                        <div>
                          <dt className="font-medium text-stone-800">Provider job ID</dt>
                          <dd className="break-all">{target.providerJobId}</dd>
                        </div>
                      ) : null}
                      {target.errorMessage ? (
                        <div>
                          <dt className="font-medium text-red-700">Latest error</dt>
                          <dd className="text-red-600">
                            {getTargetFailureMessage(target) ?? target.errorMessage}
                          </dd>
                        </div>
                      ) : null}
                    </dl>
                  </div>

                  <div className="flex flex-col gap-3 md:items-end">
                    {target.subtitleUrl ? (
                      <div className="flex flex-wrap justify-end gap-3">
                        <a
                          href={target.subtitleUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-11 items-center justify-center rounded-full border border-sky-700 px-5 text-sm font-semibold text-sky-700 transition hover:bg-sky-700 hover:text-white"
                        >
                          View subtitles
                        </a>
                        <a
                          href={target.subtitleUrl}
                          download
                          className="inline-flex h-11 items-center justify-center rounded-full bg-sky-600 px-5 text-sm font-semibold text-white transition hover:bg-sky-500"
                        >
                          Download subtitles
                        </a>
                      </div>
                    ) : null}

                    {target.dubbedAudioUrl ? (
                      <a
                        href={target.dubbedAudioUrl}
                        download
                        className="inline-flex h-11 items-center justify-center rounded-full bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
                      >
                        Download audio
                      </a>
                    ) : null}

                    {target.dubbedVideoUrl ? (
                      <div className="flex flex-wrap justify-end gap-3">
                        <a
                          href={target.dubbedVideoUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-11 items-center justify-center rounded-full border border-stone-950 px-5 text-sm font-semibold text-stone-950 transition hover:bg-stone-950 hover:text-white"
                        >
                          View video
                        </a>
                        <a
                          href={target.dubbedVideoUrl}
                          download
                          className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                        >
                          Download video
                        </a>
                      </div>
                    ) : null}

                    {!target.subtitleUrl && !target.dubbedAudioUrl && !target.dubbedVideoUrl ? (
                      <div className="rounded-full border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500">
                        {target.status === "failed"
                          ? "No usable artifacts were produced for this target."
                          : target.status === "lipsync_requested"
                            ? "Lip-sync is still rendering for this target."
                            : "No durable artifacts are available for this target yet."}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
          <h2 className="text-xl font-semibold text-stone-950">Output notes</h2>
          <div className="mt-5 grid gap-4 text-sm text-stone-600">
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="font-medium text-stone-800">Real artifact status</p>
              <p className="mt-1 leading-6">
                Download actions appear only when durable storage paths exist for the
                target. Partial-success jobs keep successful outputs visible.
              </p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="font-medium text-stone-800">Signed URLs</p>
              <p className="mt-1 leading-6">
                Artifact links are signed from Supabase Storage at read time rather
                than assuming public object paths.
              </p>
            </div>
            <div className="rounded-2xl bg-stone-50 p-4">
              <p className="font-medium text-stone-800">Transcript editor</p>
              <p className="mt-1 leading-6">
                Transcript editing remains unchanged below and still reads/writes
                through the existing transcript route.
              </p>
            </div>
          </div>
        </aside>
      </section>
    </>
  );
}
