"use client";

import { useEffect, useState } from "react";

import { getBrowserSession } from "@/lib/supabase/browser";
import type { JobTranscriptResponse, TranscriptEditorSegment } from "@/types/transcript";

interface TranscriptEditorPanelProps {
  jobId: string;
}

function formatTimestamp(milliseconds: number): string {
  const totalSeconds = Math.floor(milliseconds / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const ms = milliseconds % 1000;

  return `${minutes}:${String(seconds).padStart(2, "0")}.${String(ms).padStart(3, "0")}`;
}

function getEffectiveText(segment: TranscriptEditorSegment): string {
  return segment.editedSourceText ?? segment.sourceText;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while loading the transcript.";
}

export function TranscriptEditorPanel({ jobId }: TranscriptEditorPanelProps) {
  const [segments, setSegments] = useState<TranscriptEditorSegment[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadTranscript() {
      setIsLoading(true);
      setError(null);

      try {
        const session = await getBrowserSession();

        if (!session?.access_token) {
          throw new Error("Sign in to load transcript segments.");
        }

        const response = await fetch(`/api/jobs/${jobId}/transcript`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${session.access_token}`,
          },
          cache: "no-store",
        });

        const payload = (await response.json()) as
          | JobTranscriptResponse
          | { error?: string };

        if (!response.ok) {
          const routeError =
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Failed to load transcript segments.";
          throw new Error(routeError);
        }

        if (!cancelled) {
          const transcript = payload as JobTranscriptResponse;
          setSegments(transcript.segments);
          setDrafts(
            Object.fromEntries(
              transcript.segments.map((segment) => [
                segment.id,
                getEffectiveText(segment),
              ]),
            ),
          );
        }
      } catch (loadError) {
        if (!cancelled) {
          setSegments([]);
          setDrafts({});
          setError(getErrorMessage(loadError));
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadTranscript();

    return () => {
      cancelled = true;
    };
  }, [jobId]);

  async function handleSave() {
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const session = await getBrowserSession();

      if (!session?.access_token) {
        throw new Error("Sign in to save transcript edits.");
      }

      const response = await fetch(`/api/jobs/${jobId}/transcript`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          segments: segments.map((segment) => ({
            id: segment.id,
            editedSourceText:
              drafts[segment.id].trim() === segment.sourceText.trim()
                ? null
                : drafts[segment.id],
          })),
        }),
      });

      const payload = (await response.json()) as
        | JobTranscriptResponse
        | { error?: string };

      if (!response.ok) {
        const routeError =
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to save transcript edits.";
        throw new Error(routeError);
      }

      const updatedTranscript = payload as JobTranscriptResponse;
      setSegments(updatedTranscript.segments);
      setDrafts(
        Object.fromEntries(
          updatedTranscript.segments.map((segment) => [
            segment.id,
            getEffectiveText(segment),
          ]),
        ),
      );
      setSuccessMessage("Transcript edits saved.");
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <section className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-stone-950">Transcript editor</h2>
          <p className="mt-2 max-w-2xl text-sm leading-7 text-stone-600">
            Review transcript segments before translation. Saved edits are written
            to `edited_source_text` and become the preferred source for downstream
            translation work.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void handleSave()}
          disabled={isLoading || isSaving || segments.length === 0}
          className="inline-flex h-11 items-center justify-center rounded-full bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
        >
          {isSaving ? "Saving..." : "Save transcript edits"}
        </button>
      </div>

      <div className="mt-6">
        {isLoading ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
            Loading transcript segments...
          </div>
        ) : null}

        {!isLoading && error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">
            <p className="font-medium">Transcript editor error</p>
            <p className="mt-2">{error}</p>
          </div>
        ) : null}

        {!isLoading && successMessage ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-800">
            {successMessage}
          </div>
        ) : null}

        {!isLoading && !error && segments.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-5 text-sm text-stone-600">
            No transcript segments are available for this job yet.
          </div>
        ) : null}

        {!isLoading && !error && segments.length > 0 ? (
          <div className="mt-6 grid gap-4">
            {segments.map((segment) => (
              <article
                key={segment.id}
                className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 p-5"
              >
                <div className="flex flex-wrap items-center gap-3 text-xs font-medium uppercase tracking-[0.2em] text-stone-500">
                  <span>Segment {segment.segmentIndex + 1}</span>
                  <span>{formatTimestamp(segment.startMs)}</span>
                  <span>to</span>
                  <span>{formatTimestamp(segment.endMs)}</span>
                </div>

                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl bg-white p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                      Original
                    </p>
                    <p className="mt-3 text-sm leading-7 text-stone-700">
                      {segment.sourceText}
                    </p>
                  </div>

                  <label className="grid gap-3 rounded-2xl bg-white p-4">
                    <span className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500">
                      Editable text
                    </span>
                    <textarea
                      value={drafts[segment.id] ?? ""}
                      onChange={(event) =>
                        setDrafts((current) => ({
                          ...current,
                          [segment.id]: event.target.value,
                        }))
                      }
                      rows={4}
                      className="min-h-28 rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm leading-7 text-stone-800"
                    />
                    <span className="text-xs text-stone-500">
                      Leaving the edited text identical to the original clears
                      `edited_source_text` on save.
                    </span>
                  </label>
                </div>
              </article>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
