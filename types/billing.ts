export const PLAN_NAMES = ["Starter", "Creator", "Pro"] as const;

export type PlanName = (typeof PLAN_NAMES)[number];

export interface PlanRow {
  id: string;
  name: string;
  monthly_credits: number;
  stripe_price_id: string | null;
  created_at: string;
  updated_at: string;
}

export const BILLING_EVENT_STATUSES = [
  "received",
  "processed",
  "failed",
] as const;

export type BillingEventStatus = (typeof BILLING_EVENT_STATUSES)[number];

export interface BillingEventRow {
  id: string;
  profile_id: string | null;
  stripe_event_id: string;
  stripe_customer_id: string | null;
  event_type: string;
  status: BillingEventStatus;
  payload: Record<string, unknown>;
  error_message: string | null;
  processed_at: string | null;
  created_at: string;
  updated_at: string;
}

export const BILLING_TRIAL_STATUSES = [
  "not_applicable",
  "active",
  "ended",
] as const;

export type BillingTrialStatus = (typeof BILLING_TRIAL_STATUSES)[number];

export const BILLING_RENEWAL_STATES = [
  "inactive",
  "trialing",
  "active",
  "canceling",
  "payment_due",
  "paused",
  "canceled",
] as const;

export type BillingRenewalState = (typeof BILLING_RENEWAL_STATES)[number];

export interface BillingStatusResponse {
  profileId: string;
  stripeCustomerId: string | null;
  currentPlanName: PlanName | null;
  creditsRemaining: number;
  trialStatus: BillingTrialStatus;
  renewalState: BillingRenewalState;
  subscriptionStatus: string | null;
  cancelAtPeriodEnd: boolean;
  creditResetAt: string | null;
  trialEndsAt: string | null;
}
