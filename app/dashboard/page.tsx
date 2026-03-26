import Link from "next/link";
import { BillingStatusPanel } from "@/components/billing-status-panel";
import { DashboardRecentJobsPanel } from "@/components/dashboard-recent-jobs-panel";
import { UploadJobCard } from "@/components/upload-job-card";

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
              <div className="mt-4">
                <Link
                  href="/dashboard/billing"
                  className="rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
                >
                  Review billing
                </Link>
              </div>
            </div>
          </article>
        </section>

        <UploadJobCard
          title="Start a new translation job"
          description="Choose media, one output mode, and target languages directly inside the dashboard. The flow still uses the existing upload-init and job-creation routes, then refreshes the dashboard so the new job appears naturally in recent jobs below."
        />

        <BillingStatusPanel variant="compact" />
        <DashboardRecentJobsPanel />
      </div>
    </main>
  );
}
