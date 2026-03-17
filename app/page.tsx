"use client";

import { useState } from "react";

import { getBrowserSession, getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { startUploadFlow } from "@/lib/storage/upload-flow";
import type { CreateJobResponse, OutputMode } from "@/types/jobs";

const OUTPUT_MODES: OutputMode[] = ["subtitles", "dubbed_audio", "lip_sync"];

function parseTargetLanguages(input: string): string[] {
  return input
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  return "Something went wrong while creating the job.";
}

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState("120");
  const [outputMode, setOutputMode] = useState<OutputMode>("subtitles");
  const [targetLanguageInput, setTargetLanguageInput] = useState("fr, es");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CreateJobResponse | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!file) {
      setError("Choose a media file before creating a job.");
      return;
    }

    const parsedDuration = Number(durationSeconds);

    if (!Number.isFinite(parsedDuration) || parsedDuration <= 0) {
      setError("Duration must be a positive number of seconds.");
      return;
    }

    const targetLanguages = parseTargetLanguages(targetLanguageInput);

    if (targetLanguages.length === 0) {
      setError("Enter at least one target language.");
      return;
    }

    setIsSubmitting(true);

    try {
      const session = await getBrowserSession();

      if (!session?.access_token) {
        throw new Error("You must be signed in before uploading media.");
      }

      const supabase = getSupabaseBrowserClient();
      const createdJob = await startUploadFlow({
        accessToken: session.access_token,
        file,
        durationSeconds: parsedDuration,
        outputMode,
        targetLanguages,
        uploadFile: async (bucket, path, uploadFile) => {
          const { error: uploadError } = await supabase.storage
            .from(bucket)
            .upload(path, uploadFile, {
              cacheControl: "3600",
              contentType: uploadFile.type,
              upsert: false,
            });

          if (uploadError) {
            throw uploadError;
          }
        },
      });

      setSuccess(createdJob);
    } catch (submissionError) {
      setError(getErrorMessage(submissionError));
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f5f1e8_0%,#f0f7ff_45%,#eef8f1_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <section className="rounded-[2rem] border border-stone-200/70 bg-white/85 p-8 shadow-[0_24px_80px_rgba(66,50,20,0.08)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
            Media Translator
          </p>
          <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-stone-950">
            Upload source media, send it to storage, and create a translation job.
          </h1>
          <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-600">
            This page wires the T8 and T9 backend flow together: initialize the
            upload, push the file to Supabase Storage with the browser session,
            then create a job from that confirmed storage object.
          </p>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
          <form
            onSubmit={handleSubmit}
            className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]"
          >
            <div className="grid gap-6">
              <label className="grid gap-2">
                <span className="text-sm font-medium text-stone-700">Media file</span>
                <input
                  type="file"
                  accept="audio/*,video/*"
                  onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                  className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm"
                />
              </label>

              <div className="grid gap-6 md:grid-cols-2">
                <label className="grid gap-2">
                  <span className="text-sm font-medium text-stone-700">
                    Duration in seconds
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="300"
                    value={durationSeconds}
                    onChange={(event) => setDurationSeconds(event.target.value)}
                    className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm"
                  />
                </label>

                <label className="grid gap-2">
                  <span className="text-sm font-medium text-stone-700">Output mode</span>
                  <select
                    value={outputMode}
                    onChange={(event) => setOutputMode(event.target.value as OutputMode)}
                    className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm"
                  >
                    {OUTPUT_MODES.map((mode) => (
                      <option key={mode} value={mode}>
                        {mode}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="grid gap-2">
                <span className="text-sm font-medium text-stone-700">
                  Target languages
                </span>
                <input
                  type="text"
                  value={targetLanguageInput}
                  onChange={(event) => setTargetLanguageInput(event.target.value)}
                  placeholder="fr, es"
                  className="rounded-2xl border border-stone-300 bg-stone-50 px-4 py-3 text-sm"
                />
                <span className="text-xs text-stone-500">
                  Enter language codes separated by commas. Duplicate entries are
                  safely deduplicated by the backend.
                </span>
              </label>

              <button
                type="submit"
                disabled={isSubmitting}
                className="inline-flex h-12 items-center justify-center rounded-full bg-stone-950 px-6 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
              >
                {isSubmitting ? "Creating job..." : "Upload and create job"}
              </button>
            </div>
          </form>

          <aside className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
            <h2 className="text-lg font-semibold text-stone-950">Status</h2>

            <div className="mt-5 grid gap-4 text-sm">
              <div className="rounded-2xl bg-stone-50 p-4">
                <p className="font-medium text-stone-800">Loading state</p>
                <p className="mt-1 text-stone-600">
                  While submitting, the form locks and the primary button switches
                  to a progress label.
                </p>
              </div>

              {error ? (
                <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
                  <p className="font-medium">Error</p>
                  <p className="mt-1">{error}</p>
                </div>
              ) : null}

              {success ? (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900">
                  <p className="font-medium">Job created</p>
                  <dl className="mt-3 grid gap-2 text-sm">
                    <div>
                      <dt className="font-medium">Job ID</dt>
                      <dd className="break-all">{success.jobId}</dd>
                    </div>
                    <div>
                      <dt className="font-medium">Status</dt>
                      <dd>{success.status}</dd>
                    </div>
                    <div>
                      <dt className="font-medium">Storage path</dt>
                      <dd className="break-all">{success.storagePath}</dd>
                    </div>
                    <div>
                      <dt className="font-medium">Reserved credits</dt>
                      <dd>{success.reservedCredits}</dd>
                    </div>
                    <div>
                      <dt className="font-medium">Target languages</dt>
                      <dd>{success.targetLanguages.join(", ")}</dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-stone-600">
                  Submit the form with a signed-in Supabase browser session to
                  create a job.
                </div>
              )}
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
