import { NextResponse } from "next/server";

import {
  buildUploadInitResponse,
  validateUploadInitRequest,
  type UploadInitRequest,
} from "@/lib/storage/upload-init";

function isUploadInitRequest(value: unknown): value is UploadInitRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate = value as Record<string, unknown>;

  return (
    typeof candidate.filename === "string" &&
    typeof candidate.mimeType === "string" &&
    typeof candidate.fileSizeBytes === "number" &&
    (candidate.durationSeconds === undefined ||
      candidate.durationSeconds === null ||
      typeof candidate.durationSeconds === "number")
  );
}

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

  if (!isUploadInitRequest(body)) {
    return NextResponse.json(
      {
        error:
          "Request body must include filename, mimeType, fileSizeBytes, and optional durationSeconds.",
      },
      { status: 400 },
    );
  }

  const validation = validateUploadInitRequest(body);

  if (!validation.ok) {
    return NextResponse.json(
      { error: validation.message ?? "Invalid upload metadata." },
      { status: 400 },
    );
  }

  return NextResponse.json(buildUploadInitResponse(body), { status: 200 });
}
