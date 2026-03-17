import Link from "next/link";

import { BillingStatusPanel } from "@/components/billing-status-panel";

export default function DashboardPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f1e8_0%,#f7fafc_48%,#eef7f0_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-[2rem] border border-stone-200/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(66,50,20,0.08)] backdrop-blur">
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
          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/"
              className="rounded-full bg-stone-950 px-5 py-3 text-sm font-semibold text-white transition hover:bg-stone-800"
            >
              Create another job
            </Link>
            <Link
              href="/dashboard/billing"
              className="rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
            >
              Open billing page
            </Link>
          </div>
        </section>

        <BillingStatusPanel variant="compact" />
      </div>
    </main>
  );
}
