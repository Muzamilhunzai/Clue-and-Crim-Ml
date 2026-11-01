import type { QueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, setUnauthorizedHandler } from '@/lib/api';
import type { Permission, Session, User } from '@/types';

interface AuthValue {
  user: User | null;
  loading: boolean;
  can: (p: Permission) => boolean;
  signIn: (login: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthValue | null>(null);

/** Drop every cached API result except the session itself (so one user's data never shows for the next). */
const forgetData = (qc: QueryClient) => qc.removeQueries({ predicate: (q) => q.queryKey[0] !== 'session' });

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ['session'],
    queryFn: async () => {
      try { return await api.get<Session>('/auth/me'); }
      catch (e) { if (e instanceof ApiError && e.status === 401) return null; throw e; }
    },
    staleTime: Infinity,
    retry: false,
  });

  // A 401 from any call (expired session, deactivated account) drops the cached session -> router shows /login.
  useEffect(() => {
    setUnauthorizedHandler(() => { forgetData(qc); qc.setQueryData(['session'], null); });
    return () => setUnauthorizedHandler(null);
  }, [qc]);

  const signIn = useCallback(async (login: string, password: string) => {
    const s = await api.post<Session>('/auth/login', { login, password });
    forgetData(qc);
    qc.setQueryData(['session'], s);
  }, [qc]);

  const signOut = useCallback(async () => {
    try { await api.post('/auth/logout'); } catch { /* already signed out */ }
    forgetData(qc);
    qc.setQueryData(['session'], null);
  }, [qc]);

  const refresh = useCallback(async () => { await qc.invalidateQueries({ queryKey: ['session'] }); }, [qc]);

  const value = useMemo<AuthValue>(() => {
    const session = q.data ?? null;
    const perms = new Set(session?.permissions ?? []);
    return { user: session?.user ?? null, loading: q.isPending, can: (p) => perms.has(p), signIn, signOut, refresh };
  }, [q.data, q.isPending, signIn, signOut, refresh]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside <AuthProvider>');
  return v;
}
