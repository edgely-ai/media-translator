import Link from "next/link";

import { UploadJobCard } from "@/components/upload-job-card";

export default function Home() {
  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f5f1e8_0%,#f0f7ff_45%,#eef8f1_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-8">
        <section className="rounded-[2rem] border border-stone-200/70 bg-white/85 p-8 shadow-[0_24px_80px_rgba(66,50,20,0.08)] backdrop-blur">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-stone-500">
                Media Translator
              </p>
              <h1 className="mt-4 max-w-2xl text-4xl font-semibold tracking-tight text-stone-950">
                Upload source media, send it to storage, and create a translation job.
              </h1>
              <p className="mt-4 max-w-3xl text-lg leading-8 text-stone-600">
                This page still hosts the same real upload-init and job-creation flow,
                now shared with the dashboard so both entry points stay aligned.
              </p>
            </div>

            <Link
              href="/dashboard"
              className="rounded-full border border-stone-300 px-5 py-3 text-sm font-semibold text-stone-700 transition hover:border-stone-950 hover:text-stone-950"
            >
              Open dashboard
            </Link>
          </div>
        </section>

        <UploadJobCard
          title="Upload media and create a job"
          description="This shared client flow initializes the upload, sends the file to Supabase Storage with the browser session, and then creates the job from the confirmed storage object."
        />
      </div>
    </main>
  );
}
