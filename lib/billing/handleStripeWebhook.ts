import Stripe from "stripe";

import { createStripeServerClient } from "@/lib/stripe/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

type RouteErrorStatus = 400 | 401 | 404 | 409 | 422 | 500;

type BillingEventRow = {
  id: string;
  profile_id: string | null;
  stripe_event_id: string;
  stripe_customer_id: string | null;
  event_type: string;
  status: "received" | "processed" | "failed";
  payload: Record<string, unknown>;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileBillingRow = {
  id: string;
  email: string;
  stripe_customer_id: string | null;
};

type PlanBillingRow = {
  id: string;
  name: "Starter" | "Creator" | "Pro";
  monthly_credits: number;
  stripe_price_id: string | null;
};

type ExistingGrantRow = {
  id: string;
  amount: number;
};

export interface HandleStripeWebhookResult {
  stripeEventId: string;
  eventType: string;
  billingEventStatus: BillingEventRow["status"];
  creditsGranted: number;
  alreadyProcessed: boolean;
}

class StripeWebhookRouteError extends Error {
  constructor(
    public readonly status: RouteErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = "StripeWebhookRouteError";
  }
}

function requireWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret) {
    throw new StripeWebhookRouteError(
      500,
      "Stripe webhook secret is not configured.",
    );
  }

  return secret;
}

function extractCustomerId(
  event: Stripe.Event,
): string | null {
  const object = event.data.object as unknown as Record<string, unknown>;
  const customer = object.customer;

  return typeof customer === "string" && customer.trim() ? customer : null;
}

function extractProfileIdFromMetadata(event: Stripe.Event): string | null {
  const object = event.data.object as unknown as Record<string, unknown>;
  const metadata = object.metadata;

  if (!metadata || typeof metadata !== "object") {
    return null;
  }

  const profileId = (metadata as Record<string, unknown>).profile_id;

  return typeof profileId === "string" && profileId.trim() ? profileId : null;
}

async function findProfileForEvent(
  stripeCustomerId: string | null,
  profileId: string | null,
): Promise<ProfileBillingRow | null> {
  const supabase = createSupabaseAdminClient();

  if (profileId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, stripe_customer_id")
      .eq("id", profileId)
      .maybeSingle<ProfileBillingRow>();

    if (error) {
      throw new StripeWebhookRouteError(500, "Failed to load billing profile.");
    }

    return data;
  }

  if (stripeCustomerId) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, email, stripe_customer_id")
      .eq("stripe_customer_id", stripeCustomerId)
      .maybeSingle<ProfileBillingRow>();

    if (error) {
      throw new StripeWebhookRouteError(500, "Failed to load billing profile.");
    }

    return data;
  }

  return null;
}

async function ensureProfileStripeCustomerId(
  profile: ProfileBillingRow | null,
  stripeCustomerId: string | null,
): Promise<void> {
  if (!profile || !stripeCustomerId || profile.stripe_customer_id === stripeCustomerId) {
    return;
  }

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      stripe_customer_id: stripeCustomerId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) {
    throw new StripeWebhookRouteError(
      500,
      "Failed to sync Stripe customer onto the profile.",
    );
  }
}

async function findPlanByStripePriceId(
  stripePriceId: string,
): Promise<PlanBillingRow | null> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, monthly_credits, stripe_price_id")
    .eq("stripe_price_id", stripePriceId)
    .maybeSingle<PlanBillingRow>();

  if (error) {
    throw new StripeWebhookRouteError(500, "Failed to load Stripe-backed plan.");
  }

  return data;
}

async function createReceivedBillingEvent(
  event: Stripe.Event,
  profileId: string | null,
  stripeCustomerId: string | null,
): Promise<BillingEventRow> {
  const supabase = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await supabase
    .from("billing_events")
    .select(
      "id, profile_id, stripe_event_id, stripe_customer_id, event_type, status, payload, error_message, processed_at, created_at, updated_at",
    )
    .eq("stripe_event_id", event.id)
    .maybeSingle<BillingEventRow>();

  if (existingError) {
    throw new StripeWebhookRouteError(500, "Failed to check existing billing event.");
  }

  if (existing) {
    return existing;
  }

  const { data, error } = await supabase
    .from("billing_events")
    .insert({
      profile_id: profileId,
      stripe_event_id: event.id,
      stripe_customer_id: stripeCustomerId,
      event_type: event.type,
      status: "received",
      payload: event as unknown as Record<string, unknown>,
    })
    .select(
      "id, profile_id, stripe_event_id, stripe_customer_id, event_type, status, payload, error_message, processed_at, created_at, updated_at",
    )
    .single<BillingEventRow>();

  if (error || !data) {
    throw new StripeWebhookRouteError(500, "Failed to store billing event.");
  }

  return data;
}

