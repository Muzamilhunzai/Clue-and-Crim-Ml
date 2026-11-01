/**
 * Thin fetch wrapper around the TraceNet REST API.
 * - same-origin cookies (HttpOnly session cookie set by the server; JS never sees it)
 * - X-TraceNet-Client header: part of the server's CSRF defence
 * - every failure becomes an ApiError carrying the server's { code, message, details }
 */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: { fields?: Record<string, string>; [k: string]: unknown };
  constructor(status: number, code: string, message: string, details?: ApiError['details']) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
  /** Per-field validation messages (422), or {} */
  get fields(): Record<string, string> {
    return this.details?.fields ?? {};
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

export const qs = (params?: Query) => {
  if (!params) return '';
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : '';
};

let onUnauthorized: (() => void) | null = null;
export const setUnauthorizedHandler = (fn: (() => void) | null) => { onUnauthorized = fn; };

async function request<T>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      credentials: 'same-origin',
      signal,
      headers: {
        Accept: 'application/json',
        'X-TraceNet-Client': 'web',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK', 'Cannot reach the TraceNet server. Check that it is running (npm run dev) and try again.');
  }
  let data: unknown = null;
  const text = await res.text();
  if (text) { try { data = JSON.parse(text); } catch { /* not JSON */ } }
  if (!res.ok) {
    const err = (data as { error?: { code?: string; message?: string; details?: ApiError['details'] } } | null)?.error;
    if (res.status === 401 && path !== '/auth/login' && path !== '/auth/me') onUnauthorized?.();
    throw new ApiError(res.status, err?.code ?? 'ERROR', err?.message ?? `Request failed (${res.status}).`, err?.details);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, params?: Query, signal?: AbortSignal) => request<T>('GET', path + qs(params), undefined, signal),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  del: <T>(path: string) => request<T>('DELETE', path),
};
