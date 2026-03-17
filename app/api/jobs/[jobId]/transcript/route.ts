import { NextResponse } from "next/server";

import {
  getJobTranscript,
  isJobTranscriptRouteError,
  updateJobTranscript,
} from "@/lib/transcript/jobTranscript";
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
    const transcript = await getJobTranscript(user.id, jobId);

    return NextResponse.json(transcript, { status: 200 });
  } catch (error) {
    if (isJobTranscriptRouteError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("job transcript route failed", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const user = await getAuthenticatedUserFromRequest(request);

  if (!user) {
    return NextResponse.json(
      { error: "Authentication is required." },
      { status: 401 },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Request body must be valid JSON." },
      { status: 400 },
    );
  }

  const { jobId } = await context.params;

  try {
    const transcript = await updateJobTranscript(user.id, jobId, body);

    return NextResponse.json(transcript, { status: 200 });
  } catch (error) {
    if (isJobTranscriptRouteError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("job transcript save route failed", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
