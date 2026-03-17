"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { getBrowserSession } from "@/lib/supabase/browser";
import type { BillingStatusResponse } from "@/types/billing";

type BillingStatusPanelVariant = "compact" | "full";

interface BillingStatusPanelProps {
  variant?: BillingStatusPanelVariant;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while loading billing status.";
}

function formatTimestamp(value: string | null): string {
  if (!value) {
    return "Not scheduled";
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function getTrialLabel(data: BillingStatusResponse): string {
  if (data.trialStatus === "active") {
    return `Active until ${formatTimestamp(data.trialEndsAt)}`;
  }

  if (data.trialStatus === "ended") {
    return "Trial ended";
  }

  return "No active trial";
}

function getRenewalLabel(data: BillingStatusResponse): string {
  switch (data.renewalState) {
    case "trialing":
      return "Trialing";
    case "active":
      return "Renewing normally";
    case "canceling":
      return "Cancels at period end";
    case "payment_due":
      return "Payment action needed";
    case "paused":
      return "Paused";
    case "canceled":
      return "Canceled";
    case "inactive":
    default:
      return "Not subscribed";
  }
}

export function BillingStatusPanel({
  variant = "full",
}: BillingStatusPanelProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<BillingStatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadStatus() {
      setIsLoading(true);
      setError(null);

      try {
        const session = await getBrowserSession();

        if (!session?.access_token) {
          throw new Error("Sign in to load your billing status.");
        }

        const response = await fetch("/api/billing/status", {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        const payload = (await response.json()) as
          | BillingStatusResponse
          | { error?: string };

        if (!response.ok) {
          const routeError =
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Failed to load billing status.";
          throw new Error(routeError);
        }

        if (!cancelled) {
          setStatus(payload as BillingStatusResponse);
        }
      } catch (loadError) {
        if (!cancelled) {
          setStatus(null);
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadStatus();

    return () => {
      cancelled = true;
    };
  }, []);

  const isCompact = variant === "compact";

  return (
    <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
            Billing status
          </p>
          <h2 className="mt-3 text-2xl font-semibold tracking-tight text-stone-950">
            {isCompact ? "Live billing snapshot" : "Current plan and renewal details"}
          </h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-stone-600">
            Real subscription state now comes from Stripe plus the project credit
            ledger, so the dashboard and billing page stay aligned.
          </p>
        </div>

        {isCompact ? (
          <Link
            href="/dashboard/billing"
            className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
          >
            Open billing
          </Link>
        ) : null}
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
            Loading live billing status...
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <p className="font-medium">Could not load billing status</p>
            <p className="mt-2">{error}</p>
          </div>
        ) : null}

        {!isLoading && status ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-stone-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Current plan
              </p>
              <p className="mt-3 text-2xl font-semibold text-stone-950">
                {status.currentPlanName ?? "No subscription"}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                Stripe status: {status.subscriptionStatus ?? "none"}
              </p>
            </div>

            <div className="rounded-2xl bg-stone-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Credits remaining
              </p>
              <p className="mt-3 text-2xl font-semibold text-stone-950">
                {status.creditsRemaining}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                Available from the append-only credit ledger.
              </p>
            </div>

            <div className="rounded-2xl bg-stone-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Trial status
              </p>
              <p className="mt-3 text-lg font-semibold text-stone-950">
                {getTrialLabel(status)}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                Trial timing comes from the current Stripe subscription.
              </p>
            </div>

            <div className="rounded-2xl bg-stone-50 p-5">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                Renewal state
              </p>
              <p className="mt-3 text-lg font-semibold text-stone-950">
                {getRenewalLabel(status)}
              </p>
              <p className="mt-2 text-sm text-stone-600">
                Credit reset: {formatTimestamp(status.creditResetAt)}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {!isLoading && !error && status && !isCompact ? (
        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">
            <p className="font-medium text-stone-800">Renewal notes</p>
            <p className="mt-2 leading-7">
              {status.cancelAtPeriodEnd
                ? "This subscription is set to cancel at the end of the current period."
                : "This subscription is set to continue automatically unless changed in Stripe."}
            </p>
          </div>

          <div className="rounded-2xl bg-stone-50 p-5 text-sm text-stone-600">
            <p className="font-medium text-stone-800">Billing model</p>
            <p className="mt-2 leading-7">
              Credits refill from Stripe webhook events and job usage is tracked in the
              append-only ledger, so the UI reflects the same source of truth as the
              backend pipeline.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
