import {
  CreditLedgerStateError,
  InsufficientCreditsError,
  getCreditLifecycleState,
} from "@/lib/credits/creditLedgerState";
import {
  createCreditLedgerEntry,
  getCreditBalanceByProfileId,
} from "@/lib/db/credits";
import type { DatabaseExecutor } from "@/lib/db/client";
import type { CreditLedgerRow } from "@/types/credits";

export interface ReserveCreditsInput {
  profileId: string;
  jobId: string;
  credits: number;
  description?: string | null;
}

export interface ReserveCreditsResult {
  entry: CreditLedgerRow;
  reservedCredits: number;
}

export async function reserveCredits(
  db: DatabaseExecutor,
  input: ReserveCreditsInput,
): Promise<ReserveCreditsResult> {
  if (!Number.isInteger(input.credits) || input.credits <= 0) {
    throw new CreditLedgerStateError("credits must be a positive integer.");
  }

  const availableCredits = await getCreditBalanceByProfileId(db, input.profileId);

  if (availableCredits < input.credits) {
    throw new InsufficientCreditsError(
      `Available credits (${availableCredits}) are less than requested reservation (${input.credits}).`,
    );
  }

  const lifecycleState = await getCreditLifecycleState(db, input.jobId);

  if (lifecycleState.reserved_minus_released > 0) {
    throw new CreditLedgerStateError(
      `Job ${input.jobId} already has an active credit reservation.`,
    );
  }

  const entry = await createCreditLedgerEntry(db, {
    profileId: input.profileId,
    jobId: input.jobId,
    entryType: "reserve",
    amount: input.credits * -1,
    description: input.description ?? "Reserved credits for job processing",
  });

  return {
    entry,
    reservedCredits: input.credits,
  };
}
