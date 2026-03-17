import Stripe from "stripe";

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export function createStripeServerClient(): Stripe {
  return new Stripe(requireEnv("STRIPE_SECRET_KEY"));
}
