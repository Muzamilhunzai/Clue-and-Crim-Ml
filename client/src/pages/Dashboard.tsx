import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Network, Plus, ShieldAlert, ShieldCheck, SlidersHorizontal, UserRound } from 'lucide-react';
import { api } from '@/lib/api';
import { cx, timeAgo } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useData';
import { TYPE_META, TypeIcon, graphPath, recordPath } from '@/lib/entities';
import type { Board as BoardData, Dashboard as DashboardData } from '@/types';
import { TopBand } from '@/components/TopBand';
import { StatsBand } from '@/components/dashboard/StatsBand';
import { Board } from '@/components/dashboard/Board';
import { CaseFormDialog } from '@/components/cases/CaseForm';
import { Button, Card, ErrorState, Pill, SectionTitle, useOutsideClose } from '@/components/ui/primitives';
import { MiniSelect, SelectField } from '@/components/ui/forms';

const SORT_OPTIONS = [
  { value: 'updated', label: 'Sort by: Recently updated' },
  { value: 'priority', label: 'Sort by: Priority' },
  { value: 'incident', label: 'Sort by: Incident date' },
  { value: 'number', label: 'Sort by: Case number' },
  { value: 'title', label: 'Sort by: Title' },
];

function FiltersPopover({ priority, crime, setPriority, setCrime }: { priority: string; crime: string; setPriority: (v: string) => void; setCrime: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  const meta = useMeta().data;
  const count = (priority ? 1 : 0) + (crime ? 1 : 0);
  return (
    <div ref={ref} className="relative">
      <Pill active={count > 0} onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" icon={<SlidersHorizontal size={15} />}>
        Filters{count > 0 && <span className="ml-0.5 rounded-full bg-white px-1.5 text-[11px] font-semibold text-ink">{count}</span>}
      </Pill>
      {open && (
        <div role="dialog" aria-label="Filter cases" className="anim-pop absolute right-0 z-30 mt-2 w-72 space-y-3 rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-pop)]">
          <SelectField label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)} options={meta?.casePriorities ?? []} placeholder="Any priority" />
          <SelectField label="Crime type" value={crime} onChange={(e) => setCrime(e.target.value)} options={meta?.crimeTypes ?? []} placeholder="Any crime type" />
          {count > 0 && <button className="text-[13px] font-medium underline" onClick={() => { setPriority(''); setCrime(''); }}>Clear filters</button>}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user, can } = useAuth();
  const nav = useNavigate();
  const [sort, setSort] = useState('updated');
  const [mine, setMine] = useState(false);
  const [priority, setPriority] = useState('');
  const [crime, setCrime] = useState('');
  const [adding, setAdding] = useState(false);
  const tz = -new Date().getTimezoneOffset();

  const dash = useQuery({ queryKey: ['dashboard', tz], queryFn: () => api.get<DashboardData>('/dashboard', { tz }) });
  const params = { sort, order: sort === 'title' || sort === 'number' ? 'asc' : 'desc', priority, crime_type: crime, assignee: mine ? 'me' : '' };
  const board = useQuery({ queryKey: ['board', params], queryFn: () => api.get<BoardData>('/cases/board', params), placeholderData: (p) => p });
  const d = dash.data;
  const first = user?.full_name.split(' ')[0] ?? '';

  return (
    <div className="pb-16">
      <TopBand>
        <MiniSelect label="Sort board by" value={sort} onChange={setSort} options={SORT_OPTIONS} className="min-w-[200px]" />
        <FiltersPopover priority={priority} crime={crime} setPriority={setPriority} setCrime={setCrime} />
        <Pill active={mine} onClick={() => setMine((m) => !m)} icon={<UserRound size={15} />}>Me</Pill>
        {can('case:create') && <Button onClick={() => setAdding(true)} icon={<Plus size={17} />} className="h-9 rounded-full pl-3.5 pr-4">Add</Button>}
      </TopBand>

      <div className="px-5 pb-5 pt-6 sm:px-8">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight sm:text-[32px]">Good to see you, {first}</h1>
        <p className="mt-1 text-[14.5px] text-muted">
          {d ? <><span className="font-medium text-ink tabular">{d.totals.active}</span> active cases{d.totals.critical > 0 && <> · <span className="font-medium text-danger tabular">{d.totals.critical} critical</span></>} · <span className="tabular">{d.mine}</span> assigned to you</> : 'Loading your caseload…'}
        </p>
      </div>

      {dash.isError ? <ErrorState error={dash.error} onRetry={() => void dash.refetch()} /> : <StatsBand data={d} />}

      <div className="mt-8 px-5 sm:px-8">
        {board.isError ? <ErrorState error={board.error} onRetry={() => void board.refetch()} /> : (
          <Board data={board.data} loading={board.isPending} hasFilters={!!(priority || crime || mine)} onClearFilters={() => { setPriority(''); setCrime(''); setMine(false); }} />
        )}
      </div>

      {d && (
        <div className="mt-10 grid gap-4 px-5 sm:px-8 lg:grid-cols-[1.1fr_1fr]">
          <Card>
            <SectionTitle aside={<Link to="/graph" className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline">Open graph <ArrowRight size={14} /></Link>}>Connected across cases</SectionTitle>
            <p className="-mt-2 mb-3 text-[13px] text-muted">Records linked to two or more cases. A recorded association, not a finding of fact.</p>
            {d.hubs.length === 0 && <p className="py-6 text-center text-[13.5px] text-muted">No record is linked to more than one case yet.</p>}
            <ul className="divide-y divide-line">
              {d.hubs.map((h) => (
                <li key={`${h.type}:${h.id}`} className="flex items-center gap-3 py-2.5">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ background: `${TYPE_META[h.type].color}1c`, color: TYPE_META[h.type].color }}><TypeIcon type={h.type} size={17} /></span>
                  <div className="min-w-0 flex-1">
                    <Link to={recordPath(h.type, h.id)} className="block truncate text-[14px] font-medium hover:underline">{h.label}</Link>
                    <p className="truncate text-[12.5px] text-muted">{TYPE_META[h.type].label} · {h.code}</p>
                  </div>
                  <span className="rounded-full bg-ink px-2.5 py-0.5 text-[12px] font-medium text-white tabular">{h.case_count} cases</span>
                  <button onClick={() => nav(graphPath(h.type, h.id))} aria-label={`Show ${h.label} in the graph`} title="Show in graph" className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-mist hover:text-ink"><Network size={16} /></button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <SectionTitle aside={<Link to="/activity" className="inline-flex items-center gap-1 text-[13px] font-medium hover:underline">All activity <ArrowRight size={14} /></Link>}>Recent activity</SectionTitle>
            <ul className="space-y-3">
              {d.recentActivity.map((a) => (
                <li key={a.id} className="flex gap-3">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-ink" />
                  <div className="min-w-0"><p className="text-[13.5px] leading-snug">{a.summary}</p><p className="text-[12px] text-muted">{a.user_name ?? 'System'} · {timeAgo(a.created_at)}</p></div>
                </li>
              ))}
            </ul>
            <div className={cx('mt-4 flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px]', d.integrity.custody_problems ? 'bg-danger-soft text-danger' : 'bg-ok-soft text-ok')}>
              {d.integrity.custody_problems ? <ShieldAlert size={15} /> : <ShieldCheck size={15} />}
              {d.integrity.custody_problems
                ? `${d.integrity.custody_problems} custody chain problem(s) detected - review in the ADBMS lab.`
                : 'Every custody chain is consistent. (Recorded, append-only entries; not tamper-proof storage.)'}
            </div>
          </Card>
        </div>
      )}
      {adding && <CaseFormDialog onClose={() => setAdding(false)} onSaved={(id) => nav(`/cases/${id}`)} />}
    </div>
  );
}
