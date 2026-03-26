import { JobDetailView } from "@/components/job-detail-view";
import { TranscriptEditorPanel } from "@/components/transcript-editor-panel";

export default async function JobDetailPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = await params;

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f5f1e8_0%,#f7fafc_48%,#eef7f0_100%)] px-6 py-10 text-stone-900">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <JobDetailView jobId={jobId} />
        <TranscriptEditorPanel jobId={jobId} />
      </div>
    </main>
  );
}
