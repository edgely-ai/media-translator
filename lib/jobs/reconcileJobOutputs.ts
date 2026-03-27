import { createSupabaseAdminClient } from "@/lib/supabase/server";
import { JOB_STATE } from "@/lib/jobs/jobStates";
import {
  computeReconciliation,
  deriveJobOutcome,
  type CreditLedgerEntryLike,
  type ReconciliationJobLike,
  type ReconciliationTargetLike,
} from "@/lib/jobs/reconciliationRules";
import {
  logJobStepCompleted,
  logJobStepFailed,
  logJobStepStarted,
} from "@/lib/jobs/stepLogging";
import type { JobRow, JobTargetRow } from "@/types/jobs";

const STEP_NAME = "reconcileJobOutputs";

type ReconciliationTargetRow = ReconciliationTargetLike &
  Pick<JobTargetRow, "job_id" | "target_language" | "created_at">;

type ReconciliationJobRow = ReconciliationJobLike &
  Pick<JobRow, "profile_id" | "completed_at">;

type CreditLedgerEntryRow = CreditLedgerEntryLike;

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
    .select(
      "id, profile_id, output_mode, status, error_message, cancel_reason, canceled_at, completed_at",
    )
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

  const derived = deriveJobOutcome(job, targets);

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

  const computed = computeReconciliation(job, targets, creditEntries);
  const finalizedCredits = computed.finalizedCredits;
  const releasedCredits = computed.releasedCredits;

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
    computed.status === JOB_STATE.CANCELED
      ? computed.terminalErrorMessage
      : targets
          .filter((target) => target.error_message)
          .map((target) => `${target.target_language}: ${target.error_message}`)
          .join(" | ") || computed.terminalErrorMessage;

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
