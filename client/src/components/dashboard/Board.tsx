import { useMemo, useState, type DragEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowUpDown, CalendarDays, ChevronDown, ExternalLink, Lightbulb, MapPin, Network, Paperclip, Users, Archive, MoveRight } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cx, fmtChip, humanize } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { labelOf, useMeta } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import type { Board as BoardData, CaseRow, CaseStatus } from '@/types';
import { Avatar, AvatarStack, Badge, Button, EmptyState, InlineError, Menu, Modal, priorityTone, Skeleton, type MenuItem } from '@/components/ui/primitives';
import { SelectField } from '@/components/ui/forms';

const SORTS = [
  { id: 'updated', label: 'Updated' },
  { id: 'priority', label: 'Priority' },
  { id: 'incident', label: 'Incident date' },
] as const;
type ColSort = (typeof SORTS)[number]['id'];
const PRIORITY_RANK: Record<string, number> = { critical: 3, high: 2, medium: 1, low: 0 };

function sortItems(items: CaseRow[], by: ColSort) {
  const list = [...items];
  if (by === 'priority') list.sort((a, b) => PRIORITY_RANK[b.priority] - PRIORITY_RANK[a.priority] || b.updated_at.localeCompare(a.updated_at));
  else if (by === 'incident') list.sort((a, b) => b.incident_date.localeCompare(a.incident_date));
  else list.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
  return list;
}

/** Asked when a card is dropped on "Closed": a case cannot be closed without an outcome. */
export function ResolutionDialog({ target, onClose, onConfirm, busy, error }: { target: CaseRow; onClose: () => void; onConfirm: (resolution: string) => void; busy: boolean; error: string }) {
  const meta = useMeta().data;
  const [resolution, setResolution] = useState('solved');
  return (
    <Modal title={`Close ${target.case_number}`} subtitle="Choose how this case ended. You can reopen it later." onClose={onClose} width={440}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={() => onConfirm(resolution)}>Close case</Button></>}>
      <div className="space-y-3">
        <SelectField label="Resolution" value={resolution} onChange={(e) => setResolution(e.target.value)} options={meta?.caseResolutions ?? []} />
        <InlineError>{error}</InlineError>
      </div>
    </Modal>
  );
}

