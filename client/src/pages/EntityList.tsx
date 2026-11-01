import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus, Search, X } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { useLookups, useMeta } from '@/hooks/useData';
import { useListParams } from '@/hooks/useListParams';
import type { EntityRecord, Page } from '@/types';
import { ENTITY_CONFIG, type PlainType } from '@/lib/entityConfig';
import { TopBand } from '@/components/TopBand';
import { DataTable } from '@/components/DataTable';
import { EntityFormDialog } from '@/components/EntityForm';
import { Button, EmptyState, ErrorState, PageHeader, Pagination } from '@/components/ui/primitives';
import { MiniSelect } from '@/components/ui/forms';

const PAGE_SIZE = 15;

export default function EntityList({ type }: { type: PlainType }) {
  const cfg = ENTITY_CONFIG[type];
  const nav = useNavigate();
  const { can } = useAuth();
  const meta = useMeta().data;
  const lookups = useLookups().data;
  const lp = useListParams({ sort: cfg.defaultSort, order: cfg.defaultOrder });
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState(lp.get('q'));
  useEffect(() => { setText(lp.get('q')); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [type]);
  useEffect(() => { const t = setTimeout(() => { if (text !== lp.get('q')) lp.set({ q: text }); }, 250); return () => clearTimeout(t); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [text]);

  const query = { page: lp.page, pageSize: PAGE_SIZE, q: lp.get('q'), sort: lp.sort, order: lp.order, ...Object.fromEntries(cfg.filters.map((f) => [f.param, lp.get(f.param)])) };
  const list = useQuery({ queryKey: [cfg.apiPath, 'list', query], queryFn: () => api.get<Page<EntityRecord>>(`/${cfg.apiPath}`, query), placeholderData: (p) => p });

  const optionsFor = (source: string) => {
    if (source === 'cases') return [{ value: '', label: 'Any case' }, ...(lookups?.cases ?? []).map((c) => ({ value: String(c.id), label: c.case_number }))];
    if (source === 'yesno') return [{ value: '', label: 'Any' }, { value: '1', label: 'Protected' }, { value: '0', label: 'Not protected' }];
    return [{ value: '', label: 'Any' }, ...((meta?.[source as keyof typeof meta] as { value: string; label: string }[] | undefined) ?? [])];
  };
  const hasFilters = !!lp.get('q') || cfg.filters.some((f) => lp.get(f.param));
  const writeOk = type === 'evidence' ? can('evidence:create') : type === 'clue' ? can('clue:write') : type === 'location' ? can('location:write') : can('people:write');

  return (
    <div className="pb-14">
      <TopBand>{writeOk && <Button onClick={() => setAdding(true)} icon={<Plus size={17} />} className="h-9 rounded-full pl-3.5 pr-4">Add</Button>}</TopBand>
      <PageHeader title={cfg.title} subtitle={cfg.blurb} />
      <div className="px-5 sm:px-8">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="flex h-9 min-w-[240px] flex-1 items-center gap-2 rounded-full border border-line-strong bg-white px-3.5 focus-within:border-ink sm:max-w-sm">
            <Search size={15} className="text-muted" />
            <input aria-label={`Filter ${cfg.plural.toLowerCase()}`} value={text} onChange={(e) => setText(e.target.value)} placeholder={cfg.searchHint} className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-faint" />
            {text && <button aria-label="Clear" onClick={() => setText('')} className="text-muted hover:text-ink"><X size={14} /></button>}
          </div>
          {cfg.filters.map((f) => <MiniSelect key={f.param} label={f.label} value={lp.get(f.param)} onChange={(v) => lp.set({ [f.param]: v })} options={optionsFor(f.source).map((o) => (o.value === '' ? { ...o, label: f.label } : o))} />)}
          {hasFilters && <button className="text-[13px] font-medium underline" onClick={() => { setText(''); lp.clear(['q', ...cfg.filters.map((f) => f.param)]); }}>Clear</button>}
        </div>

        {list.isError ? <ErrorState error={list.error} onRetry={() => void list.refetch()} /> : (
          <>
            <DataTable columns={cfg.columns.map((c) => ({ key: c.key, header: c.header, sort: c.sort, firstOrder: c.firstOrder, cell: (r: EntityRecord) => c.cell(r, meta) }))}
              rows={list.data?.items ?? []} rowKey={(r) => r.id} loading={list.isPending} sort={lp.sort} order={lp.order} onSort={lp.toggleSort}
              onRowClick={(r) => nav(`/${cfg.apiPath}/${r.id}`)}
              empty={<EmptyState title={hasFilters ? `No ${cfg.plural.toLowerCase()} match` : `No ${cfg.plural.toLowerCase()} yet`} hint={hasFilters ? 'Try a different search or clear the filters.' : writeOk ? 'Use Add to create the first one.' : undefined} />} />
            {list.data && <Pagination page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={(p) => lp.set({ page: p }, false)} />}
          </>
        )}
      </div>
      {adding && <EntityFormDialog cfg={cfg} onClose={() => setAdding(false)} onSaved={(id) => nav(`/${cfg.apiPath}/${id}`)} />}
    </div>
  );
}
