import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Archive, Plus, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDate, timeAgo } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { labelOf, useMeta } from '@/hooks/useData';
import { useListParams } from '@/hooks/useListParams';
import type { CaseRow, Page } from '@/types';
import { TopBand } from '@/components/TopBand';
import { DataTable } from '@/components/DataTable';
import { CaseFormDialog } from '@/components/cases/CaseForm';
import { AvatarStack, Badge, Button, EmptyState, ErrorState, PageHeader, Pagination, priorityTone, statusTone } from '@/components/ui/primitives';
import { MiniSelect } from '@/components/ui/forms';

export default function CasesList() {
  const nav = useNavigate();
  const { can } = useAuth();
  const meta = useMeta().data;
  const lp = useListParams({ sort: 'updated', order: 'desc' });
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState(lp.get('q'));
  useEffect(() => { const t = setTimeout(() => { if (text !== lp.get('q')) lp.set({ q: text }); }, 250); return () => clearTimeout(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [text]);

  const query = { page: lp.page, pageSize: 12, q: lp.get('q'), sort: lp.sort, order: lp.order, status: lp.get('status'), priority: lp.get('priority'), crime_type: lp.get('crime_type'), assignee: lp.get('assignee'), archived: lp.get('archived') };
  const list = useQuery({ queryKey: ['cases', 'list', query], queryFn: () => api.get<Page<CaseRow>>('/cases', query), placeholderData: (p) => p });
  const opt = (arr: { value: string; label: string }[] | undefined, any: string) => [{ value: '', label: any }, ...(arr ?? [])];
  const keys = ['q', 'status', 'priority', 'crime_type', 'assignee', 'archived'];
  const hasFilters = keys.some((k) => lp.get(k));

  return (
    <div className="pb-14">
      <TopBand>{can('case:create') && <Button onClick={() => setAdding(true)} icon={<Plus size={17} />} className="h-9 rounded-full pl-3.5 pr-4">Add</Button>}</TopBand>
      <PageHeader title="Cases" subtitle="Search, filter and sort every case. Archived cases are hidden unless you ask for them." />
      <div className="px-5 sm:px-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex h-9 min-w-[240px] flex-1 items-center gap-2 rounded-full border border-line-strong bg-white px-3.5 focus-within:border-ink sm:max-w-sm">
            <Search size={15} className="text-muted" />
            <input aria-label="Filter cases" value={text} onChange={(e) => setText(e.target.value)} placeholder="Search title, number, description, place" className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint" />
            {text && <button aria-label="Clear" onClick={() => setText('')} className="text-muted hover:text-ink"><X size={14} /></button>}
          </div>
          <MiniSelect label="Status" value={lp.get('status')} onChange={(v) => lp.set({ status: v })} options={opt(meta?.caseStatuses, 'Status')} />
          <MiniSelect label="Priority" value={lp.get('priority')} onChange={(v) => lp.set({ priority: v })} options={opt(meta?.casePriorities, 'Priority')} />
          <MiniSelect label="Crime type" value={lp.get('crime_type')} onChange={(v) => lp.set({ crime_type: v })} options={opt(meta?.crimeTypes, 'Crime type')} />
          <MiniSelect label="Assigned to" value={lp.get('assignee')} onChange={(v) => lp.set({ assignee: v })} options={[{ value: '', label: 'Anyone' }, { value: 'me', label: 'Assigned to me' }]} />
          <MiniSelect label="Archived cases" value={lp.get('archived')} onChange={(v) => lp.set({ archived: v })} options={[{ value: '', label: 'Hide archived' }, { value: 'include', label: 'Include archived' }, { value: 'only', label: 'Archived only' }]} />
          {hasFilters && <button className="text-[13px] font-medium underline" onClick={() => { setText(''); lp.clear(keys); }}>Clear</button>}
        </div>

        {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : (
          <>
            <DataTable<CaseRow> rows={list.data?.items ?? []} rowKey={(r) => r.id} loading={list.isPending} sort={lp.sort} order={lp.order} onSort={lp.toggleSort} onRowClick={(r) => nav(`/cases/${r.id}`)}
              columns={[
                { key: 'no', header: 'Case', sort: 'number', cell: (r) => (
                  <div className="max-w-[360px]"><p className="flex items-center gap-1.5 text-[12px] text-muted tabular">{r.case_number}{r.is_archived ? <span className="inline-flex items-center gap-1 rounded-full bg-mist px-1.5 text-[11px]"><Archive size={10} />Archived</span> : null}</p><p className="truncate font-medium">{r.title}</p></div>) },
                { key: 'status', header: 'Status', sort: 'status', cell: (r) => <Badge tone={statusTone(r.status)}>{labelOf(meta?.caseStatuses, r.status)}</Badge> },
                { key: 'prio', header: 'Priority', sort: 'priority', firstOrder: 'desc', cell: (r) => <Badge tone={priorityTone(r.priority)}>{labelOf(meta?.casePriorities, r.priority)}</Badge> },
                { key: 'crime', header: 'Crime', cell: (r) => <span className="whitespace-nowrap">{labelOf(meta?.crimeTypes, r.crime_type)}</span> },
                { key: 'inc', header: 'Incident', sort: 'incident', firstOrder: 'desc', cell: (r) => <span className="whitespace-nowrap">{fmtDate(r.incident_date)}</span> },
                { key: 'team', header: 'Team', cell: (r) => <AvatarStack names={r.investigators.map((i) => i.full_name)} /> },
                { key: 'ev', header: 'Records', cell: (r) => <span className="tabular whitespace-nowrap text-muted" title="people · evidence · clues">{r.suspect_count + r.victim_count + r.witness_count} · {r.evidence_count} · {r.clue_count}</span> },
                { key: 'upd', header: 'Updated', sort: 'updated', firstOrder: 'desc', cell: (r) => <span className="whitespace-nowrap text-muted">{timeAgo(r.updated_at)}</span> },
              ]}
              empty={<EmptyState title={hasFilters ? 'No cases match' : 'No cases yet'} hint={hasFilters ? 'Try a different search or clear the filters.' : 'Use Add to open the first case.'} />} />
            {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => lp.set({ page: p }, false)} />}
          </>
        )}
      </div>
      {adding && <CaseFormDialog onClose={() => setAdding(false)} onSaved={(id) => nav(`/cases/${id}`)} />}
    </div>
  );
}
