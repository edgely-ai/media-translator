import {
  CreditLedgerStateError,
  DuplicateCreditReleaseError,
  getCreditLifecycleState,
} from "@/lib/credits/creditLedgerState";
import { createCreditLedgerEntry } from "@/lib/db/credits";
import type { DatabaseExecutor } from "@/lib/db/client";
import type { CreditLedgerRow } from "@/types/credits";

export interface ReleaseCreditsInput {
  profileId: string;
  jobId: string;
  credits?: number;
  description?: string | null;
}

export interface ReleaseCreditsResult {
  entry: CreditLedgerRow;
  releasedCredits: number;
}

export async function releaseCredits(
  db: DatabaseExecutor,
  input: ReleaseCreditsInput,
): Promise<ReleaseCreditsResult> {
  const lifecycleState = await getCreditLifecycleState(db, input.jobId);

  if (lifecycleState.releasable_credits <= 0) {
    throw new DuplicateCreditReleaseError(
      `Job ${input.jobId} has no reserved credits left to release.`,
    );
  }

  const releasedCredits = input.credits ?? lifecycleState.releasable_credits;

  if (!Number.isInteger(releasedCredits) || releasedCredits <= 0) {
    throw new CreditLedgerStateError(
      "credits must be a positive integer when releasing.",
    );
  }

  if (releasedCredits > lifecycleState.releasable_credits) {
    throw new CreditLedgerStateError(
      `Cannot release ${releasedCredits} credits when only ${lifecycleState.releasable_credits} are available.`,
    );
  }

  const entry = await createCreditLedgerEntry(db, {
    profileId: input.profileId,
    jobId: input.jobId,
    entryType: "release",
    amount: releasedCredits,
    description:
      input.description ?? "Released unused reserved credits back to balance",
  });

  return {
    entry,
    releasedCredits,
  };
}
