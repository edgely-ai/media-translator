import Link from "next/link";

import { TranscriptEditorPanel } from "@/components/transcript-editor-panel";

type JobTargetOutput = {
  id: string;
  languageLabel: string;
  languageCode: string;
  status: "completed" | "audio_ready" | "lipsync_requested" | "failed";
  dubbedAudioPath: string | null;
  dubbedVideoPath: string | null;
  subtitlePath: string | null;
  errorMessage: string | null;
};

type JobDetailMock = {
  jobId: string;
  title: string;
  outputMode: "dubbed_audio" | "lip_sync";
  status: "completed" | "lip_sync_pending" | "partial_success";
  sourceName: string;
  targets: JobTargetOutput[];
};

function buildMockJobDetail(jobId: string): JobDetailMock {
  return {
    jobId,
    title: "Customer interview localization",
    outputMode: "dubbed_audio",
    status: "completed",
    sourceName: "customer-interview.mp4",
    targets: [
      {
        id: "target-fr",
        languageLabel: "French",
        languageCode: "fr",
        status: "completed",
        dubbedAudioPath: `media/${jobId}/dubbed/fr.wav`,
        dubbedVideoPath: `media/${jobId}/lip_sync/fr.mp4`,
        subtitlePath: `media/${jobId}/subtitles/fr.srt`,
        errorMessage: null,
      },
      {
        id: "target-es",
        languageLabel: "Spanish",
        languageCode: "es",
        status: "lipsync_requested",
        dubbedAudioPath: `media/${jobId}/dubbed/es.wav`,
        dubbedVideoPath: null,
        subtitlePath: `media/${jobId}/subtitles/es.srt`,
        errorMessage: null,
      },
      {
        id: "target-de",
        languageLabel: "German",
        languageCode: "de",
        status: "failed",
        dubbedAudioPath: null,
        dubbedVideoPath: null,
        subtitlePath: `media/${jobId}/subtitles/de.srt`,
        errorMessage: "Lip-sync render failed after dubbed audio completed.",
      },
    ],
  };
}

