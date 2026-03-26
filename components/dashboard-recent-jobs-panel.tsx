"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getBrowserSession } from "@/lib/supabase/browser";
import type { DashboardRecentJobView } from "@/lib/jobs/readJobViews";

type DashboardJobsResponse =
  | { jobs: DashboardRecentJobView[] }
  | { error?: string };

function hasJobsResponse(
  payload: DashboardJobsResponse,
): payload is { jobs: DashboardRecentJobView[] } {
  return "jobs" in payload && Array.isArray(payload.jobs);
}

function getStatusTone(status: DashboardRecentJobView["status"]): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "partial_success":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "lip_sync_pending":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-stone-200 bg-stone-50 text-stone-700";
  }
}

function formatRelativeDate(dateString: string): string {
  const value = new Date(dateString);
  const deltaMs = Date.now() - value.getTime();
  const deltaMinutes = Math.max(1, Math.round(deltaMs / 60_000));

  if (deltaMinutes < 60) {
    return `Updated ${deltaMinutes} minute${deltaMinutes === 1 ? "" : "s"} ago`;
  }

  const deltaHours = Math.round(deltaMinutes / 60);

  if (deltaHours < 24) {
    return `Updated ${deltaHours} hour${deltaHours === 1 ? "" : "s"} ago`;
  }

  const deltaDays = Math.round(deltaHours / 24);

  if (deltaDays === 1) {
    return "Updated yesterday";
  }

  return `Updated ${deltaDays} days ago`;
}

export function DashboardRecentJobsPanel() {
  const [jobs, setJobs] = useState<DashboardRecentJobView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadJobs() {
      setIsLoading(true);
      setError(null);

      try {
        const session = await getBrowserSession();

        if (!session?.access_token) {
          throw new Error("Sign in to load recent jobs.");
        }

        const response = await fetch("/api/dashboard/jobs", {
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });
        const payload = (await response.json()) as DashboardJobsResponse;

        if (!response.ok) {
          throw new Error(
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Failed to load recent jobs.",
          );
        }

        if (!cancelled) {
          setJobs(hasJobsResponse(payload) ? payload.jobs : []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setJobs([]);
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Failed to load recent jobs.",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadJobs();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="rounded-4xl border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
            Recent jobs
          </p>
          <h2 className="mt-4 text-2xl font-semibold tracking-tight text-stone-950">
            Latest processing activity
          </h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-600">
            Recent jobs now come from the live jobs and job_targets tables, so the
            dashboard reflects actual pipeline activity instead of placeholder rows.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="mt-8 rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
          Loading recent jobs...
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="mt-8 rounded-3xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!isLoading && !error && jobs.length > 0 ? (
        <div className="mt-8 grid gap-4">
          {jobs.map((job) => (
            <article
              key={job.id}
              className="rounded-3xl border border-stone-200 bg-stone-50/80 p-5"
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <h3 className="text-lg font-semibold text-stone-950">
                      {job.sourceName}
                    </h3>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(job.status)}`}
                    >
                      {job.status}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-3 text-sm text-stone-600">
                    <span className="rounded-full bg-white px-3 py-1">
                      {job.outputMode}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1">
                      {job.targetCount} target{job.targetCount === 1 ? "" : "s"}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1">
                      {formatRelativeDate(job.updatedAt)}
                    </span>
                  </div>
                </div>

                <Link
                  href={`/dashboard/jobs/${job.id}`}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
                >
                  Open job
                </Link>
              </div>
            </article>
          ))}
        </div>
      ) : null}

      {!isLoading && !error && jobs.length === 0 ? (
        <div className="mt-8 rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
          No jobs have been created yet. Start with the upload card above and your
          first translation run will appear here.
        </div>
      ) : null}
    </section>
  );
}
