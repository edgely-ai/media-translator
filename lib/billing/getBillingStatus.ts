import type Stripe from "stripe";

import { createStripeServerClient } from "@/lib/stripe/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  BillingRenewalState,
  BillingStatusResponse,
  BillingTrialStatus,
  PlanName,
} from "@/types/billing";

type RouteErrorStatus = 401 | 404 | 409 | 500;

type ProfileBillingStatusRow = {
  id: string;
  stripe_customer_id: string | null;
};

type PlanStripeLookupRow = {
  name: PlanName;
  stripe_price_id: string | null;
};

type CreditLedgerBalanceRow = {
  entry_type: string;
  amount: number;
};

class BillingStatusRouteError extends Error {
  constructor(
    public readonly status: RouteErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = "BillingStatusRouteError";
  }
}

function getSubscriptionPriority(status: Stripe.Subscription.Status): number {
  switch (status) {
    case "trialing":
      return 0;
    case "active":
      return 1;
    case "past_due":
      return 2;
    case "unpaid":
      return 3;
    case "paused":
      return 4;
    case "incomplete":
      return 5;
    case "canceled":
      return 6;
    case "incomplete_expired":
      return 7;
    default:
      return 99;
  }
}

function pickCurrentSubscription(
  subscriptions: Stripe.Subscription[],
): Stripe.Subscription | null {
  if (subscriptions.length === 0) {
    return null;
  }

  return [...subscriptions].sort((left, right) => {
    const priorityDiff =
      getSubscriptionPriority(left.status) - getSubscriptionPriority(right.status);

    if (priorityDiff !== 0) {
      return priorityDiff;
    }

    return right.created - left.created;
  })[0] ?? null;
}

function getPriceIdFromSubscription(
  subscription: Stripe.Subscription | null,
): string | null {
  if (!subscription) {
    return null;
  }

  const item = subscription.items.data[0];
  const priceId = item?.price?.id ?? null;

  return typeof priceId === "string" && priceId.trim() ? priceId : null;
}

function deriveRenewalState(
  subscription: Stripe.Subscription | null,
): BillingRenewalState {
  if (!subscription) {
    return "inactive";
  }

  if (subscription.status === "trialing") {
    return "trialing";
  }

  if (subscription.status === "active" && subscription.cancel_at_period_end) {
    return "canceling";
  }

  if (subscription.status === "active") {
    return "active";
  }

  if (subscription.status === "past_due" || subscription.status === "unpaid") {
    return "payment_due";
  }

  if (subscription.status === "paused") {
    return "paused";
  }

  if (subscription.status === "canceled") {
    return "canceled";
  }

  return "inactive";
}

function deriveTrialStatus(
  subscription: Stripe.Subscription | null,
): BillingTrialStatus {
  if (!subscription?.trial_end) {
    return "not_applicable";
  }

  return subscription.status === "trialing" ? "active" : "ended";
}

async function loadProfile(profileId: string): Promise<ProfileBillingStatusRow> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, stripe_customer_id")
    .eq("id", profileId)
    .maybeSingle<ProfileBillingStatusRow>();

  if (error) {
    throw new BillingStatusRouteError(500, "Failed to load billing profile.");
  }

  if (!data) {
    throw new BillingStatusRouteError(
      409,
      "Authenticated profile is not ready for billing.",
    );
  }

  return data;
}

async function loadPlanByStripePriceId(
  stripePriceId: string | null,
): Promise<PlanName | null> {
  if (!stripePriceId) {
    return null;
  }

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("plans")
    .select("name, stripe_price_id")
    .eq("stripe_price_id", stripePriceId)
    .maybeSingle<PlanStripeLookupRow>();

  if (error) {
    throw new BillingStatusRouteError(500, "Failed to load current plan.");
  }

  return data?.name ?? null;
}

async function loadCreditsRemaining(profileId: string): Promise<number> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("credit_ledger")
    .select("entry_type, amount")
    .eq("profile_id", profileId)
    .returns<CreditLedgerBalanceRow[]>();

  if (error) {
    throw new BillingStatusRouteError(500, "Failed to load credit balance.");
  }

  return (data ?? []).reduce((balance, row) => {
    if (
      row.entry_type === "reserve" ||
      row.entry_type === "release" ||
      row.entry_type === "grant" ||
      row.entry_type === "adjustment"
    ) {
      return balance + Number(row.amount ?? 0);
    }

    return balance;
  }, 0);
}

async function loadCurrentSubscription(
  stripeCustomerId: string | null,
): Promise<Stripe.Subscription | null> {
  if (!stripeCustomerId) {
    return null;
  }

  const stripe = createStripeServerClient();
  const subscriptions = await stripe.subscriptions.list({
    customer: stripeCustomerId,
    status: "all",
    limit: 10,
  });

  return pickCurrentSubscription(subscriptions.data);
}

function toIsoOrNull(unixSeconds: number | null | undefined): string | null {
  if (!unixSeconds || unixSeconds <= 0) {
    return null;
  }

  return new Date(unixSeconds * 1000).toISOString();
}

function getCreditResetAt(subscription: Stripe.Subscription | null): string | null {
  if (!subscription) {
    return null;
  }

  const periodEnd = subscription.items.data[0]?.current_period_end;

  return toIsoOrNull(periodEnd);
}

export async function getBillingStatus(profileId: string): Promise<BillingStatusResponse> {
  if (!profileId.trim()) {
    throw new BillingStatusRouteError(401, "Authentication is required.");
  }

  const profile = await loadProfile(profileId);
  const [creditsRemaining, subscription] = await Promise.all([
    loadCreditsRemaining(profile.id),
    loadCurrentSubscription(profile.stripe_customer_id),
  ]);
  const currentPlanName = await loadPlanByStripePriceId(
    getPriceIdFromSubscription(subscription),
  );

  return {
    profileId: profile.id,
    stripeCustomerId: profile.stripe_customer_id,
    currentPlanName,
    creditsRemaining,
    trialStatus: deriveTrialStatus(subscription),
    renewalState: deriveRenewalState(subscription),
    subscriptionStatus: subscription?.status ?? null,
    cancelAtPeriodEnd: Boolean(subscription?.cancel_at_period_end),
    creditResetAt: getCreditResetAt(subscription),
    trialEndsAt: toIsoOrNull(subscription?.trial_end),
  };
}

export function isBillingStatusRouteError(
  error: unknown,
): error is BillingStatusRouteError {
  return error instanceof BillingStatusRouteError;
}
