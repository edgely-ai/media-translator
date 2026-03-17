import type { User } from "@supabase/supabase-js";

import { createStripeServerClient } from "@/lib/stripe/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { PLAN_NAMES, type PlanName } from "@/types/billing";

const DEFAULT_SUCCESS_PATH = "/dashboard/billing?checkout=success";
const DEFAULT_CANCEL_PATH = "/dashboard/billing?checkout=cancelled";
const CHECKOUT_TRIAL_DAYS = 7;

type RouteErrorStatus = 401 | 404 | 409 | 422 | 500;

type ProfileCheckoutRow = {
  id: string;
  email: string;
  full_name: string | null;
  stripe_customer_id: string | null;
};

type PlanCheckoutRow = {
  id: string;
  name: PlanName;
  stripe_price_id: string | null;
};

export interface CreateCheckoutSessionRequest {
  planName: PlanName;
  successPath?: string;
  cancelPath?: string;
}

export interface CreateCheckoutSessionResponse {
  checkoutSessionId: string;
  checkoutUrl: string;
  customerId: string;
  planName: PlanName;
}

class CreateCheckoutSessionRouteError extends Error {
  constructor(
    public readonly status: RouteErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = "CreateCheckoutSessionRouteError";
  }
}

function isCreateCheckoutSessionRequest(
  value: unknown,
): value is CreateCheckoutSessionRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  const hasOptionalSuccessPath =
    typeof candidate.successPath === "undefined" ||
    typeof candidate.successPath === "string";
  const hasOptionalCancelPath =
    typeof candidate.cancelPath === "undefined" ||
    typeof candidate.cancelPath === "string";

  return (
    typeof candidate.planName === "string" &&
    hasOptionalSuccessPath &&
    hasOptionalCancelPath
  );
}

function parseCreateCheckoutSessionBody(
  body: unknown,
): CreateCheckoutSessionRequest {
  if (!isCreateCheckoutSessionRequest(body)) {
    throw new CreateCheckoutSessionRouteError(
      422,
      "Request body must include planName and optional successPath/cancelPath strings.",
    );
  }

  const planName = body.planName.trim() as PlanName;

  if (!PLAN_NAMES.includes(planName)) {
    throw new CreateCheckoutSessionRouteError(422, "planName is invalid.");
  }

  return {
    planName,
    successPath: body.successPath?.trim(),
    cancelPath: body.cancelPath?.trim(),
  };
}

function buildReturnUrl(origin: string, path?: string, fallback?: string): string {
  const targetPath = path && path.startsWith("/") ? path : fallback ?? "/";

  return new URL(targetPath, origin).toString();
}

async function loadProfile(profileId: string): Promise<ProfileCheckoutRow> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, full_name, stripe_customer_id")
    .eq("id", profileId)
    .maybeSingle<ProfileCheckoutRow>();

  if (error) {
    throw new CreateCheckoutSessionRouteError(500, "Failed to load profile.");
  }

  if (!data) {
    throw new CreateCheckoutSessionRouteError(
      409,
      "Authenticated user profile is not ready for billing.",
    );
  }

  return data;
}

async function loadPlan(planName: PlanName): Promise<PlanCheckoutRow> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("plans")
    .select("id, name, stripe_price_id")
    .eq("name", planName)
    .maybeSingle<PlanCheckoutRow>();

  if (error) {
    throw new CreateCheckoutSessionRouteError(500, "Failed to load plan.");
  }

  if (!data) {
    throw new CreateCheckoutSessionRouteError(404, `Plan ${planName} was not found.`);
  }

  if (!data.stripe_price_id) {
    throw new CreateCheckoutSessionRouteError(
      409,
      `Plan ${planName} is not configured with a Stripe price.`,
    );
  }

  return data;
}

async function ensureStripeCustomer(profile: ProfileCheckoutRow): Promise<string> {
  if (profile.stripe_customer_id) {
    return profile.stripe_customer_id;
  }

  const stripe = createStripeServerClient();
  const customer = await stripe.customers.create({
    email: profile.email,
    name: profile.full_name ?? undefined,
    metadata: {
      profile_id: profile.id,
    },
  });

  const supabase = createSupabaseAdminClient();
  const { error } = await supabase
    .from("profiles")
    .update({
      stripe_customer_id: customer.id,
      updated_at: new Date().toISOString(),
    })
    .eq("id", profile.id);

  if (error) {
    throw new CreateCheckoutSessionRouteError(
      500,
      "Failed to store Stripe customer on profile.",
    );
  }

  return customer.id;
}

export async function createCheckoutSessionForPlan(
  body: unknown,
  user: User,
  origin: string,
): Promise<CreateCheckoutSessionResponse> {
  const request = parseCreateCheckoutSessionBody(body);
  const [profile, plan] = await Promise.all([
    loadProfile(user.id),
    loadPlan(request.planName),
  ]);
  const customerId = await ensureStripeCustomer(profile);
  const stripe = createStripeServerClient();

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [
      {
        price: plan.stripe_price_id!,
        quantity: 1,
      },
    ],
    payment_method_collection: "always",
    success_url: buildReturnUrl(origin, request.successPath, DEFAULT_SUCCESS_PATH),
    cancel_url: buildReturnUrl(origin, request.cancelPath, DEFAULT_CANCEL_PATH),
    subscription_data: {
      trial_period_days: CHECKOUT_TRIAL_DAYS,
      metadata: {
        profile_id: profile.id,
        plan_id: plan.id,
        plan_name: plan.name,
      },
    },
    metadata: {
      profile_id: profile.id,
      plan_id: plan.id,
      plan_name: plan.name,
    },
  });

  if (!session.url) {
    throw new CreateCheckoutSessionRouteError(
      500,
      "Stripe Checkout Session did not return a hosted URL.",
    );
  }

  return {
    checkoutSessionId: session.id,
    checkoutUrl: session.url,
    customerId,
    planName: plan.name,
  };
}

export function isCreateCheckoutSessionRouteError(
  error: unknown,
): error is CreateCheckoutSessionRouteError {
  return error instanceof CreateCheckoutSessionRouteError;
}
