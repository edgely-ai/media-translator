import { NextResponse } from "next/server";

import {
  createJobFromUploadedSource,
  isCreateJobRouteError,
} from "@/lib/jobs/create-job";
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
    const response = await createJobFromUploadedSource(body, user);

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    if (isCreateJobRouteError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("create-job route failed", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