function getStatusTone(status: JobTargetOutput["status"]): string {
  switch (status) {
    case "completed":
      return "border-emerald-200 bg-emerald-50 text-emerald-800";
    case "audio_ready":
      return "border-sky-200 bg-sky-50 text-sky-800";
    case "lipsync_requested":
      return "border-amber-200 bg-amber-50 text-amber-800";
    case "failed":
      return "border-red-200 bg-red-50 text-red-700";
    default:
      return "border-stone-200 bg-stone-50 text-stone-700";
  }
}

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;
  const job = buildMockJobDetail(jobId);

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f1e8_0%,#f7fafc_48%,#eef7f0_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <section className="rounded-[2rem] border border-stone-200/70 bg-white/90 p-8 shadow-[0_24px_80px_rgba(66,50,20,0.08)] backdrop-blur">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
            Job detail
          </p>
          <h1 className="mt-4 text-4xl font-semibold tracking-tight text-stone-950">
            {job.title}
          </h1>
          <div className="mt-4 flex flex-wrap gap-3 text-sm text-stone-600">
            <span className="rounded-full bg-stone-100 px-4 py-2">
              Job ID: {job.jobId}
            </span>
            <span className="rounded-full bg-stone-100 px-4 py-2">
              Mode: {job.outputMode}
            </span>
            <span className="rounded-full bg-stone-100 px-4 py-2">
              Status: {job.status}
            </span>
            <span className="rounded-full bg-stone-100 px-4 py-2">
              Source: {job.sourceName}
            </span>
          </div>
        </section>

        <TranscriptEditorPanel jobId={jobId} />

        <section className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr]">
          <div className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-stone-950">
                  Output artifacts
                </h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-stone-600">
                  Each target language shows subtitle, dubbed-audio, and lip-sync
                  output readiness with direct actions for whichever artifacts are
                  currently available.
                </p>
              </div>
              <Link
                href="/"
                className="rounded-full border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
              >
                Back to upload
              </Link>
            </div>

            <div className="mt-8 grid gap-4">
              {job.targets.map((target) => (
                <article
                  key={target.id}
                  className="rounded-[1.5rem] border border-stone-200 bg-stone-50/80 p-5"
                >
                  <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div className="space-y-3">
                      <div className="flex flex-wrap items-center gap-3">
                        <h3 className="text-lg font-semibold text-stone-950">
                          {target.languageLabel}
                        </h3>
                        <span className="rounded-full border border-stone-200 bg-white px-3 py-1 text-xs font-medium uppercase tracking-[0.2em] text-stone-500">
                          {target.languageCode}
                        </span>
                        <span
                          className={`rounded-full border px-3 py-1 text-xs font-medium ${getStatusTone(target.status)}`}
                        >
                          {target.status}
                        </span>
                      </div>

                      <dl className="grid gap-2 text-sm text-stone-600">
                        <div>
                          <dt className="font-medium text-stone-800">
                            Dubbed audio path
                          </dt>
                          <dd className="break-all">
                            {target.dubbedAudioPath ?? "Not available yet"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-stone-800">
                            Lip-sync video path
                          </dt>
                          <dd className="break-all">
                            {target.dubbedVideoPath ?? "Not available yet"}
                          </dd>
                        </div>
                        <div>
                          <dt className="font-medium text-stone-800">
                            Subtitle companion
                          </dt>
                          <dd className="break-all">
                            {target.subtitlePath ?? "No subtitle artifact"}
                          </dd>
                        </div>
                        {target.errorMessage ? (
                          <div>
                            <dt className="font-medium text-red-700">Latest error</dt>
                            <dd className="text-red-600">{target.errorMessage}</dd>
                          </div>
                        ) : null}
                      </dl>
                    </div>

                    <div className="flex flex-col gap-3 md:items-end">
                      {target.subtitlePath ? (
                        <div className="flex flex-wrap justify-end gap-3">
                          <a
                            href={`/${target.subtitlePath}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-11 items-center justify-center rounded-full border border-sky-700 px-5 text-sm font-semibold text-sky-700 transition hover:bg-sky-700 hover:text-white"
                          >
                            View subtitles
                          </a>
                          <a
                            href={`/${target.subtitlePath}`}
                            download
                            className="inline-flex h-11 items-center justify-center rounded-full bg-sky-600 px-5 text-sm font-semibold text-white transition hover:bg-sky-500"
                          >
                            Download subtitles
                          </a>
                        </div>
                      ) : (
                        <div className="rounded-full border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500">
                          Subtitle download appears after subtitle generation succeeds
                        </div>
                      )}

                      {target.dubbedAudioPath ? (
                        <a
                          href={`/${target.dubbedAudioPath}`}
                          download
                          className="inline-flex h-11 items-center justify-center rounded-full bg-stone-950 px-5 text-sm font-semibold text-white transition hover:bg-stone-800"
                        >
                          Download audio
                        </a>
                      ) : (
                        <div className="rounded-full border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500">
                          Audio download appears after dubbing succeeds
                        </div>
                      )}

                      {target.dubbedVideoPath ? (
                        <div className="flex flex-wrap justify-end gap-3">
                          <a
                            href={`/${target.dubbedVideoPath}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex h-11 items-center justify-center rounded-full border border-stone-950 px-5 text-sm font-semibold text-stone-950 transition hover:bg-stone-950 hover:text-white"
                          >
                            View video
                          </a>
                          <a
                            href={`/${target.dubbedVideoPath}`}
                            download
                            className="inline-flex h-11 items-center justify-center rounded-full bg-emerald-600 px-5 text-sm font-semibold text-white transition hover:bg-emerald-500"
                          >
                            Download video
                          </a>
                        </div>
                      ) : target.status === "lipsync_requested" ? (
                        <div className="rounded-full border border-dashed border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                          Lip-sync render in progress
                        </div>
                      ) : (
                        <div className="rounded-full border border-dashed border-stone-300 px-4 py-3 text-sm text-stone-500">
                          Video actions appear after lip-sync completes
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </div>

          <aside className="rounded-[2rem] border border-stone-200 bg-white p-8 shadow-[0_20px_60px_rgba(30,41,59,0.08)]">
            <h2 className="text-xl font-semibold text-stone-950">Output notes</h2>
            <div className="mt-5 grid gap-4 text-sm text-stone-600">
              <div className="rounded-2xl bg-stone-50 p-4">
                <p className="font-medium text-stone-800">Current scope</p>
                <p className="mt-1 leading-6">
                  This page now surfaces all output artifacts, including lip-sync
                  video view and download actions. It still uses mock job detail
                  data until a real job detail query is wired in.
                </p>
              </div>
              <div className="rounded-2xl bg-stone-50 p-4">
                <p className="font-medium text-stone-800">Download behavior</p>
                <p className="mt-1 leading-6">
                  Successful targets expose subtitle, audio, and video actions
                  only when those artifacts exist. In-progress and failed targets
                  keep their current state visible instead of pretending the
                  output is ready.
                </p>
              </div>
              <div className="rounded-2xl bg-stone-50 p-4">
                <p className="font-medium text-stone-800">Next integration</p>
                <p className="mt-1 leading-6">
                  Once the job detail backend is wired, this panel can swap the mock
                  target list for real `job_targets`, `dubbed_video_path`, and
                  durable storage URLs.
                </p>
              </div>
            </div>
          </aside>
        </section>
      </div>
    </main>
  );
}
