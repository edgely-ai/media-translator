import { NextResponse } from "next/server";

import {
  createOwnedRetryAttempt,
  isRetryJobRouteError,
} from "@/lib/jobs/retryJob";
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

  try {
    const response = await createOwnedRetryAttempt(user.id, jobId);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (isRetryJobRouteError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("job retry route failed", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
