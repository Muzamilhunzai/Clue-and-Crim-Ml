import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown, Lock } from 'lucide-react';
import { cx } from '@/lib/format';

const BASE = 'w-full rounded-xl border bg-white px-3.5 text-[14px] outline-none transition placeholder:text-faint focus:border-ink focus:ring-2 focus:ring-ink/10 disabled:bg-mist disabled:text-muted';

interface FieldProps { label: string; error?: string; hint?: ReactNode; required?: boolean; locked?: boolean; children: (id: string, invalid: boolean) => ReactNode; className?: string }
export function Field({ label, error, hint, required, locked, children, className }: FieldProps) {
  const id = useId();
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="flex items-center gap-1.5 text-[13px] font-medium">
        {label}{required && <span aria-hidden className="text-danger">*</span>}
        {locked && <span className="inline-flex items-center gap-1 rounded-full bg-mist px-1.5 py-0.5 text-[11px] font-normal text-muted"><Lock size={10} />Restricted</span>}
      </label>
      {children(id, !!error)}
      {error ? <p role="alert" className="text-[12.5px] text-danger">{error}</p> : hint ? <p className="text-[12.5px] text-muted">{hint}</p> : null}
    </div>
  );
}

type TextProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode; locked?: boolean };
export const TextField = forwardRef<HTMLInputElement, TextProps>(function TextField({ label, error, hint, className, locked, required, ...rest }, ref) {
  return (
    <Field label={label} error={error} hint={hint} required={required} locked={locked} className={className}>
      {(id, invalid) => <input id={id} ref={ref} required={false} aria-invalid={invalid} aria-required={required} className={cx(BASE, 'h-10', invalid ? 'border-danger' : 'border-line-strong')} {...rest} />}
    </Field>
  );
});

type AreaProps = TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; error?: string; hint?: ReactNode };
export function TextArea({ label, error, hint, className, required, ...rest }: AreaProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id, invalid) => <textarea id={id} rows={3} aria-invalid={invalid} className={cx(BASE, 'resize-y py-2.5', invalid ? 'border-danger' : 'border-line-strong')} {...rest} />}
    </Field>
  );
}

type SelProps = SelectHTMLAttributes<HTMLSelectElement> & { label: string; error?: string; hint?: ReactNode; options: { value: string | number; label: string }[]; placeholder?: string };
export function SelectField({ label, error, hint, options, placeholder, className, required, ...rest }: SelProps) {
  return (
    <Field label={label} error={error} hint={hint} required={required} className={className}>
      {(id, invalid) => (
        <div className="relative">
          <select id={id} aria-invalid={invalid} className={cx(BASE, 'h-10 appearance-none pr-9', invalid ? 'border-danger' : 'border-line-strong')} {...rest}>
            {placeholder !== undefined && <option value="">{placeholder}</option>}
            {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <ChevronDown size={16} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
        </div>
      )}
    </Field>
  );
}

export function Checkbox({ label, hint, checked, onChange, disabled }: { label: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-3 text-[14px]">
      <input id={id} type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 h-4 w-4 accent-[#1f1f1f]" />
      <span><span className="font-medium">{label}</span>{hint && <span className="block text-[12.5px] text-muted">{hint}</span>}</span>
    </label>
  );
}

/** Compact select used in the top band / filter rows (no label, smaller). */
export function MiniSelect({ value, onChange, options, label, className }: { value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; label: string; className?: string }) {
  return (
    <div className={cx('relative', className)}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
        className={cx('h-9 w-full appearance-none rounded-full border bg-white pl-3.5 pr-8 text-[13.5px] font-medium outline-none transition focus:border-ink', value ? 'border-ink' : 'border-line-strong')}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted" />
    </div>
  );
}
