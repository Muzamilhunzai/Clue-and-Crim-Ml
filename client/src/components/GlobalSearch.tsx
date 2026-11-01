import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { TYPE_META, TypeIcon, recordPath } from '@/lib/entities';
import { cx, splitHighlight } from '@/lib/format';
import type { SearchHit } from '@/types';
import { useOutsideClose, Spinner } from './ui/primitives';

function Highlighted({ text }: { text: string }) {
  return <>{splitHighlight(text).map((p, i) => (p.hit ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}</>;
}

/** Global search over the SQLite FTS5 index. Searches every record type at once. */
export function GlobalSearch({ className }: { className?: string }) {
  const nav = useNavigate();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const box = useOutsideClose(open, () => setOpen(false));

  useEffect(() => { const t = window.setTimeout(() => setQ(text.trim()), 180); return () => window.clearTimeout(t); }, [text]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement).tagName)) { e.preventDefault(); input.current?.focus(); setOpen(true); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const res = useQuery({
    queryKey: ['search', q], enabled: q.length > 0,
    queryFn: ({ signal }) => api.get<{ results: SearchHit[] }>('/search', { q }, signal),
    staleTime: 15_000, placeholderData: (p) => p,
  });
  const hits = useMemo(() => (q ? res.data?.results ?? [] : []), [q, res.data]);
  useEffect(() => setActive(0), [hits]);

  const go = (h: SearchHit) => { setOpen(false); setText(''); nav(recordPath(h.type, h.id)); };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, hits.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
    else if (e.key === 'Enter' && hits[active]) { e.preventDefault(); go(hits[active]); }
    else if (e.key === 'Escape') { setOpen(false); input.current?.blur(); }
  };

  return (
    <div ref={box} className={cx('relative', className)}>
      <div className="flex h-11 items-center gap-2.5 rounded-full border border-line-strong bg-white px-4 transition focus-within:border-ink">
        <Search size={17} className="shrink-0 text-muted" />
        <input ref={input} value={text} onChange={(e) => { setText(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} onKeyDown={onKey}
          role="combobox" aria-expanded={open && !!q} aria-controls="global-search-list" aria-label="Search cases, people, evidence, clues and locations"
          placeholder="Search cases, people, evidence, clues…" className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-faint" />
        {res.isFetching && q ? <Spinner className="h-4 w-4" /> : text ? (
          <button aria-label="Clear search" onClick={() => { setText(''); input.current?.focus(); }} className="text-muted hover:text-ink"><X size={16} /></button>
        ) : <kbd className="hidden rounded-md border border-line-strong px-1.5 text-[11px] text-muted sm:block">/</kbd>}
      </div>
      {open && q && (
        <div id="global-search-list" role="listbox" className="anim-pop absolute left-0 right-0 top-[calc(100%+8px)] z-40 max-h-[70vh] overflow-y-auto rounded-2xl border border-line bg-white p-1.5 shadow-[var(--shadow-pop)]">
          {hits.length === 0 && !res.isFetching && <p className="px-4 py-6 text-center text-[13.5px] text-muted">No records match “{q}”.</p>}
          {hits.map((h, i) => (
            <button key={`${h.type}:${h.id}`} role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => go(h)}
              className={cx('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left', i === active && 'bg-mist')}>
              <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ background: `${TYPE_META[h.type].color}18`, color: TYPE_META[h.type].color }}>
                <TypeIcon type={h.type} size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className="truncate text-[14px] font-medium"><Highlighted text={h.title_highlight || h.label} /></span>
                  <span className="shrink-0 text-[11.5px] text-muted">{TYPE_META[h.type].label} · {h.code}</span>
                </span>
                <span className="block truncate text-[12.5px] text-muted">{h.snippet ? <Highlighted text={h.snippet} /> : h.subtitle}</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
