export type AccountType = 'checking' | 'savings' | 'cash' | 'credit_card';
export type CategoryKind = 'income' | 'expense';
export type TransactionType = 'income' | 'expense' | 'refund' | 'transfer';

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
  source: 'manual' | 'mcp' | 'recurring';
  revision: number;
  created_at: string;
  updated_at: string;
}

export interface PageMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface AccountSummary extends Account {
  balance_cents: number | 'not_available';
  balance_as_of: string;
}
