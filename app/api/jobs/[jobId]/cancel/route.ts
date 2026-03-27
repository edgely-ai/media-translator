import { NextResponse } from "next/server";

import {
  isCancelJobRouteError,
  requestOwnedJobCancellation,
} from "@/lib/jobs/cancellation";
import { getAuthenticatedUserFromRequest } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  const { jobId } = await context.params;
  let body: { reason?: string } | null = null;

  try {
    body = (await request.json()) as { reason?: string };
  } catch {
    body = null;
  }

  try {
    const response = await requestOwnedJobCancellation(
      user.id,
      jobId,
      body?.reason ?? null,
    );

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (isCancelJobRouteError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("job cancel route failed", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
