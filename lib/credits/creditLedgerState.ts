import {
  getJobCreditLedgerSummary,
  type JobCreditLedgerSummary,
} from "@/lib/db/credits";
import type { DatabaseExecutor } from "@/lib/db/client";

export class InsufficientCreditsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InsufficientCreditsError";
  }
}

export class CreditLedgerStateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CreditLedgerStateError";
  }
}

export class DuplicateCreditFinalizationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateCreditFinalizationError";
  }
}

export class DuplicateCreditReleaseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DuplicateCreditReleaseError";
  }
}

export interface CreditLifecycleState extends JobCreditLedgerSummary {
  releasable_credits: number;
  finalizable_credits: number;
  reserved_minus_released: number;
}

export async function getCreditLifecycleState(
  db: DatabaseExecutor,
  jobId: string,
): Promise<CreditLifecycleState> {
  const summary = await getJobCreditLedgerSummary(db, jobId);
  const reservedMinusReleased =
    summary.reserved_credits - summary.released_credits;
  const finalizableCredits =
    summary.reserved_credits - summary.released_credits;
  const releasableCredits =
    summary.reserved_credits -
    summary.finalized_credits -
    summary.released_credits;

  return {
    ...summary,
    releasable_credits: Math.max(releasableCredits, 0),
    finalizable_credits: Math.max(finalizableCredits, 0),
    reserved_minus_released: Math.max(reservedMinusReleased, 0),
  };
}
