import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useListParams } from '@/hooks/useListParams';
import type { ActivityRow, Page } from '@/types';
import { TopBand } from '@/components/TopBand';
import { Avatar, Card, EmptyState, ErrorState, PageHeader, Pagination, Skeleton } from '@/components/ui/primitives';
import { MiniSelect } from '@/components/ui/forms';

const TYPES = [
  { value: '', label: 'All activity' }, { value: 'case', label: 'Cases' }, { value: 'suspect', label: 'Suspects' }, { value: 'victim', label: 'Victims' }, { value: 'witness', label: 'Witnesses' },
  { value: 'evidence', label: 'Evidence & custody' }, { value: 'clue', label: 'Clues' }, { value: 'relationship', label: 'Relationships' }, { value: 'user', label: 'Users & access' }, { value: 'session', label: 'Sign-ins' },
];

export default function Activity() {
  const lp = useListParams();
  const [text, setText] = useState(lp.get('q'));
  useEffect(() => { const t = setTimeout(() => { if (text !== lp.get('q')) lp.set({ q: text }); }, 250); return () => clearTimeout(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [text]);
  const query = { page: lp.page, pageSize: 25, q: lp.get('q'), entity_type: lp.get('entity_type') };
  const q = useQuery({ queryKey: ['activity', query], queryFn: () => api.get<Page<ActivityRow>>('/activity', query), placeholderData: (p) => p });
  return (
    <div className="pb-14">
      <TopBand />
      <PageHeader title="Activity log" subtitle="An append-only audit trail of who changed what. The database refuses edits and deletions of these rows." />
      <div className="px-5 sm:px-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex h-9 min-w-[240px] flex-1 items-center gap-2 rounded-full border border-line-strong bg-white px-3.5 focus-within:border-ink sm:max-w-sm">
            <Search size={15} className="text-muted" />
            <input aria-label="Search activity" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search the log" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint" />
            {text && <button aria-label="Clear" onClick={() => setText('')} className="text-muted hover:text-ink"><X size={14} /></button>}
          </div>
          <MiniSelect label="Type" value={lp.get('entity_type')} onChange={(v) => lp.set({ entity_type: v })} options={TYPES} />
        </div>
        {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
          <Card pad={false}>
            {q.isPending ? <div className="space-y-3 p-5">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>
              : q.data!.items.length === 0 ? <EmptyState title="Nothing matches" hint="Try another search or type." />
              : (
                <ul className="divide-y divide-line">
                  {q.data!.items.map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-5 py-3.5">
                      <Avatar name={a.user_name ?? 'System'} size={32} />
                      <div className="min-w-0 flex-1">
                        <p className="text-[14px]">{a.summary}</p>
                        <p className="mt-0.5 text-[12.5px] text-muted">{a.user_name ?? 'System'} · {fmtDateTime(a.created_at)}{a.case_id ? <> · <Link className="underline" to={`/cases/${a.case_id}`}>{a.case_number ?? 'case'}</Link></> : null}</p>
                      </div>
                      <span className="shrink-0 rounded-full bg-mist px-2.5 py-0.5 text-[11.5px] font-medium text-muted">{a.action}</span>
                    </li>
                  ))}
                </ul>
              )}
          </Card>
        )}
        {q.data && <Pagination page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => lp.set({ page: p }, false)} />}
      </div>
    </div>
  );
}
