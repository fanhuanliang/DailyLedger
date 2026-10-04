import { loadAllPages } from '../api/pagination';
import { useCallback, useEffect, useState } from 'react';
import { apiPost, apiPatch, ApiError } from '../api/client';
import type { Account, AccountSummary } from '../types/domain';

export interface CreateAccountInput {
  name: string;
  type: string;
  openingDate: string;
  openingBalanceCents: number;
}

export function useAccounts() {
  const [accounts, setAccounts] = useState<AccountSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadAllPages<AccountSummary>('/accounts?includeArchived=true');
      setAccounts(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load accounts.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const createAccount = useCallback(async (input: CreateAccountInput) => {
    const result = await apiPost<Account>('/accounts', input);
    await reload();
    return result.data;
  }, [reload]);

  const archiveAccount = useCallback(async (id: string, expectedRevision: number) => {
    await apiPost<Account>(`/accounts/${id}/archive`, { expectedRevision });
    await reload();
  }, [reload]);

  const updateAccount = useCallback(async (id: string, input: Omit<CreateAccountInput, 'type'>, expectedRevision: number) => {
    const result = await apiPatch<Account>(`/accounts/${id}`, { ...input, expectedRevision });
    await reload();
    return result.data;
  }, [reload]);

  return { updateAccount, accounts, loading, error, reload, createAccount, archiveAccount };
}
