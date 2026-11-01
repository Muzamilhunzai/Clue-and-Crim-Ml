import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/** List state (search, filters, sort, page) lives in the URL: shareable, survives refresh and the back button. */
export function useListParams(defaults: { sort?: string; order?: 'asc' | 'desc' } = {}) {
  const [params, setParams] = useSearchParams();
  const get = (k: string) => params.get(k) ?? '';
  const set = useCallback((patch: Record<string, string | number | null>, resetPage = true) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) { if (v === null || v === '' || v === undefined) next.delete(k); else next.set(k, String(v)); }
      if (resetPage && !('page' in patch)) next.delete('page');
      return next;
    }, { replace: true });
  }, [setParams]);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const sort = params.get('sort') || defaults.sort || '';
  const order = (params.get('order') as 'asc' | 'desc' | null) || defaults.order || 'asc';
  const toggleSort = (key: string, firstOrder: 'asc' | 'desc' = 'asc') => {
    if (sort === key) set({ sort: key, order: order === 'asc' ? 'desc' : 'asc' }, false);
    else set({ sort: key, order: firstOrder }, false);
  };
  const clear = (keys: string[]) => set(Object.fromEntries(keys.map((k) => [k, null])));
  return { get, set, page, sort, order, toggleSort, clear, params };
}
