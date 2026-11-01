import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import type { Lookups, Meta } from '@/types';

/** Option lists (statuses, categories ...) come from the server so the UI never hard-codes them. */
export function useMeta() {
  return useQuery({ queryKey: ['meta'], queryFn: () => api.get<Meta>('/meta'), staleTime: 10 * 60_000 });
}

/** Small id/label lists for pickers (users, cases, locations). */
export function useLookups() {
  return useQuery({ queryKey: ['lookups'], queryFn: () => api.get<Lookups>('/lookups'), staleTime: 30_000 });
}

export function labelOf(options: { value: string; label: string }[] | undefined, value: string | null | undefined) {
  if (!value) return '';
  return options?.find((o) => o.value === value)?.label ?? value.charAt(0).toUpperCase() + value.slice(1).replace(/_/g, ' ');
}
