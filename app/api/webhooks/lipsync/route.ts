import { NextResponse } from "next/server";

import {
  handleLipSyncWebhook,
  isLipSyncWebhookError,
} from "@/lib/jobs/handleLipSyncWebhook";

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

  try {
    const result = await handleLipSyncWebhook(request, body);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (isLipSyncWebhookError(error)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error("lipsync webhook route failed", error);

    return NextResponse.json(
      { error: "Unexpected server error." },
      { status: 500 },
    );
  }
}
