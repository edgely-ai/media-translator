import {
  CreditLedgerStateError,
  DuplicateCreditFinalizationError,
  getCreditLifecycleState,
} from "@/lib/credits/creditLedgerState";
import { createCreditLedgerEntry } from "@/lib/db/credits";
import type { DatabaseExecutor } from "@/lib/db/client";
import type { CreditLedgerRow } from "@/types/credits";

export interface FinalizeCreditsInput {
  profileId: string;
  jobId: string;
  credits?: number;
  description?: string | null;
}

export interface FinalizeCreditsResult {
  entry: CreditLedgerRow;
  finalizedCredits: number;
}

export async function finalizeCredits(
  db: DatabaseExecutor,
  input: FinalizeCreditsInput,
): Promise<FinalizeCreditsResult> {
  const lifecycleState = await getCreditLifecycleState(db, input.jobId);

  if (lifecycleState.finalized_credits > 0) {
    throw new DuplicateCreditFinalizationError(
      `Job ${input.jobId} has already been finalized.`,
    );
  }

  if (lifecycleState.finalizable_credits <= 0) {
    throw new CreditLedgerStateError(
      `Job ${input.jobId} has no reserved credits available to finalize.`,
    );
  }

  const finalizedCredits =
    input.credits ?? lifecycleState.finalizable_credits;

  if (!Number.isInteger(finalizedCredits) || finalizedCredits <= 0) {
    throw new CreditLedgerStateError(
      "credits must be a positive integer when finalizing.",
    );
  }

  if (finalizedCredits > lifecycleState.finalizable_credits) {
    throw new CreditLedgerStateError(
      `Cannot finalize ${finalizedCredits} credits when only ${lifecycleState.finalizable_credits} are available.`,
    );
  }

  const entry = await createCreditLedgerEntry(db, {
    profileId: input.profileId,
    jobId: input.jobId,
    entryType: "finalize",
    amount: finalizedCredits,
    description: input.description ?? "Finalized credits for completed job work",
  });

  return {
    entry,
    finalizedCredits,
  };
}
