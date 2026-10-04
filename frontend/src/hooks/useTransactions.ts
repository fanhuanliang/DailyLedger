import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiPost, apiPatch, apiDelete, ApiError } from '../api/client';
import type { PageMeta, Transaction } from '../types/domain';

export interface TransactionFilters {
  dateFrom?: string;
  dateTo?: string;
  text?: string;
  categoryId?: string;
  accountId?: string;
  type?: string;
  page: number;
}

export interface TransactionInput {
  date: string;
  description: string;
  type: string;
  amountCents: number;
  accountId: string;
  destinationAccountId?: string | null;
  categoryId?: string | null;
  notes?: string | null;
}

function toQuery(filters: TransactionFilters): string {
  const params = new URLSearchParams();
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.text) params.set('text', filters.text);
  if (filters.categoryId) params.set('categoryId', filters.categoryId);
  if (filters.accountId) params.set('accountId', filters.accountId);
  if (filters.type) params.set('type', filters.type);
  params.set('page', String(filters.page));
  return params.toString();
}

export function useTransactions(filters: TransactionFilters) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [meta, setMeta] = useState<PageMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiGet<Transaction[]>(`/transactions?${toQuery(filters)}`);
      setTransactions(result.data);
      setMeta(result.meta ?? null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load records.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.dateFrom, filters.dateTo, filters.text, filters.categoryId, filters.accountId, filters.type, filters.page]);

  useEffect(() => { reload(); }, [reload]);

  const createTransaction = useCallback(async (input: TransactionInput) => {
    const result = await apiPost<Transaction>('/transactions', input);
    await reload();
    return result.data;
  }, [reload]);

  const updateTransaction = useCallback(async (id: string, input: TransactionInput, expectedRevision: number) => {
    const result = await apiPatch<Transaction>(`/transactions/${id}`, { ...input, expectedRevision });
    await reload();
    return result.data;
  }, [reload]);

  const deleteTransaction = useCallback(async (id: string, expectedRevision: number) => {
    await apiDelete(`/transactions/${id}`, { expectedRevision });
    await reload();
  }, [reload]);

  return { transactions, meta, loading, error, reload, createTransaction, updateTransaction, deleteTransaction };
}
