"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { getBrowserSession, getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { startUploadFlow } from "@/lib/storage/upload-flow";
import {
  getUploadErrorDisplay,
  getUploadValidationError,
  type UploadErrorDisplay,
} from "@/lib/ui/errorMessages";
import type { CreateJobResponse, OutputMode } from "@/types/jobs";

const OUTPUT_MODES: OutputMode[] = ["subtitles", "dubbed_audio", "lip_sync"];

function parseTargetLanguages(input: string): string[] {
  return input
    .split(",")
    .map((value) => value.trim().toLowerCase())
    .filter(Boolean);
}

interface UploadJobCardProps {
  title: string;
  description: string;
  submitLabel?: string;
  onJobCreated?: (job: CreateJobResponse) => void;
}

export function UploadJobCard({
  title,
  description,
  submitLabel = "Upload and create job",
  onJobCreated,
}: UploadJobCardProps) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [durationSeconds, setDurationSeconds] = useState("120");
  const [outputMode, setOutputMode] = useState<OutputMode>("subtitles");
  const [targetLanguageInput, setTargetLanguageInput] = useState("fr, es");
  const [isUploading, setIsUploading] = useState(false);
  const [isCreatingJob, setIsCreatingJob] = useState(false);
  const [error, setError] = useState<UploadErrorDisplay | null>(null);
  const [success, setSuccess] = useState<CreateJobResponse | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const validationError = getUploadValidationError({
      file,
      durationSeconds,
      outputMode,
      targetLanguageInput,
    });

    if (validationError) {
      setError(validationError);
      return;
    }

    const parsedDuration = Number(durationSeconds);
    const targetLanguages = parseTargetLanguages(targetLanguageInput);
    const selectedFile = file;

    if (!selectedFile) {
      setError({
        title: "Choose a source file",
        message: "Select an audio or video file before creating a job.",
      });
      return;
    }

    try {
      const session = await getBrowserSession();

      if (!session?.access_token) {
        setError({
          title: "Sign in required",
          message: "You must be signed in before uploading media.",
        });
        return;
      }

      const supabase = getSupabaseBrowserClient();
      setIsUploading(true);

      const createdJob = await startUploadFlow({
        accessToken: session.access_token,
        file: selectedFile,
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

      setIsUploading(false);
      setIsCreatingJob(true);
      setSuccess(createdJob);
      onJobCreated?.(createdJob);
      router.refresh();
    } catch (submissionError) {
      setError(getUploadErrorDisplay(submissionError));
    } finally {
      setIsUploading(false);
      setIsCreatingJob(false);
    }
  }

  const isSubmitting = isUploading || isCreatingJob;
  const progressLabel = isUploading
    ? "Uploading media..."
    : isCreatingJob
      ? "Creating job..."
      : submitLabel;

  return (
    <section className="grid gap-6 lg:grid-cols-[1.3fr_0.9fr]">
      <form
        onSubmit={handleSubmit}
        className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]"
      >
        <div className="flex flex-col gap-6">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
              Upload
            </p>
            <h2 className="mt-4 text-2xl font-semibold tracking-tight text-stone-950">
              {title}
            </h2>
            <p className="mt-4 max-w-2xl text-sm leading-7 text-stone-600">
              {description}
            </p>
          </div>

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
              Enter language codes separated by commas. Duplicate entries are safely
              deduplicated by the backend.
            </span>
          </label>

          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex h-12 items-center justify-center rounded-full bg-stone-950 px-6 text-sm font-semibold text-white transition hover:bg-stone-800 disabled:cursor-not-allowed disabled:bg-stone-400"
          >
            {progressLabel}
          </button>
        </div>
      </form>

      <aside className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
        <h2 className="text-lg font-semibold text-stone-950">Status</h2>

        <div className="mt-5 grid gap-4 text-sm">
          <div className="rounded-2xl bg-stone-50 p-4">
            <p className="font-medium text-stone-800">Progress</p>
            <p className="mt-1 text-stone-600">
              {isUploading
                ? "Uploading the source file to Supabase Storage."
                : isCreatingJob
                  ? "Upload finished. Creating the job now."
                  : "Choose a file, target languages, and output mode to create a job."}
            </p>
          </div>

          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-red-700">
              <p className="font-medium">{error.title}</p>
              <p className="mt-1">{error.message}</p>
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
              <div className="mt-4 flex flex-wrap gap-3">
                <Link
                  href={`/dashboard/jobs/${success.jobId}`}
                  className="inline-flex h-11 items-center justify-center rounded-full bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
                >
                  Open job
                </Link>
                <button
                  type="button"
                  onClick={() => router.refresh()}
                  className="inline-flex h-11 items-center justify-center rounded-full border border-stone-300 px-5 text-sm font-semibold text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
                >
                  Refresh dashboard
                </button>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-4 text-stone-600">
              Submit the form with a signed-in Supabase browser session to create a
              job.
            </div>
          )}
        </div>
      </aside>
    </section>
  );
}
