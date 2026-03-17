import type { JobStatus } from "@/types/jobs";

const TIMELINE_STEPS: Array<{
  key: string;
  label: string;
  states: JobStatus[];
}> = [
  {
    key: "queued",
    label: "Queued",
    states: ["created", "queued"],
  },
  {
    key: "preprocessing",
    label: "Normalize and extract audio",
    states: ["normalizing", "extracting_audio"],
  },
  {
    key: "transcription",
    label: "Transcribe source media",
    states: ["transcribing", "transcript_ready"],
  },
  {
    key: "translation",
    label: "Translate transcript",
    states: ["translating", "generating_subtitles"],
  },
  {
    key: "audio",
    label: "Generate dubbed audio",
    states: ["generating_dubbed_audio"],
  },
  {
    key: "lipsync",
    label: "Render lip-sync video",
    states: ["lip_sync_pending"],
  },
  {
    key: "done",
    label: "Final outcome",
    states: ["completed", "partial_success", "failed"],
  },
];

const TERMINAL_TONE: Record<Extract<JobStatus, "completed" | "partial_success" | "failed">, string> =
  {
    completed: "border-emerald-200 bg-emerald-50 text-emerald-800",
    partial_success: "border-amber-200 bg-amber-50 text-amber-800",
    failed: "border-red-200 bg-red-50 text-red-700",
  };

function getCurrentStepIndex(status: JobStatus): number {
  const index = TIMELINE_STEPS.findIndex((step) => step.states.includes(status));

  return index >= 0 ? index : 0;
}

export function JobProgressTimeline({ status }: { status: JobStatus }) {
  const currentStepIndex = getCurrentStepIndex(status);

  return (
    <div className="grid gap-4">
      {TIMELINE_STEPS.map((step, index) => {
        const isCurrent = index === currentStepIndex;
        const isComplete = index < currentStepIndex;
        const isTerminal =
          status === "completed" || status === "partial_success" || status === "failed";

        let tone =
          "border-stone-200 bg-white text-stone-700";

        if (isComplete) {
          tone = "border-emerald-200 bg-emerald-50 text-emerald-800";
        } else if (isCurrent && isTerminal && step.states.includes(status)) {
          tone = TERMINAL_TONE[status];
        } else if (isCurrent) {
          tone = "border-sky-200 bg-sky-50 text-sky-800";
        }

        return (
          <div
            key={step.key}
            className={`rounded-2xl border p-4 ${tone}`}
          >
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold">{step.label}</p>
              <span className="text-xs font-medium uppercase tracking-[0.2em]">
                {isCurrent ? "Current" : isComplete ? "Done" : "Upcoming"}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
