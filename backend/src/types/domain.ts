export type AccountType = 'checking' | 'savings' | 'cash' | 'credit_card';
export type CategoryKind = 'income' | 'expense';
export type TransactionType = 'income' | 'expense' | 'refund' | 'transfer';
export type TransactionSource = 'manual' | 'mcp' | 'recurring';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  opening_date: string;
  opening_balance_cents: number;
  archived_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  kind: CategoryKind;
  archived_at: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  date: string;
  description: string;
  type: TransactionType;
  amount_cents: number;
  account_id: string;
  destination_account_id: string | null;
  category_id: string | null;
  notes: string | null;
  source: TransactionSource;
  import_batch_id: string | null;
  occurrence_id: string | null;
  revision: number;
  created_at: string;
  updated_at: string;
}

export const NOT_AVAILABLE = 'not_available' as const;
export type BalanceResult = number | typeof NOT_AVAILABLE;
