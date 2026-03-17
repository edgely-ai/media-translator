import Link from "next/link";

import { BillingStatusPanel } from "@/components/billing-status-panel";

export default function BillingPage() {
  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f1e8_0%,#f7fafc_48%,#eef7f0_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-[2rem] border border-stone-200/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(66,50,20,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
                Billing
              </p>
              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950">
                Subscription, trial, and credit timing in one place.
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-600">
                This page now reflects real billing state from Stripe plus the
                database ledger instead of placeholder subscription content.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
            >
              Back to dashboard
            </Link>
          </div>
        </section>

        <BillingStatusPanel variant="full" />
      </div>
    </main>
  );
}
