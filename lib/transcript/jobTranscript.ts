import { createSupabaseAdminClient } from "@/lib/supabase/server";
import type {
  JobTranscriptResponse,
  TranscriptEditorSegment,
  UpdateTranscriptSegmentInput,
} from "@/types/transcript";

type RouteErrorStatus = 401 | 403 | 404 | 422 | 500;

type OwnedJobRow = {
  id: string;
  profile_id: string;
};

type TranscriptSegmentRecord = {
  id: string;
  segment_index: number;
  source_start_ms: number;
  source_end_ms: number;
  source_text: string;
  edited_source_text: string | null;
};

class JobTranscriptRouteError extends Error {
  constructor(
    public readonly status: RouteErrorStatus,
    message: string,
  ) {
    super(message);
    this.name = "JobTranscriptRouteError";
  }
}

async function requireOwnedJob(
  profileId: string,
  jobId: string,
): Promise<OwnedJobRow> {
  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("jobs")
    .select("id, profile_id")
    .eq("id", jobId)
    .maybeSingle<OwnedJobRow>();

  if (error) {
    throw new JobTranscriptRouteError(500, "Failed to load job transcript.");
  }

  if (!data) {
    throw new JobTranscriptRouteError(404, "Job transcript was not found.");
  }

  if (data.profile_id !== profileId) {
    throw new JobTranscriptRouteError(403, "You do not own this job transcript.");
  }

  return data;
}

function mapEditorSegment(record: TranscriptSegmentRecord): TranscriptEditorSegment {
  return {
    id: record.id,
    segmentIndex: record.segment_index,
    startMs: record.source_start_ms,
    endMs: record.source_end_ms,
    sourceText: record.source_text,
    editedSourceText: record.edited_source_text,
  };
}

function parseSegmentUpdates(body: unknown): UpdateTranscriptSegmentInput[] {
  if (!body || typeof body !== "object") {
    throw new JobTranscriptRouteError(
      422,
      "Request body must include a segments array.",
    );
  }

  const candidate = body as Record<string, unknown>;

  if (!Array.isArray(candidate.segments)) {
    throw new JobTranscriptRouteError(
      422,
      "Request body must include a segments array.",
    );
  }

  return candidate.segments.map((segment, index) => {
    if (!segment || typeof segment !== "object") {
      throw new JobTranscriptRouteError(
        422,
        `segments[${index}] must be an object.`,
      );
    }

    const record = segment as Record<string, unknown>;

    if (typeof record.id !== "string" || !record.id.trim()) {
      throw new JobTranscriptRouteError(
        422,
        `segments[${index}].id is required.`,
      );
    }

    if (
      typeof record.editedSourceText !== "string" &&
      record.editedSourceText !== null
    ) {
      throw new JobTranscriptRouteError(
        422,
        `segments[${index}].editedSourceText must be a string or null.`,
      );
    }

    const normalizedText =
      typeof record.editedSourceText === "string"
        ? record.editedSourceText.trim()
        : null;

    return {
      id: record.id.trim(),
      editedSourceText: normalizedText ? normalizedText : null,
    };
  });
}

export async function getJobTranscript(
  profileId: string,
  jobId: string,
): Promise<JobTranscriptResponse> {
  await requireOwnedJob(profileId, jobId);

  const supabase = createSupabaseAdminClient();
  const { data, error } = await supabase
    .from("transcript_segments")
    .select(
      "id, segment_index, source_start_ms, source_end_ms, source_text, edited_source_text",
    )
    .eq("job_id", jobId)
    .order("segment_index", { ascending: true })
    .returns<TranscriptSegmentRecord[]>();

  if (error) {
    throw new JobTranscriptRouteError(500, "Failed to load transcript segments.");
  }

  return {
    jobId,
    segments: (data ?? []).map(mapEditorSegment),
  };
}

export async function updateJobTranscript(
  profileId: string,
  jobId: string,
  body: unknown,
): Promise<JobTranscriptResponse> {
  await requireOwnedJob(profileId, jobId);
  const updates = parseSegmentUpdates(body);

  const supabase = createSupabaseAdminClient();
  const { data: existingSegments, error: segmentsError } = await supabase
    .from("transcript_segments")
    .select("id")
    .eq("job_id", jobId);

  if (segmentsError) {
    throw new JobTranscriptRouteError(500, "Failed to validate transcript segments.");
  }

  const validSegmentIds = new Set((existingSegments ?? []).map((segment) => segment.id));

  for (const update of updates) {
    if (!validSegmentIds.has(update.id)) {
      throw new JobTranscriptRouteError(
        422,
        `Transcript segment ${update.id} does not belong to this job.`,
      );
    }
  }

  for (const update of updates) {
    const { error } = await supabase
      .from("transcript_segments")
      .update({
        edited_source_text: update.editedSourceText,
        updated_at: new Date().toISOString(),
      })
      .eq("id", update.id)
      .eq("job_id", jobId);

    if (error) {
      throw new JobTranscriptRouteError(500, "Failed to save transcript edits.");
    }
  }

  return getJobTranscript(profileId, jobId);
}

export function isJobTranscriptRouteError(
  error: unknown,
): error is JobTranscriptRouteError {
  return error instanceof JobTranscriptRouteError;
}
