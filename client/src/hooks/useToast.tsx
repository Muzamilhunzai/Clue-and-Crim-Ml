import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, CircleAlert, Info, X } from 'lucide-react';
import { cx } from '@/lib/format';

type Kind = 'success' | 'error' | 'info';
interface Toast { id: number; kind: Kind; message: string }
interface ToastApi { success: (m: string) => void; error: (m: string) => void; info: (m: string) => void }

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((kind: Kind, message: string) => {
    const id = ++seq.current;
    setItems((l) => [...l.slice(-3), { id, kind, message }]);
    window.setTimeout(() => dismiss(id), kind === 'error' ? 7000 : 4000);
  }, [dismiss]);
  const api = useMemo<ToastApi>(() => ({
    success: (m) => push('success', m), error: (m) => push('error', m), info: (m) => push('info', m),
  }), [push]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="fixed bottom-4 right-4 z-[80] flex w-[min(92vw,380px)] flex-col gap-2" role="region" aria-label="Notifications" aria-live="polite">
        {items.map((t) => {
          const Icon = t.kind === 'success' ? CheckCircle2 : t.kind === 'error' ? CircleAlert : Info;
          return (
            <div key={t.id} role={t.kind === 'error' ? 'alert' : 'status'}
              className={cx('anim-pop flex items-start gap-3 rounded-xl border bg-white p-3.5 pr-2.5 shadow-[var(--shadow-pop)]',
                t.kind === 'error' ? 'border-danger/40' : 'border-line-strong')}>
              <Icon size={18} className={cx('mt-0.5 shrink-0', t.kind === 'success' ? 'text-ok' : t.kind === 'error' ? 'text-danger' : 'text-info')} />
              <p className="flex-1 text-[13.5px] leading-snug">{t.message}</p>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="rounded-md p-1 text-muted hover:bg-mist hover:text-ink"><X size={15} /></button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}
