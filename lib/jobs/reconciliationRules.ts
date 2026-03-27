import { JOB_STATE, TARGET_STATE } from "@/lib/jobs/jobStates";
import type { JobRow, JobTargetRow } from "@/types/jobs";

export type ReconciliationTargetLike = Pick<
  JobTargetRow,
  | "id"
  | "status"
  | "subtitle_path"
  | "dubbed_audio_path"
  | "dubbed_video_path"
  | "error_message"
>;

export type ReconciliationJobLike = Pick<
  JobRow,
  | "id"
  | "output_mode"
  | "status"
  | "error_message"
  | "cancel_reason"
  | "canceled_at"
>;

export type CreditLedgerEntryLike = {
  entry_type: "reserve" | "finalize" | "release" | "grant" | "adjustment";
  amount: number;
};

export interface DerivedJobOutcome {
  status: JobRow["status"];
  isTerminal: boolean;
  successfulTargetIds: string[];
  failedTargetIds: string[];
  pendingTargetIds: string[];
}

export interface ReconciliationComputation extends DerivedJobOutcome {
  finalizedCredits: number;
  releasedCredits: number;
  terminalErrorMessage: string | null;
}

function isSuccessfulTarget(
  outputMode: JobRow["output_mode"],
  target: ReconciliationTargetLike,
): boolean {
  if (outputMode === "subtitles") {
    return Boolean(target.subtitle_path) && target.status !== TARGET_STATE.FAILED;
  }

  if (outputMode === "dubbed_audio") {
    return Boolean(target.dubbed_audio_path);
  }

  return Boolean(target.dubbed_video_path) && target.status === TARGET_STATE.COMPLETED;
}

function isFailedTarget(target: ReconciliationTargetLike): boolean {
  return target.status === TARGET_STATE.FAILED;
}

function hasUsableOutput(target: ReconciliationTargetLike): boolean {
  return Boolean(
    target.subtitle_path || target.dubbed_audio_path || target.dubbed_video_path,
  );
}

export function getTargetAllocations(
  reservedCredits: number,
  targets: ReconciliationTargetLike[],
): Map<string, number> {
  const allocations = new Map<string, number>();

  if (targets.length === 0 || reservedCredits <= 0) {
    return allocations;
  }

  const base = Math.floor(reservedCredits / targets.length);
  const remainder = reservedCredits % targets.length;

  targets.forEach((target, index) => {
    allocations.set(target.id, base + (index < remainder ? 1 : 0));
  });

  return allocations;
}

export function summarizeCredits(entries: CreditLedgerEntryLike[]) {
  return entries.reduce(
    (summary, entry) => {
      if (entry.entry_type === "reserve") {
        summary.reserved += entry.amount * -1;
      }

      if (entry.entry_type === "finalize") {
        summary.finalized += entry.amount;
      }

      if (entry.entry_type === "release") {
        summary.released += entry.amount;
      }

      return summary;
    },
    { reserved: 0, finalized: 0, released: 0 },
  );
}

export function deriveJobOutcome(
  job: ReconciliationJobLike,
  targets: ReconciliationTargetLike[],
): DerivedJobOutcome {
  const successfulTargets = targets.filter((target) =>
    isSuccessfulTarget(job.output_mode, target),
  );
  const failedTargets = targets.filter((target) => isFailedTarget(target));
  const pendingTargets = targets.filter(
    (target) =>
      !successfulTargets.some((successful) => successful.id === target.id) &&
      !failedTargets.some((failed) => failed.id === target.id),
  );

  if (pendingTargets.length > 0) {
    return {
      status: job.status,
      isTerminal: false,
      successfulTargetIds: successfulTargets.map((target) => target.id),
      failedTargetIds: failedTargets.map((target) => target.id),
      pendingTargetIds: pendingTargets.map((target) => target.id),
    };
  }

  if (successfulTargets.length === targets.length) {
    return {
      status: JOB_STATE.COMPLETED,
      isTerminal: true,
      successfulTargetIds: successfulTargets.map((target) => target.id),
      failedTargetIds: [],
      pendingTargetIds: [],
    };
  }

  if (successfulTargets.length > 0) {
    return {
      status: JOB_STATE.PARTIAL_SUCCESS,
      isTerminal: true,
      successfulTargetIds: successfulTargets.map((target) => target.id),
      failedTargetIds: failedTargets.map((target) => target.id),
      pendingTargetIds: [],
    };
  }

  if (targets.some((target) => hasUsableOutput(target))) {
    return {
      status: JOB_STATE.PARTIAL_SUCCESS,
      isTerminal: true,
      successfulTargetIds: [],
      failedTargetIds: failedTargets.map((target) => target.id),
      pendingTargetIds: [],
    };
  }

  if (job.canceled_at) {
    return {
      status: JOB_STATE.CANCELED,
      isTerminal: true,
      successfulTargetIds: [],
      failedTargetIds: failedTargets.map((target) => target.id),
      pendingTargetIds: [],
    };
  }

  return {
    status: JOB_STATE.FAILED,
    isTerminal: true,
    successfulTargetIds: [],
    failedTargetIds: failedTargets.map((target) => target.id),
    pendingTargetIds: [],
  };
}

export function computeReconciliation(
  job: ReconciliationJobLike,
  targets: ReconciliationTargetLike[],
  entries: CreditLedgerEntryLike[],
): ReconciliationComputation {
  const derived = deriveJobOutcome(job, targets);

  if (!derived.isTerminal) {
    return {
      ...derived,
      finalizedCredits: 0,
      releasedCredits: 0,
      terminalErrorMessage: null,
    };
  }

  const creditSummary = summarizeCredits(entries);
  const allocations = getTargetAllocations(creditSummary.reserved, targets);

  let finalizedCredits = 0;
  let releasedCredits = 0;

  if (derived.status === JOB_STATE.COMPLETED) {
    finalizedCredits = Math.max(
      creditSummary.reserved - creditSummary.finalized - creditSummary.released,
      0,
    );
  } else if (derived.status === JOB_STATE.PARTIAL_SUCCESS) {
    const allocatedSuccessfulCredits = derived.successfulTargetIds.reduce(
      (sum, targetId) => sum + (allocations.get(targetId) ?? 0),
      0,
    );

    finalizedCredits = Math.max(
      allocatedSuccessfulCredits - creditSummary.finalized,
      0,
    );
    releasedCredits = Math.max(
      creditSummary.reserved -
        creditSummary.finalized -
        finalizedCredits -
        creditSummary.released,
      0,
    );
  } else {
    releasedCredits = Math.max(
      creditSummary.reserved - creditSummary.finalized - creditSummary.released,
      0,
    );
  }

  const terminalErrorMessage =
    derived.status === JOB_STATE.COMPLETED
      ? null
      : derived.status === JOB_STATE.CANCELED
        ? job.cancel_reason?.trim()
          ? `Processing canceled by user request. Reason: ${job.cancel_reason.trim()}`
          : "Processing canceled by user request."
        : targets
            .filter((target) => target.error_message)
            .map((target) => target.error_message)
            .join(" | ") || null;

  return {
    ...derived,
    finalizedCredits,
    releasedCredits,
    terminalErrorMessage,
  };
}
