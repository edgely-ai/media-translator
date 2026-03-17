import { NextResponse } from "next/server";

import {
  getBillingStatus,
  isBillingStatusRouteError,
} from "@/lib/billing/getBillingStatus";
import { getAuthenticatedUserFromRequest } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const user = await getAuthenticatedUserFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  try {
    const billingStatus = await getBillingStatus(user.id);

    return NextResponse.json(billingStatus, { status: 200 });
  } catch (error) {
    if (isBillingStatusRouteError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("billing status route failed", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
