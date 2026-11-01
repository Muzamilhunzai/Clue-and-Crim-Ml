import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { TYPE_META, TYPE_ORDER, TypeIcon } from '@/lib/entities';
import { cx } from '@/lib/format';
import type { EntityType, LookupItem } from '@/types';
import { Spinner, useOutsideClose } from './ui/primitives';

/** Pick any record by type + search text (cases, people, evidence, clues, locations). Used by the graph tools. */
export function RecordPicker({ label, value, onChange, types = TYPE_ORDER, error, disabled }: {
  label: string; value: LookupItem | null; onChange: (v: LookupItem | null) => void; types?: EntityType[]; error?: string; disabled?: boolean;
}) {
  const [type, setType] = useState<EntityType>(value?.type ?? types[0]);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const box = useOutsideClose(open, () => setOpen(false));
  useEffect(() => { const t = window.setTimeout(() => setQ(text.trim()), 160); return () => window.clearTimeout(t); }, [text]);
  const res = useQuery({
    queryKey: ['lookup', type, q], enabled: open,
    queryFn: () => api.get<{ items: LookupItem[] }>('/relationships/lookup', { type, q }), staleTime: 15_000, placeholderData: (p) => p,
  });

  return (
    <div className="flex flex-col gap-1.5" ref={box}>
      <span className="text-[13px] font-medium">{label}</span>
      {value ? (
        <div className={cx('flex h-10 items-center gap-2.5 rounded-xl border bg-white px-3', error ? 'border-danger' : 'border-line-strong')}>
          <TypeIcon type={value.type} size={16} className="shrink-0" />
          <span className="min-w-0 flex-1 truncate text-[14px]"><span className="font-medium">{value.label}</span> <span className="text-muted">· {TYPE_META[value.type].label} {value.code}</span></span>
          {!disabled && <button type="button" aria-label={`Clear ${label}`} onClick={() => onChange(null)} className="text-muted hover:text-ink"><X size={16} /></button>}
        </div>
      ) : (
        <div className="relative">
          <div className={cx('flex h-10 items-center overflow-hidden rounded-xl border bg-white focus-within:border-ink', error ? 'border-danger' : 'border-line-strong')}>
            <select aria-label={`${label}: record type`} value={type} onChange={(e) => setType(e.target.value as EntityType)} className="h-full border-r border-line bg-mist px-2.5 text-[13px] font-medium outline-none">
              {types.map((t) => <option key={t} value={t}>{TYPE_META[t].label}</option>)}
            </select>
            <Search size={15} className="ml-3 shrink-0 text-muted" />
            <input aria-label={`${label}: search`} value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} placeholder={`Search ${TYPE_META[type].plural.toLowerCase()}…`} className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[14px] outline-none placeholder:text-faint" />
            {res.isFetching && open && <Spinner className="mr-3 h-4 w-4" />}
          </div>
          {open && (
            <ul role="listbox" className="anim-pop absolute inset-x-0 top-[calc(100%+6px)] z-50 max-h-60 overflow-y-auto rounded-xl border border-line bg-white p-1 shadow-[var(--shadow-pop)]">
              {(res.data?.items ?? []).map((it) => (
                <li key={`${it.type}:${it.id}`}>
                  <button type="button" role="option" aria-selected={false} onClick={() => { onChange(it); setOpen(false); setText(''); }} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[13.5px] hover:bg-mist">
                    <TypeIcon type={it.type} size={15} className="shrink-0" />
                    <span className="min-w-0 flex-1 truncate"><span className="font-medium">{it.label}</span> <span className="text-muted">{it.code}{it.subtitle ? ` · ${it.subtitle}` : ''}</span></span>
                  </button>
                </li>
              ))}
              {res.data && !res.data.items.length && <li className="px-3 py-3 text-center text-[13px] text-muted">No {TYPE_META[type].plural.toLowerCase()} found.</li>}
            </ul>
          )}
        </div>
      )}
      {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
    </div>
  );
}
