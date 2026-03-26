import { NextResponse } from "next/server";

import {
  isJobReadRouteError,
  listRecentJobsForProfile,
} from "@/lib/jobs/readJobViews";
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
    const jobs = await listRecentJobsForProfile(user.id);

    return NextResponse.json({ jobs }, { status: 200 });
  } catch (error) {
    if (isJobReadRouteError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("dashboard recent jobs route failed", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
