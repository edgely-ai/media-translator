import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { JOB_STATE, TARGET_STATE } from "@/lib/jobs/jobStates";
import {
  logJobStepCompleted,
  logJobStepFailed,
  logJobStepStarted,
} from "@/lib/jobs/stepLogging";
import type { JobRow, JobTargetRow } from "@/types/jobs";

const STEP_NAME = "reconcileJobOutputs";

type ReconciliationTargetRow = Pick<
  JobTargetRow,
  | "id"
  | "job_id"
  | "target_language"
  | "status"
  | "subtitle_path"
  | "dubbed_audio_path"
  | "dubbed_video_path"
  | "error_message"
  | "created_at"
>;

type ReconciliationJobRow = Pick<
  JobRow,
  | "id"
  | "profile_id"
  | "output_mode"
  | "status"
  | "error_message"
  | "completed_at"
>;

type CreditLedgerEntryRow = {
  entry_type: "reserve" | "finalize" | "release" | "grant" | "adjustment";
  amount: number;
};

export interface ReconcileJobOutputsResult {
  jobId: string;
  status: JobRow["status"];
  isTerminal: boolean;
  successfulTargetIds: string[];
  failedTargetIds: string[];
  pendingTargetIds: string[];
  finalizedCredits: number;
  releasedCredits: number;
}

function isSuccessfulTarget(
  outputMode: JobRow["output_mode"],
  target: ReconciliationTargetRow,
): boolean {
  if (outputMode === "subtitles") {
    return Boolean(target.subtitle_path) && target.status !== TARGET_STATE.FAILED;
  }

  if (outputMode === "dubbed_audio") {
    return Boolean(target.dubbed_audio_path);
  }

  return Boolean(target.dubbed_video_path) && target.status === TARGET_STATE.COMPLETED;
}

function isFailedTarget(target: ReconciliationTargetRow): boolean {
  return target.status === TARGET_STATE.FAILED;
}

function hasUsableOutput(target: ReconciliationTargetRow): boolean {
  return Boolean(
    target.subtitle_path || target.dubbed_audio_path || target.dubbed_video_path,
  );
}

function getTargetAllocations(
  reservedCredits: number,
  targets: ReconciliationTargetRow[],
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

function summarizeCredits(entries: CreditLedgerEntryRow[]) {
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

function deriveJobStatus(
  job: ReconciliationJobRow,
  targets: ReconciliationTargetRow[],
): Omit<
  ReconcileJobOutputsResult,
  "jobId" | "finalizedCredits" | "releasedCredits"
> {
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

  return {
    status: JOB_STATE.FAILED,
    isTerminal: true,
    successfulTargetIds: [],
    failedTargetIds: failedTargets.map((target) => target.id),
    pendingTargetIds: [],
  };
}

export async function reconcileJobOutputs(
  jobId: string,
): Promise<ReconcileJobOutputsResult> {
  const startedAt = Date.now();
  const supabase = createSupabaseAdminClient();

  logJobStepStarted({
    jobId,
    step: STEP_NAME,
  });

  const { data: job, error: jobError } = await supabase
    .from("jobs")
    .select("id, profile_id, output_mode, status, error_message, completed_at")
    .eq("id", jobId)
    .maybeSingle<ReconciliationJobRow>();

  if (jobError) {
    const error = new Error(`Failed to load job ${jobId} for reconciliation.`);
    logJobStepFailed({
      jobId,
      step: STEP_NAME,
      startedAt,
      error,
    });
    throw error;
  }

  if (!job) {
    const error = new Error(`Job ${jobId} was not found for reconciliation.`);
    logJobStepFailed({
      jobId,
      step: STEP_NAME,
      startedAt,
      error,
    });
    throw error;
  }

  const { data: targets, error: targetsError } = await supabase
    .from("job_targets")
    .select(
      "id, job_id, target_language, status, subtitle_path, dubbed_audio_path, dubbed_video_path, error_message, created_at",
    )
    .eq("job_id", jobId)
    .order("created_at", { ascending: true })
    .returns<ReconciliationTargetRow[]>();

  if (targetsError || !targets) {
    const error = new Error(
      `Failed to load targets for job ${jobId} reconciliation.`,
    );
    logJobStepFailed({
      jobId,
      step: STEP_NAME,
      startedAt,
      error,
    });
    throw error;
  }

  const derived = deriveJobStatus(job, targets);

  if (!derived.isTerminal) {
    const result = {
      jobId,
      ...derived,
      finalizedCredits: 0,
      releasedCredits: 0,
    };

    logJobStepCompleted({
      jobId,
      step: STEP_NAME,
      startedAt,
      status: result.status,
      is_terminal: false,
      success_count: result.successfulTargetIds.length,
      failure_count: result.failedTargetIds.length,
      pending_count: result.pendingTargetIds.length,
    });

    return result;
  }

  const { data: creditEntries, error: creditError } = await supabase
    .from("credit_ledger")
    .select("entry_type, amount")
    .eq("job_id", jobId)
    .returns<CreditLedgerEntryRow[]>();

  if (creditError || !creditEntries) {
    const error = new Error(`Failed to load credit ledger for job ${jobId}.`);
    logJobStepFailed({
      jobId,
      step: STEP_NAME,
      startedAt,
      error,
    });
    throw error;
  }

  const creditSummary = summarizeCredits(creditEntries);
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

  if (finalizedCredits > 0) {
    const { error: finalizeError } = await supabase.from("credit_ledger").insert({
      profile_id: job.profile_id,
      job_id: jobId,
      entry_type: "finalize",
      amount: finalizedCredits,
      description: "Finalized credits during final job reconciliation",
    });

    if (finalizeError) {
      const error = new Error(`Failed to finalize credits for job ${jobId}.`);
      logJobStepFailed({
        jobId,
        step: STEP_NAME,
        startedAt,
        error,
      });
      throw error;
    }
  }

  if (releasedCredits > 0) {
    const { error: releaseError } = await supabase.from("credit_ledger").insert({
      profile_id: job.profile_id,
      job_id: jobId,
      entry_type: "release",
      amount: releasedCredits,
      description: "Released unused credits during final job reconciliation",
    });

    if (releaseError) {
      const error = new Error(`Failed to release credits for job ${jobId}.`);
      logJobStepFailed({
        jobId,
        step: STEP_NAME,
        startedAt,
        error,
      });
      throw error;
    }
  }

  const terminalErrorMessage =
    derived.status === JOB_STATE.COMPLETED
      ? null
      : targets
          .filter((target) => target.error_message)
          .map((target) => `${target.target_language}: ${target.error_message}`)
          .join(" | ") || null;

  const { error: updateJobError } = await supabase
    .from("jobs")
    .update({
      status: derived.status,
      error_message: terminalErrorMessage,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", jobId);

  if (updateJobError) {
    const error = new Error(`Failed to persist reconciled status for job ${jobId}.`);
    logJobStepFailed({
      jobId,
      step: STEP_NAME,
      startedAt,
      error,
    });
    throw error;
  }

  const result = {
    jobId,
    ...derived,
    finalizedCredits,
    releasedCredits,
  };

  logJobStepCompleted({
    jobId,
    step: STEP_NAME,
    startedAt,
    status: result.status,
    is_terminal: true,
    success_count: result.successfulTargetIds.length,
    failure_count: result.failedTargetIds.length,
    pending_count: result.pendingTargetIds.length,
    finalized_credits: result.finalizedCredits,
    released_credits: result.releasedCredits,
  });

  return result;
}
