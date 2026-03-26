import type { JobStatus, JobTargetStatus, OutputMode } from "@/types/jobs";

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

function getCurrentStepIndex(
  status: JobStatus,
  outputMode?: OutputMode,
): number {
  const steps = getRelevantTimelineSteps(outputMode);
  const index = steps.findIndex((step) => step.states.includes(status));

  return index >= 0 ? index : 0;
}

interface JobProgressTimelineProps {
  status: JobStatus;
  outputMode?: OutputMode;
  targets?: Array<{
    status: JobTargetStatus;
    targetLanguage: string;
  }>;
}

function getRelevantTimelineSteps(outputMode?: OutputMode) {
  return TIMELINE_STEPS.filter((step) => {
    if (step.key === "audio" && outputMode === "subtitles") {
      return false;
    }

    if (step.key === "lipsync" && outputMode !== "lip_sync") {
      return false;
    }

    return true;
  });
}

function summarizeTargets(
  targets: JobProgressTimelineProps["targets"],
): string | null {
  if (!targets || targets.length === 0) {
    return null;
  }

  const summary = targets.reduce(
    (counts, target) => {
      counts[target.status] = (counts[target.status] ?? 0) + 1;
      return counts;
    },
    {} as Partial<Record<JobTargetStatus, number>>,
  );

  const parts = [
    summary.completed ? `${summary.completed} completed` : null,
    summary.audio_ready ? `${summary.audio_ready} audio ready` : null,
    summary.lipsync_requested ? `${summary.lipsync_requested} lip-sync requested` : null,
    summary.failed ? `${summary.failed} failed` : null,
  ].filter(Boolean);

  return parts.length > 0 ? parts.join(" • ") : null;
}

export function JobProgressTimeline({
  status,
  outputMode,
  targets,
}: JobProgressTimelineProps) {
  const steps = getRelevantTimelineSteps(outputMode);
  const currentStepIndex = getCurrentStepIndex(status, outputMode);
  const targetSummary = summarizeTargets(targets);

  return (
    <div className="grid gap-4">
      {steps.map((step, index) => {
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
            {step.key === "done" && targetSummary ? (
              <p className="mt-2 text-xs text-current/80">{targetSummary}</p>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
