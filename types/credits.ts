export const CREDIT_LEDGER_ENTRY_TYPES = [
  "reserve",
  "finalize",
  "release",
  "grant",
  "adjustment",
] as const;

export type CreditLedgerEntryType =
  (typeof CREDIT_LEDGER_ENTRY_TYPES)[number];

export interface CreditLedgerRow {
  id: string;
  profile_id: string;
  job_id: string | null;
  entry_type: CreditLedgerEntryType;
  amount: number;
  description: string | null;
  created_at: string;
}

export interface ProfileCreditBalanceRow {
  profile_id: string;
  balance: number;
}
