import { type DatabaseExecutor, queryMany, requireOne } from "@/lib/db/client";
import type {
  CreditLedgerEntryType,
  CreditLedgerRow,
  ProfileCreditBalanceRow,
} from "@/types/credits";

export interface CreateCreditLedgerEntryInput {
  profileId: string;
  jobId?: string | null;
  entryType: CreditLedgerEntryType;
  amount: number;
  description?: string | null;
}

export async function createCreditLedgerEntry(
  db: DatabaseExecutor,
  input: CreateCreditLedgerEntryInput,
): Promise<CreditLedgerRow> {
  return requireOne<CreditLedgerRow>(
    db,
    `INSERT INTO credit_ledger (profile_id, job_id, entry_type, amount, description)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, profile_id, job_id, entry_type, amount, description, created_at`,
    [
      input.profileId,
      input.jobId ?? null,
      input.entryType,
      input.amount,
      input.description ?? null,
    ],
    "Failed to create credit ledger entry.",
  );
}

export async function listCreditLedgerByJobId(
  db: DatabaseExecutor,
  jobId: string,
): Promise<CreditLedgerRow[]> {
  return queryMany<CreditLedgerRow>(
    db,
    `SELECT id, profile_id, job_id, entry_type, amount, description, created_at
     FROM credit_ledger
     WHERE job_id = $1
     ORDER BY created_at ASC`,
    [jobId],
  );
}

export async function listCreditLedgerByProfileId(
  db: DatabaseExecutor,
  profileId: string,
  limit = 50,
): Promise<CreditLedgerRow[]> {
  return queryMany<CreditLedgerRow>(
    db,
    `SELECT id, profile_id, job_id, entry_type, amount, description, created_at
     FROM credit_ledger
     WHERE profile_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [profileId, limit],
  );
}

export async function getCreditBalanceByProfileId(
  db: DatabaseExecutor,
  profileId: string,
): Promise<number> {
  const rows = await queryMany<ProfileCreditBalanceRow>(
    db,
    `SELECT profile_id, COALESCE(SUM(amount), 0)::int AS balance
     FROM credit_ledger
     WHERE profile_id = $1
     GROUP BY profile_id`,
    [profileId],
  );

  return rows[0]?.balance ?? 0;
}