function CaseCard({ c, closed, canMove, onMove, dragging, setDragging }: {
  c: CaseRow; closed: boolean; canMove: boolean; onMove: (c: CaseRow, status: CaseStatus) => void; dragging: number | null; setDragging: (id: number | null) => void;
}) {
  const nav = useNavigate();
  const meta = useMeta().data;
  const { can } = useAuth();
  const [pinned, setPinned] = useState(false);
  const lead = c.investigators.find((i) => i.assignment_role === 'lead') ?? c.investigators[0];

  const items: MenuItem[] = [
    { label: 'Open case', icon: <ExternalLink size={15} />, onClick: () => nav(`/cases/${c.id}`) },
    { label: 'View in relationship graph', icon: <Network size={15} />, onClick: () => nav(`/graph?focus=case:${c.id}`) },
    ...(canMove ? (meta?.caseStatuses ?? []).filter((s) => s.value !== c.status).map((s) => ({
      label: `Move to ${s.label}`, icon: <MoveRight size={15} />, onClick: () => onMove(c, s.value as CaseStatus),
    })) : []),
    ...(c.status === 'closed' && can('case:archive') ? [{ label: 'Open to archive…', icon: <Archive size={15} />, onClick: () => nav(`/cases/${c.id}`) }] : []),
  ];

  const onDragStart = (e: DragEvent) => {
    e.dataTransfer.setData('text/plain', String(c.id));
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setDragImage(e.currentTarget as Element, 24, 24);  // drag the whole card, not just the title link
    setDragging(c.id);
  };

  return (
    <article draggable={canMove} onDragStart={onDragStart} onDragEnd={() => setDragging(null)}
      className={cx('group relative overflow-visible rounded-[14px] border p-4 transition duration-200',
        closed ? 'border-line bg-mist text-muted hover:border-line-strong' : 'border-line-strong bg-white hover:border-ink hover:bg-ink hover:text-cream focus-within:border-ink focus-within:bg-ink focus-within:text-cream',
        pinned && !closed && 'border-ink bg-ink text-cream', dragging === c.id && 'opacity-40', canMove && 'cursor-grab active:cursor-grabbing')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className={cx('text-[11.5px] font-medium tabular opacity-60')}>{c.case_number}</p>
          <h3 className="mt-0.5 text-[15.5px] font-semibold leading-snug tracking-tight">
            <Link to={`/cases/${c.id}`} className="outline-none after:absolute after:inset-0 after:rounded-[14px] focus-visible:after:ring-2 focus-visible:after:ring-ink">{c.title}</Link>
          </h3>
        </div>
        <div className="relative z-10 -mr-1.5 -mt-1"><Menu items={items} label={`Actions for ${c.case_number}`} /></div>
      </div>

      <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug opacity-70">{c.description || 'No description recorded.'}</p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className={cx('inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium', closed ? 'border-line-strong' : 'border-current/25 group-hover:border-cream/30')}>
          <CalendarDays size={12} />{fmtChip(c.incident_date)}
        </span>
        {!closed && <span className="group-hover:hidden group-focus-within:hidden"><Badge tone={priorityTone(c.priority)} className="!h-6">{humanize(c.priority)}</Badge></span>}
        {!closed && <span className="hidden h-6 items-center rounded-full bg-cream/15 px-2.5 text-[12px] font-medium group-hover:inline-flex group-focus-within:inline-flex">{humanize(c.priority)} priority</span>}
        {closed && <span className="text-[12px]">{labelOf(meta?.caseResolutions, c.resolution)}</span>}
      </div>

      <div className="mt-3.5 flex items-center justify-between text-[12.5px]">
        <div className="flex items-center gap-3.5 opacity-80">
          <span className="inline-flex items-center gap-1" title={`${c.clue_count} clues`}><Lightbulb size={14} /><span className="tabular">{c.clue_count}</span></span>
          <span className="inline-flex items-center gap-1" title={`${c.evidence_count} evidence items`}><Paperclip size={14} /><span className="tabular">{c.evidence_count}</span></span>
          <span className="inline-flex items-center gap-1" title={`${c.suspect_count + c.victim_count + c.witness_count} linked people`}><Users size={14} /><span className="tabular">{c.suspect_count + c.victim_count + c.witness_count}</span></span>
        </div>
        <AvatarStack names={c.investigators.map((i) => i.full_name)} max={3} size={24} />
      </div>

      {/* expanded details: shown on hover/focus (and pinned with the chevron on touch screens), like the reference's dark card */}
      <div className={cx('grid transition-all duration-200', closed ? 'grid-rows-[0fr]' : pinned ? 'grid-rows-[1fr]' : 'grid-rows-[0fr] group-hover:grid-rows-[1fr] group-focus-within:grid-rows-[1fr]')}>
        <div className="overflow-hidden">
          <dl className="mt-3 space-y-2 border-t border-cream/15 pt-3 text-[12.5px]">
            <div className="flex items-start gap-2"><MapPin size={14} className="mt-0.5 shrink-0 opacity-70" /><dd>{c.location_name ?? 'Location not recorded'}</dd></div>
            <div className="flex items-center gap-2"><dt className="opacity-60">Crime</dt><dd>{labelOf(meta?.crimeTypes, c.crime_type)}</dd></div>
            {lead && <div className="flex items-center gap-2"><Avatar name={lead.full_name} size={22} dark /><dd>{lead.full_name} <span className="opacity-60">· lead</span></dd></div>}
            <div className="flex gap-3 opacity-80"><span>{c.suspect_count} suspects</span><span>{c.victim_count} victims</span><span>{c.witness_count} witnesses</span></div>
          </dl>
        </div>
      </div>
      {!closed && (
        <button type="button" aria-label={pinned ? 'Collapse details' : 'Expand details'} aria-expanded={pinned} onClick={(e) => { e.stopPropagation(); setPinned((p) => !p); }}
          className="relative z-10 mt-1 flex w-full justify-center text-current opacity-40 transition hover:opacity-100 lg:hidden"><ChevronDown size={16} className={cx('transition', pinned && 'rotate-180')} /></button>
      )}
    </article>
  );
}

export function Board({ data, loading, hasFilters, onClearFilters }: { data?: BoardData; loading: boolean; hasFilters: boolean; onClearFilters: () => void }) {
  const meta = useMeta().data;
  const { user } = useAuth();
  const qc = useQueryClient();
  const toast = useToast();
  const [colSort, setColSort] = useState<Record<string, ColSort>>({});
  const [dragging, setDragging] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [closing, setClosing] = useState<CaseRow | null>(null);
  const [closeError, setCloseError] = useState('');

  const move = useMutation({
    mutationFn: (v: { c: CaseRow; status: CaseStatus; resolution?: string }) =>
      api.patch(`/cases/${v.c.id}/status`, { status: v.status, version: v.c.version, ...(v.resolution ? { resolution: v.resolution } : {}) }),
    onSuccess: (_r, v) => {
      void qc.invalidateQueries();
      toast.success(`${v.c.case_number} moved to ${labelOf(meta?.caseStatuses, v.status)}.`);
      setClosing(null);
    },
    onError: (e) => {
      const msg = e instanceof ApiError ? (e.code === 'VERSION_CONFLICT' ? 'Someone else just changed this case. The board has been refreshed: try again.' : e.message) : 'Could not move the case.';
      if (closing) setCloseError(msg); else toast.error(msg);
      void qc.invalidateQueries({ queryKey: ['board'] });
    },
  });

  const requestMove = (c: CaseRow, status: CaseStatus) => {
    if (status === c.status) return;
    if (status === 'closed') { setCloseError(''); setClosing(c); return; }
    move.mutate({ c, status });
  };
  const canMove = (c: CaseRow) => user?.role === 'chief_investigator' || (user?.role === 'investigator' && c.investigators.some((i) => i.id === user.id));

  const columns = useMemo(() => data?.columns ?? [], [data]);
  const allCases = useMemo(() => new Map(columns.flatMap((col) => col.items.map((c) => [c.id, c] as const))), [columns]);

  const onDrop = (e: DragEvent, status: CaseStatus) => {
    e.preventDefault(); setOver(null); setDragging(null);
    const c = allCases.get(Number(e.dataTransfer.getData('text/plain')));
    if (!c) return;
    if (!canMove(c)) { toast.error('You can only move cases you are assigned to.'); return; }
    requestMove(c, status);
  };

  if (loading) {
    return <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="space-y-3"><Skeleton className="h-10" /><Skeleton className="h-36" /><Skeleton className="h-36" /></div>)}</div>;
  }
  const total = columns.reduce((n, c) => n + c.total, 0);
  if (!total) {
    return <EmptyState title={hasFilters ? 'No cases match these filters' : 'No cases yet'} hint={hasFilters ? 'Try removing a filter.' : 'Use Add to open the first case.'}
      action={hasFilters ? <Button variant="secondary" size="sm" onClick={onClearFilters}>Clear filters</Button> : undefined} />;
  }

  return (
    <>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {columns.map((col) => {
          const sort = colSort[col.status] ?? 'updated';
          const items = sortItems(col.items, sort);
          const closed = col.status === 'closed';
          return (
            <section key={col.status} aria-label={`${labelOf(meta?.caseStatuses, col.status)} cases`}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setOver(col.status); }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
              onDrop={(e) => onDrop(e, col.status)}
              className={cx('flex min-h-40 flex-col rounded-[18px] p-1 transition', over === col.status && dragging !== null && 'bg-ink/[0.06] ring-2 ring-dashed ring-ink/30')}>
              <header className="mb-3 flex h-8 items-center justify-between gap-2 px-1">
                <div className="flex items-center gap-2">
                  <h2 className="whitespace-nowrap text-[17px] font-semibold tracking-tight">{labelOf(meta?.caseStatuses, col.status)}</h2>
                  <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-ink px-1.5 text-[12px] font-semibold text-white tabular" aria-label={`${col.total} cases`}>{col.total}</span>
                </div>
                <button type="button" onClick={() => setColSort((s) => ({ ...s, [col.status]: SORTS[(SORTS.findIndex((x) => x.id === sort) + 1) % SORTS.length].id }))}
                  aria-label={`Sorted by ${SORTS.find((x) => x.id === sort)!.label}. Change sort order of this column`}
                  className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border border-line-strong bg-white px-2 text-[12px] font-medium text-muted transition hover:border-ink hover:text-ink min-[1700px]:px-2.5" title={`Sorted by ${SORTS.find((x) => x.id === sort)!.label} - click to change`}>
                  <ArrowUpDown size={12} /><span className="hidden min-[1700px]:inline">{SORTS.find((x) => x.id === sort)!.label}</span>
                </button>
              </header>
              <div className="flex flex-1 flex-col gap-3">
                {items.map((c) => <CaseCard key={c.id} c={c} closed={closed} canMove={canMove(c)} onMove={requestMove} dragging={dragging} setDragging={setDragging} />)}
                {!items.length && <div className="rounded-[14px] border border-dashed border-line-strong px-4 py-8 text-center text-[13px] text-muted">No cases here{dragging ? ' - drop to move' : ''}</div>}
                {col.total > items.length && <p className="px-1 text-center text-[12.5px] text-muted">Showing {items.length} of {col.total}. <Link className="underline" to={`/cases?status=${col.status}`}>See all</Link></p>}
              </div>
            </section>
          );
        })}
      </div>
      {closing && <ResolutionDialog target={closing} busy={move.isPending} error={closeError} onClose={() => setClosing(null)} onConfirm={(resolution) => move.mutate({ c: closing, status: 'closed', resolution })} />}
    </>
  );
}
