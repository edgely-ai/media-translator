import Link from "next/link";
import { BillingStatusPanel } from "@/components/billing-status-panel";

type DashboardRecentJob = {
  id: string;
  title: string;
  status: "completed" | "partial_success" | "lip_sync_pending" | "failed";
  outputMode: "subtitles" | "dubbed_audio" | "lip_sync";
  targetCount: number;
  updatedLabel: string;
};

const RECENT_JOBS: DashboardRecentJob[] = [
  {
    id: "demo-job-001",
    title: "Customer interview localization",
    status: "completed",
    outputMode: "dubbed_audio",
    targetCount: 3,
    updatedLabel: "Updated 12 minutes ago",
  },
  {
    id: "demo-job-002",
    title: "Founder announcement clip",
    status: "lip_sync_pending",
    outputMode: "lip_sync",
    targetCount: 2,
    updatedLabel: "Updated 34 minutes ago",
  },
  {
    id: "demo-job-003",
    title: "Support webinar recap",
    status: "partial_success",
    outputMode: "subtitles",
    targetCount: 4,
    updatedLabel: "Updated yesterday",
  },
];

function getStatusTone(status: DashboardRecentJob["status"]): string {
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

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f1e8_0%,#f7fafc_48%,#eef7f0_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-4xl border border-stone-200/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(66,50,20,0.08)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
            Dashboard
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950">
            Keep uploads moving while billing stays visible.
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-600">
            This dashboard now shows real billing state instead of mock plan data, so
            the user can see credits, trial timing, and renewal state before creating
            new work.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <article className="rounded-4xl border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
              Upload
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-stone-950">
              Start a new translation job
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
              Upload source media, choose an output mode, and send a new job into
              the processing pipeline. This card keeps the dashboard aligned with
              the real upload flow already wired on the app home.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                href="/"
                className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
              >
                Open upload flow
              </Link>
              <Link
                href="/dashboard/billing"
                className="rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
              >
                Review billing
              </Link>
            </div>
          </article>

          <article className="rounded-4xl border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
              Credits summary
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-stone-950">
              Keep one eye on available capacity
            </h2>
            <p className="mt-4 text-sm leading-7 text-stone-600">
              Live billing remains the source of truth, but this shell gives the
              dashboard its own credits-summary card so the page matches the
              original authenticated-app layout described in the backlog.
            </p>
            <div className="mt-6 rounded-3xl bg-stone-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Current status
              </p>
              <p className="mt-3 text-lg font-semibold text-stone-950">
                Live credits, plan, trial, and renewal timing are shown below.
              </p>
              <p className="mt-2 text-sm leading-7 text-stone-600">
                This card intentionally stays lightweight and points to the live
                billing summary instead of duplicating a second fetch layer.
              </p>
            </div>
          </article>
        </section>

        <BillingStatusPanel variant="compact" />

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
                This shell uses scoped mock rows until a real recent-jobs query is
                wired. The structure is already ready to swap to database-backed
                results later without changing the layout.
              </p>
            </div>

            <Link
              href="/dashboard/jobs/demo-job-001"
              className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
            >
              Open demo job
            </Link>
          </div>

          {RECENT_JOBS.length > 0 ? (
            <div className="mt-8 grid gap-4">
              {RECENT_JOBS.map((job) => (
                <article
                  key={job.id}
                  className="rounded-3xl border border-stone-200 bg-stone-50/80 p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-stone-950">
                          {job.title}
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
                          {job.updatedLabel}
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
          ) : (
            <div className="mt-8 rounded-3xl border border-dashed border-stone-300 bg-stone-50 p-6 text-sm text-stone-600">
              No jobs have been created yet. Start with the upload card above and
              your first translation run will appear here.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
