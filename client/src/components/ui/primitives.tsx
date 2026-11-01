import { forwardRef, useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Loader2, MoreHorizontal, SearchX, TriangleAlert, X } from 'lucide-react';
import { ApiError } from '@/lib/api';
import { cx, initials } from '@/lib/format';

/* ---------------------------------------------------------------- buttons */

type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant; size?: 'sm' | 'md'; loading?: boolean; icon?: ReactNode;
}
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-ink text-white hover:bg-black active:scale-[0.98] disabled:bg-ink/40',
  secondary: 'bg-white text-ink border border-line-strong hover:border-ink disabled:text-faint disabled:hover:border-line-strong',
  ghost: 'text-ink hover:bg-ink/6 disabled:text-faint',
  danger: 'bg-danger text-white hover:bg-[#a9341f] disabled:bg-danger/40',
};
export const Button = forwardRef<HTMLButtonElement, BtnProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, children, className, disabled, type = 'button', ...rest }, ref) {
  return (
    <button ref={ref} type={type} disabled={disabled || loading}
      className={cx('inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-xl font-medium transition disabled:cursor-not-allowed',
        size === 'sm' ? 'h-8 px-3 text-[13px]' : 'h-10 px-4 text-[14px]', BTN[variant], className)} {...rest}>
      {loading ? <Loader2 size={16} className="animate-spin" /> : icon}
      {children}
    </button>
  );
});

export function IconButton({ label, children, className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button type="button" aria-label={label} title={label}
      className={cx('inline-flex h-8 w-8 items-center justify-center rounded-lg text-muted transition hover:bg-ink/6 hover:text-ink', className)} {...rest}>
      {children}
    </button>
  );
}

