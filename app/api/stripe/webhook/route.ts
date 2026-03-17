import { NextResponse } from "next/server";

import {
  handleStripeWebhook,
  isStripeWebhookRouteError,
} from "@/lib/billing/handleStripeWebhook";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");

  try {
    const response = await handleStripeWebhook(rawBody, signature);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (isStripeWebhookRouteError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("stripe webhook route failed", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
