import { NextResponse } from "next/server";

import {
  getJobDetailForProfile,
  isJobReadRouteError,
} from "@/lib/jobs/readJobViews";
import { getAuthenticatedUserFromRequest } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ jobId: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  const { jobId } = await context.params;

  try {
    const job = await getJobDetailForProfile(user.id, jobId);

    return NextResponse.json(job, { status: 200 });
  } catch (error) {
    if (isJobReadRouteError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("job detail route failed", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