/** Rounded pill used for the reference's "Sort by", "Filters", "Me" controls and column pills. */
export function Pill({ children, active, className, icon, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" aria-pressed={active}
      className={cx('inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-[13.5px] font-medium transition',
        active ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white hover:border-ink', className)} {...rest}>
      {icon}{children}
    </button>
  );
}

/* ----------------------------------------------------------------- badges */

export type Tone = 'neutral' | 'danger' | 'warn' | 'ok' | 'info' | 'ink';
const TONE: Record<Tone, string> = {
  neutral: 'bg-mist text-muted', danger: 'bg-danger-soft text-danger', warn: 'bg-warn-soft text-warn',
  ok: 'bg-ok-soft text-ok', info: 'bg-info-soft text-info', ink: 'bg-ink text-white',
};
const DOT: Record<Tone, string> = {
  neutral: 'bg-faint', danger: 'bg-danger', warn: 'bg-warn', ok: 'bg-ok', info: 'bg-info', ink: 'bg-white',
};
/** Status chips always carry a text label (and a dot): meaning never depends on colour alone. */
export function Badge({ tone = 'neutral', dot = true, children, className }: { tone?: Tone; dot?: boolean; children: ReactNode; className?: string }) {
  return (
    <span className={cx('inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[12px] font-medium', TONE[tone], className)}>
      {dot && <span className={cx('h-1.5 w-1.5 rounded-full', DOT[tone])} />}
      {children}
    </span>
  );
}

export const priorityTone = (p: string): Tone => (p === 'critical' ? 'danger' : p === 'high' ? 'warn' : p === 'medium' ? 'info' : 'neutral');
export const statusTone = (s: string): Tone =>
  ({ open: 'info', investigating: 'warn', suspect_identified: 'danger', closed: 'ok', collected: 'info', in_storage: 'neutral', in_analysis: 'warn',
     released: 'ok', returned: 'ok', disposed: 'neutral', new: 'info', under_review: 'warn', corroborated: 'ok', discredited: 'neutral',
     high: 'ok', medium: 'info', low: 'warn', unverified: 'neutral' } as Record<string, Tone>)[s] ?? 'neutral';

/* ----------------------------------------------------------------- avatars */

const AV_BG = ['#e8eadb', '#dfe6ee', '#efe2d9', '#e3dcee', '#d9ebe3', '#f1e3e8'];
export function Avatar({ name, size = 28, className, dark }: { name: string; size?: number; className?: string; dark?: boolean }) {
  const idx = [...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AV_BG.length;
  return (
    <span aria-hidden title={name}
      className={cx('inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-ink ring-2 ring-white', className)}
      style={{ width: size, height: size, fontSize: size * 0.38, background: dark ? '#f6f7ed' : AV_BG[idx] }}>
      {initials(name)}
    </span>
  );
}
export function AvatarStack({ names, max = 3, size = 26 }: { names: string[]; max?: number; size?: number }) {
  return (
    <span className="inline-flex -space-x-2">
      {names.slice(0, max).map((n) => <Avatar key={n} name={n} size={size} />)}
      {names.length > max && (
        <span className="inline-flex items-center justify-center rounded-full bg-ink text-[10px] font-semibold text-white ring-2 ring-white" style={{ width: size, height: size }}>
          +{names.length - max}
        </span>
      )}
    </span>
  );
}

/* ---------------------------------------------------------------- feedback */

export const Spinner = ({ className }: { className?: string }) => <Loader2 className={cx('animate-spin text-muted', className)} size={18} aria-label="Loading" />;
export const Skeleton = ({ className }: { className?: string }) => <div className={cx('skeleton', className)} />;

export function EmptyState({ title, hint, action, icon }: { title: string; hint?: string; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <span className="mb-1 flex h-11 w-11 items-center justify-center rounded-full bg-mist text-muted">{icon ?? <SearchX size={20} />}</span>
      <p className="text-[15px] font-semibold">{title}</p>
      {hint && <p className="max-w-sm text-[13.5px] text-muted">{hint}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const e = error instanceof ApiError ? error : null;
  return (
    <div role="alert" className="mx-auto my-10 flex max-w-md flex-col items-center gap-2 rounded-2xl border border-danger/30 bg-white p-8 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-full bg-danger-soft text-danger"><TriangleAlert size={20} /></span>
      <p className="text-[15px] font-semibold">{e?.status === 403 ? 'You do not have access to this' : e?.status === 404 ? 'Not found' : 'Something went wrong'}</p>
      <p className="text-[13.5px] text-muted">{e?.message ?? 'Unexpected error. Please try again.'}</p>
      {onRetry && e?.status !== 403 && e?.status !== 404 && <Button variant="secondary" size="sm" className="mt-2" onClick={onRetry}>Try again</Button>}
    </div>
  );
}

export function InlineError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="flex items-start gap-2 rounded-lg bg-danger-soft px-3 py-2 text-[13px] text-danger"><TriangleAlert size={15} className="mt-0.5 shrink-0" />{children}</p>;
}

/* ------------------------------------------------------------------ layout */

export function Card({ children, className, pad = true }: { children: ReactNode; className?: string; pad?: boolean }) {
  return <section className={cx('rounded-[var(--radius-card)] border border-line bg-white shadow-[var(--shadow-card)]', pad && 'p-5', className)}>{children}</section>;
}

export function SectionTitle({ children, aside, className }: { children: ReactNode; aside?: ReactNode; className?: string }) {
  return (
    <div className={cx('mb-3 flex items-center justify-between gap-3', className)}>
      <h2 className="text-[17px] font-semibold tracking-tight">{children}</h2>
      {aside}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-6 sm:px-8">
      <div className="min-w-0">
        {back}
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">{title}</h1>
        {subtitle && <p className="mt-1 text-[14px] text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string; count?: number }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-line px-5 sm:px-8">
      {tabs.map((t) => (
        <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}
          className={cx('-mb-px flex h-11 items-center gap-2 whitespace-nowrap border-b-2 px-3 text-[14px] font-medium transition',
            value === t.id ? 'border-ink text-ink' : 'border-transparent text-muted hover:text-ink')}>
          {t.label}
          {t.count !== undefined && <span className={cx('rounded-full px-1.5 text-[11.5px] tabular', value === t.id ? 'bg-ink text-white' : 'bg-mist text-muted')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function Pagination({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return <p className="px-1 py-3 text-[13px] text-muted">{total} {total === 1 ? 'result' : 'results'}</p>;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <div className="flex items-center justify-between gap-3 px-1 py-3 text-[13px] text-muted">
      <span className="tabular">{from}-{to} of {total}</span>
      <div className="flex items-center gap-1">
        <IconButton label="Previous page" disabled={page <= 1} onClick={() => onPage(page - 1)} className="disabled:opacity-30"><ChevronLeft size={17} /></IconButton>
        <span className="min-w-16 text-center tabular text-ink">Page {page} / {pages}</span>
        <IconButton label="Next page" disabled={page >= pages} onClick={() => onPage(page + 1)} className="disabled:opacity-30"><ChevronRight size={17} /></IconButton>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- overlays */

export function useOutsideClose(open: boolean, close: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open, close]);
  return ref;
}

export interface MenuItem { label: string; icon?: ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }
/** Kebab / dropdown menu (the "..." on every board card). */
export function Menu({ items, label = 'More actions', trigger, align = 'right' }: { items: MenuItem[]; label?: string; trigger?: ReactNode; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  if (!items.length) return null;
  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button type="button" aria-label={label} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className={trigger ? 'inline-flex' : 'inline-flex h-8 w-8 items-center justify-center rounded-lg text-current opacity-70 transition hover:bg-black/8 hover:opacity-100'}>
        {trigger ?? <MoreHorizontal size={18} />}
      </button>
      {open && (
        <div role="menu" className={cx('anim-pop absolute z-30 mt-1 min-w-48 rounded-xl border border-line bg-white p-1 text-ink shadow-[var(--shadow-pop)]', align === 'right' ? 'right-0' : 'left-0')}>
          {items.map((it) => (
            <button key={it.label} role="menuitem" disabled={it.disabled} onClick={() => { setOpen(false); it.onClick(); }}
              className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] hover:bg-mist disabled:opacity-40', it.danger && 'text-danger')}>
              {it.icon}{it.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, width = 520 }: {
  title: string; subtitle?: string; onClose: () => void; children: ReactNode; footer?: ReactNode; width?: number;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const first = panel.current?.querySelector<HTMLElement>('input:not([type=hidden]), select, textarea, button[data-autofocus]');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); onClose(); }
      if (e.key === 'Tab' && panel.current) {           // keep keyboard focus inside the dialog
        const f = [...panel.current.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')];
        if (!f.length) return;
        const a = f[0], z = f[f.length - 1];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; prev?.focus?.(); };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-ink/45 p-0 backdrop-blur-[2px] sm:items-center sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={panel} role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}
        className="anim-pop flex max-h-[92vh] w-full flex-col rounded-t-3xl bg-white shadow-[var(--shadow-pop)] sm:rounded-3xl">
        <header className="flex items-start justify-between gap-4 border-b border-line px-6 py-4">
          <div><h2 className="text-[18px] font-semibold tracking-tight">{title}</h2>{subtitle && <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>}</div>
          <IconButton label="Close" onClick={onClose}><X size={18} /></IconButton>
        </header>
        <div className="overflow-y-auto px-6 py-5">{children}</div>
        {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-line bg-cream/60 px-6 py-3.5 sm:rounded-b-3xl">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirm', danger, loading, error, onConfirm, onClose }: {
  title: string; message: ReactNode; confirmLabel?: string; danger?: boolean; loading?: boolean; error?: string; onConfirm: () => void; onClose: () => void;
}) {
  return (
    <Modal title={title} onClose={onClose} width={440}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button></>}>
      <div className="space-y-3 text-[14px] text-muted">{message}<InlineError>{error}</InlineError></div>
    </Modal>
  );
}
