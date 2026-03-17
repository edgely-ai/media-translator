import { NextResponse } from "next/server";

import {
  createCheckoutSessionForPlan,
  isCreateCheckoutSessionRouteError,
} from "@/lib/billing/createCheckoutSession";
import { getAuthenticatedUserFromRequest } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const user = await getAuthenticatedUserFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  try {
    const response = await createCheckoutSessionForPlan(
      body,
      user,
      new URL(request.url).origin,
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (isCreateCheckoutSessionRouteError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("create-checkout-session route failed", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