async function updateBillingEventStatus(
  billingEventId: string,
  status: BillingEventRow["status"],
  errorMessage: string | null,
): Promise<void> {
  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("billing_events")
    .update({
      status,
      error_message: errorMessage,
      processed_at: status === "processed" ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", billingEventId);

  if (error) {
    throw new StripeWebhookRouteError(500, "Failed to update billing event status.");
  }
}

function getPrimaryInvoicePriceId(invoice: Stripe.Invoice): string | null {
  const firstLine = invoice.lines.data[0];
  const priceId = firstLine?.pricing?.price_details?.price ?? null;

  return typeof priceId === "string" && priceId.trim() ? priceId : null;
}

async function grantRenewalCredits(
  profile: ProfileBillingRow,
  invoice: Stripe.Invoice,
): Promise<number> {
  const billingReason = invoice.billing_reason;

  if (billingReason !== "subscription_create" && billingReason !== "subscription_cycle") {
    return 0;
  }

  const priceId = getPrimaryInvoicePriceId(invoice);

  if (!priceId) {
    throw new StripeWebhookRouteError(
      422,
      "Paid subscription invoice did not include a Stripe price ID.",
    );
  }

  const plan = await findPlanByStripePriceId(priceId);

  if (!plan) {
    throw new StripeWebhookRouteError(
      404,
      `No plan matches Stripe price ${priceId}.`,
    );
  }

  const description = `Monthly credit refill for ${plan.name} via invoice ${invoice.id}`;
  const supabase = createSupabaseAdminClient();
  const { data: existingGrant, error: existingGrantError } = await supabase
    .from("credit_ledger")
    .select("id, amount")
    .eq("profile_id", profile.id)
    .eq("entry_type", "grant")
    .eq("description", description)
    .maybeSingle<ExistingGrantRow>();

  if (existingGrantError) {
    throw new StripeWebhookRouteError(
      500,
      "Failed to verify existing renewal credit grant.",
    );
  }

  if (existingGrant) {
    return 0;
  }

  const { error } = await supabase.from("credit_ledger").insert({
    profile_id: profile.id,
    job_id: null,
    entry_type: "grant",
    amount: plan.monthly_credits,
    description,
  });

  if (error) {
    throw new StripeWebhookRouteError(500, "Failed to grant renewal credits.");
  }

  return plan.monthly_credits;
}

async function processStripeEvent(
  event: Stripe.Event,
  profile: ProfileBillingRow | null,
  stripeCustomerId: string | null,
): Promise<number> {
  await ensureProfileStripeCustomerId(profile, stripeCustomerId);

  switch (event.type) {
    case "checkout.session.completed":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return 0;
    case "invoice.paid": {
      if (!profile) {
        throw new StripeWebhookRouteError(
          404,
          "No billing profile matches the paid invoice customer.",
        );
      }

      return grantRenewalCredits(profile, event.data.object as Stripe.Invoice);
    }
    default:
      return 0;
  }
}

export async function handleStripeWebhook(
  rawBody: string,
  signature: string | null,
): Promise<HandleStripeWebhookResult> {
  if (!signature) {
    throw new StripeWebhookRouteError(401, "Stripe signature is missing.");
  }

  let event: Stripe.Event;

  try {
    event = createStripeServerClient().webhooks.constructEvent(
      rawBody,
      signature,
      requireWebhookSecret(),
    );
  } catch {
    throw new StripeWebhookRouteError(401, "Stripe signature verification failed.");
  }

  const stripeCustomerId = extractCustomerId(event);
  const profileId = extractProfileIdFromMetadata(event);
  const profile = await findProfileForEvent(stripeCustomerId, profileId);
  const billingEvent = await createReceivedBillingEvent(
    event,
    profile?.id ?? null,
    stripeCustomerId,
  );

  if (billingEvent.status === "processed") {
    return {
      stripeEventId: event.id,
      eventType: event.type,
      billingEventStatus: billingEvent.status,
      creditsGranted: 0,
      alreadyProcessed: true,
    };
  }

  try {
    const creditsGranted = await processStripeEvent(event, profile, stripeCustomerId);

    await updateBillingEventStatus(billingEvent.id, "processed", null);

    return {
      stripeEventId: event.id,
      eventType: event.type,
      billingEventStatus: "processed",
      creditsGranted,
      alreadyProcessed: false,
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Stripe webhook processing failed.";

    await updateBillingEventStatus(billingEvent.id, "failed", message);
    throw error;
  }
}

export function isStripeWebhookRouteError(
  error: unknown,
): error is StripeWebhookRouteError {
  return error instanceof StripeWebhookRouteError;
}
