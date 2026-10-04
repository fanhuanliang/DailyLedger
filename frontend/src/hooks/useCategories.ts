import { loadAllPages } from '../api/pagination';
import { useCallback, useEffect, useState } from 'react';
import { apiPost, apiPatch, ApiError } from '../api/client';
import type { Category } from '../types/domain';

export function useCategories() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await loadAllPages<Category>('/categories?includeArchived=true');
      setCategories(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not load categories.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const createCategory = useCallback(async (name: string, kind: string) => {
    const result = await apiPost<Category>('/categories', { name, kind });
    await reload();
    return result.data;
  }, [reload]);

  const renameCategory = useCallback(async (id: string, name: string, expectedRevision: number) => {
    await apiPatch<Category>(`/categories/${id}`, { name, expectedRevision });
    await reload();
  }, [reload]);

  const archiveCategory = useCallback(async (id: string, expectedRevision: number) => {
    await apiPost<Category>(`/categories/${id}/archive`, { expectedRevision });
    await reload();
  }, [reload]);

  return { categories, loading, error, reload, createCategory, renameCategory, archiveCategory };
}
