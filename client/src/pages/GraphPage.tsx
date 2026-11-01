import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, Info, Link2, Route, TriangleAlert, X } from 'lucide-react';
import { api } from '@/lib/api';
import { TYPE_META, TYPE_ORDER, TypeIcon, graphPath, recordPath } from '@/lib/entities';
import { cx } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import type { EntityType, GraphData, GraphNode, Hotspots, LookupItem, PathResult } from '@/types';
import { TopBand } from '@/components/TopBand';
import { RecordPicker } from '@/components/RecordPicker';
import { GraphCanvas, type Selection } from '@/components/graph/GraphCanvas';
import { DetailPanel } from '@/components/graph/DetailPanel';
import { AddRelationshipDialog } from '@/components/graph/AddRelationshipDialog';
import { Button, Card, ErrorState, IconButton, Modal, PageHeader, Skeleton, useOutsideClose } from '@/components/ui/primitives';

const toItem = (n: GraphNode): LookupItem => ({ type: n.type, id: n.id, code: n.code, label: n.label, subtitle: n.subtitle });

function FocusPicker({ current, onPick }: { current?: GraphNode; onPick: (i: LookupItem) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useOutsideClose(open, () => setOpen(false));
  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-haspopup="dialog" className="flex h-10 max-w-[320px] items-center gap-2.5 rounded-full border border-line-strong bg-white pl-3 pr-3.5 text-[13.5px] transition hover:border-ink">
        {current && <TypeIcon type={current.type} size={16} className="shrink-0" />}
        <span className="text-muted">Centred on</span>
        <span className="truncate font-semibold">{current?.label ?? '…'}</span>
        <ChevronDown size={15} className="shrink-0 text-muted" />
      </button>
      {open && (
        <div role="dialog" aria-label="Choose the centre record" className="anim-pop absolute left-0 z-40 mt-2 w-[min(92vw,420px)] rounded-2xl border border-line bg-white p-4 shadow-[var(--shadow-pop)]">
          <RecordPicker label="Centre the graph on" value={null} onChange={(v) => { if (v) { onPick(v); setOpen(false); } }} />
        </div>
      )}
    </div>
  );
}

function PathDialog({ initialFrom, onClose, onRun }: { initialFrom?: LookupItem; onClose: () => void; onRun: (a: LookupItem, b: LookupItem) => void }) {
  const [a, setA] = useState<LookupItem | null>(initialFrom ?? null);
  const [b, setB] = useState<LookupItem | null>(null);
  const [err, setErr] = useState('');
  return (
    <Modal title="Find a connection" subtitle="Finds the shortest chain of recorded associations between two records." onClose={onClose} width={540}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={() => {
        if (!a || !b) { setErr('Choose both records.'); return; }
        if (a.type === b.type && a.id === b.id) { setErr('Choose two different records.'); return; }
        onRun(a, b); onClose();
      }}>Find path</Button></>}>
      <div className="grid gap-4">
        <RecordPicker label="From" value={a} onChange={setA} />
        <RecordPicker label="To" value={b} onChange={setB} />
        {err && <p role="alert" className="text-[13px] text-danger">{err}</p>}
      </div>
    </Modal>
  );
}

export default function GraphPage() {
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [depth, setDepth] = useState(2);
  const [hidden, setHidden] = useState<Set<EntityType>>(new Set());
  const [multi, setMulti] = useState(true);
  const [selection, setSelection] = useState<Selection>(null);
  const [adding, setAdding] = useState<{ from?: LookupItem } | null>(null);
  const [pathDlg, setPathDlg] = useState<{ from?: LookupItem } | null>(null);
  const [pathReq, setPathReq] = useState<{ a: LookupItem; b: LookupItem } | null>(null);
  const canWrite = can('relationship:write');

  const hot = useQuery({ queryKey: ['rel-hot'], queryFn: () => api.get<Hotspots>('/relationships/hotspots') });
  const focusParam = params.get('focus');
  const defaultFocus = hot.data ? (hot.data.multiCase[0] ? `${hot.data.multiCase[0].type}:${hot.data.multiCase[0].id}` : hot.data.topCases[0] ? `case:${hot.data.topCases[0].id}` : 'case:1') : null;
  const focus = focusParam ?? defaultFocus;

  const graph = useQuery({ queryKey: ['rel-graph', focus, depth], enabled: !!focus, queryFn: () => api.get<GraphData>('/relationships/graph', { focus, depth }), placeholderData: (p) => p });
  const path = useQuery({
    queryKey: ['rel-path', pathReq?.a.type, pathReq?.a.id, pathReq?.b.type, pathReq?.b.id], enabled: !!pathReq,
    queryFn: () => api.get<PathResult>('/relationships/path', { from: `${pathReq!.a.type}:${pathReq!.a.id}`, to: `${pathReq!.b.type}:${pathReq!.b.id}`, max: 6 }),
  });

  const g = graph.data;
  const inPath = !!pathReq && !!path.data?.found;
  const rawNodes = inPath ? path.data!.nodes : g?.nodes ?? [];
  const rawEdges = inPath ? path.data!.edges : g?.edges ?? [];
  const focusKey = inPath ? `${pathReq!.a.type}:${pathReq!.a.id}` : g?.focus ?? focus ?? '';

  const { nodes, edges } = useMemo(() => {
    const keep = rawNodes.filter((n) => !hidden.has(n.type) || n.key === focusKey);
    const keys = new Set(keep.map((n) => n.key));
    return { nodes: keep, edges: rawEdges.filter((e) => keys.has(e.source) && keys.has(e.target)) };
  }, [rawNodes, rawEdges, hidden, focusKey]);

  const pathNodes = useMemo(() => (inPath ? new Set(path.data!.nodes.map((n) => n.key)) : undefined), [inPath, path.data]);
  const pathEdges = useMemo(() => (inPath ? new Set(path.data!.edges.map((e) => e.id)) : undefined), [inPath, path.data]);

  const setFocus = (type: EntityType, id: number) => { setPathReq(null); setSelection(null); setParams({ focus: `${type}:${id}` }); };
  const focusNode = g?.nodes.find((n) => n.key === g.focus);
  const toggle = (t: EntityType) => setHidden((h) => { const n = new Set(h); if (n.has(t)) n.delete(t); else n.add(t); return n; });
  const resetToken = inPath ? `path:${pathReq!.a.type}${pathReq!.a.id}-${pathReq!.b.type}${pathReq!.b.id}` : `${g?.focus}:${g?.depth}:${g?.nodes.length}:${g?.edges.length}:${[...hidden].join()}`;
  const lonely = !inPath && !!g && g.nodes.length <= 1;

  return (
    <div className="pb-14">
      <TopBand />
      <PageHeader title="Relationship graph" subtitle="Every box and line comes from a real database record. A line is a recorded association, not a finding of fact."
        actions={<>
          <Button variant="secondary" icon={<Route size={16} />} onClick={() => setPathDlg({ from: focusNode ? toItem(focusNode) : undefined })}>Find connection</Button>
          {canWrite && <Button icon={<Link2 size={16} />} onClick={() => setAdding({ from: focusNode ? toItem(focusNode) : undefined })}>Add relationship</Button>}
        </>} />

      <div className="grid gap-4 px-5 sm:px-8 xl:grid-cols-[minmax(0,1fr)_350px]">
        <div className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <FocusPicker current={focusNode} onPick={(i) => setFocus(i.type, i.id)} />
            <div role="group" aria-label="How many hops to show" className="flex h-10 items-center rounded-full border border-line-strong bg-white p-1">
              {[1, 2, 3].map((d) => <button key={d} aria-pressed={depth === d} disabled={inPath} onClick={() => setDepth(d)} className={cx('h-8 rounded-full px-3 text-[13px] font-medium transition disabled:opacity-40', depth === d ? 'bg-ink text-white' : 'text-muted hover:text-ink')}>{d} hop{d > 1 ? 's' : ''}</button>)}
            </div>
            <label className="flex h-10 cursor-pointer items-center gap-2 rounded-full border border-line-strong bg-white px-3.5 text-[13.5px]">
              <input type="checkbox" checked={multi} onChange={(e) => setMulti(e.target.checked)} className="accent-[#1f1f1f]" />Highlight records in 2+ cases
            </label>
          </div>
          <div className="mb-3 flex flex-wrap gap-1.5" role="group" aria-label="Show or hide record types">
            {TYPE_ORDER.map((t) => {
              const count = (inPath ? rawNodes : g?.nodes ?? []).filter((n) => n.type === t).length;
              const on = !hidden.has(t);
              return (
                <button key={t} aria-pressed={on} onClick={() => toggle(t)} disabled={!count && on} className={cx('inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition disabled:opacity-40', on ? 'border-ink bg-white' : 'border-line bg-mist text-faint line-through')}>
                  <span className="flex h-4 w-4 items-center justify-center rounded-full" style={{ background: on ? TYPE_META[t].color : '#cfd0c4', color: '#fff' }}><TypeIcon type={t} size={10} /></span>
                  {TYPE_META[t].plural}<span className="tabular text-muted no-underline">{count}</span>
                </button>
              );
            })}
          </div>

          {inPath && (
            <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-ink px-4 py-2.5 text-[13.5px] text-cream">
              <span>Shortest connection: <strong>{path.data!.hops} hop{path.data!.hops === 1 ? '' : 's'}</strong> from {pathReq!.a.label} to {pathReq!.b.label}</span>
              <button onClick={() => setPathReq(null)} className="inline-flex items-center gap-1 rounded-full bg-cream/15 px-3 py-1 text-[12.5px] font-medium hover:bg-cream/25"><X size={13} />Back to graph</button>
            </div>
          )}
          {pathReq && path.data && !path.data.found && (
            <div role="status" className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-warn/40 bg-warn-soft px-4 py-2.5 text-[13.5px]">
              <span className="flex items-center gap-2"><Info size={15} />No chain of up to 6 recorded associations links {pathReq.a.label} and {pathReq.b.label}.</span>
              <button onClick={() => setPathReq(null)} className="text-[12.5px] font-medium underline">Dismiss</button>
            </div>
          )}
          {g?.truncated && !inPath && <p className="mb-3 flex items-center gap-2 rounded-xl bg-warn-soft px-4 py-2 text-[13px]"><TriangleAlert size={15} />Showing {g.depth} hop{g.depth > 1 ? 's' : ''} instead of {g.requested_depth}: the full neighbourhood is too large to draw. Centre on another record to explore further.</p>}

          <div className="h-[max(480px,calc(100vh-330px))]">
            {graph.isError && !inPath ? <ErrorState error={graph.error} onRetry={() => void graph.refetch()} />
              : !g && !inPath ? <Skeleton className="h-full rounded-[18px]" />
              : (
                <div className="relative h-full">
                  <GraphCanvas nodes={nodes} edges={edges} focusKey={focusKey} selection={selection} onSelect={setSelection} highlightMulti={multi} pathNodes={pathNodes} pathEdges={pathEdges} resetToken={resetToken} />
                  {lonely && <div className="pointer-events-none absolute inset-x-0 top-6 mx-auto w-fit max-w-[85%] rounded-2xl border border-line bg-white/95 px-4 py-3 text-center text-[13.5px] text-muted shadow-sm">This record has no recorded connections yet.{canWrite && ' Use “Add relationship” to link it.'}</div>}
                </div>
              )}
          </div>
          <p className="mt-2 text-[12.5px] text-muted tabular">
            {nodes.length} records · {edges.length} connections{g && !inPath ? ` · ${g.depth} hop${g.depth > 1 ? 's' : ''} from the centre` : ''}
          </p>
        </div>

        <aside aria-label="Details" className="min-w-0">
          <Card className="relative sticky top-4 max-h-[calc(100vh-2rem)] overflow-y-auto">
            {selection ? (
              <>
                <IconButton label="Close details" onClick={() => setSelection(null)} className="absolute right-3 top-3"><X size={16} /></IconButton>
                <DetailPanel selection={selection} nodes={rawNodes} edges={rawEdges} canWrite={canWrite} onClear={() => setSelection(null)}
                  onFocus={(n) => setFocus(n.type, n.id)} onSelectEdge={(id) => setSelection({ kind: 'edge', id })}
                  onConnect={(n) => setAdding({ from: toItem(n) })} onPathFrom={(n) => setPathDlg({ from: toItem(n) })} />
              </>
            ) : inPath ? (
              <div className="space-y-3">
                <h3 className="text-[16px] font-semibold">The chain</h3>
                <ol className="space-y-2">
                  {path.data!.nodes.map((n, i) => (
                    <li key={n.key}>
                      <Link to={recordPath(n.type, n.id)} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2 hover:border-ink"><TypeIcon type={n.type} size={16} /><span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{n.label}</span><span className="text-[11.5px] text-muted">{TYPE_META[n.type].label}</span></Link>
                      {path.data!.edges[i] && <p className="ml-5 border-l-2 border-dashed border-line-strong py-1.5 pl-4 text-[12.5px] text-muted">{path.data!.edges[i].label}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            ) : (
              <div className="space-y-5">
                <div>
                  <h3 className="text-[16px] font-semibold">Worth a look</h3>
                  <p className="mt-0.5 text-[12.5px] text-muted">Records that appear in more than one case.</p>
                  <ul className="mt-2 space-y-1">
                    {(hot.data?.multiCase ?? []).slice(0, 6).map((h) => (
                      <li key={`${h.type}:${h.id}`}>
                        <Link to={graphPath(h.type, h.id)} onClick={() => { setPathReq(null); setSelection(null); }} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-mist">
                          <TypeIcon type={h.type} size={15} className="shrink-0" /><span className="min-w-0 flex-1 truncate text-[13.5px] font-medium">{h.label}</span>
                          <span className="rounded-full bg-ink px-2 py-0.5 text-[11.5px] font-medium text-white tabular">{h.case_count} cases</span>
                        </Link>
                      </li>
                    ))}
                    {hot.data && !hot.data.multiCase.length && <li className="py-2 text-[13px] text-muted">None yet.</li>}
                  </ul>
                </div>
                <div>
                  <h3 className="text-[14px] font-semibold">How to read this</h3>
                  <ul className="mt-2 space-y-2.5 text-[12.5px] text-muted">
                    <li className="flex items-center gap-3"><svg width="44" height="8" aria-hidden><line x1="0" y1="4" x2="44" y2="4" stroke="#1f1f1f" strokeWidth="2" /></svg>High confidence, or part of the record itself</li>
                    <li className="flex items-center gap-3"><svg width="44" height="8" aria-hidden><line x1="0" y1="4" x2="44" y2="4" stroke="#1f1f1f" strokeWidth="2" strokeDasharray="7 4" /></svg>Medium confidence</li>
                    <li className="flex items-center gap-3"><svg width="44" height="8" aria-hidden><line x1="0" y1="4" x2="44" y2="4" stroke="#1f1f1f" strokeWidth="2" strokeDasharray="1.5 4.5" strokeLinecap="round" /></svg>Low or unverified: a lead, not a fact</li>
                    <li className="flex items-center gap-3"><svg width="44" height="22" aria-hidden><circle cx="22" cy="11" r="8" fill="#fff" stroke="#eb6834" strokeWidth="3" /><circle cx="22" cy="11" r="10.5" fill="none" stroke="#1f1f1f" strokeDasharray="3 3" /></svg>Dashed ring: linked to 2 or more cases</li>
                  </ul>
                </div>
                <p className="rounded-xl bg-mist px-3 py-2.5 text-[12.5px] text-muted">Results are computed with SQL (recursive queries over the relationship tables). Nothing here is a prediction or an accusation.</p>
              </div>
            )}
          </Card>
        </aside>
      </div>

      {adding && <AddRelationshipDialog from={adding.from} onClose={() => setAdding(null)} onCreated={() => setSelection(null)} />}
      {pathDlg && <PathDialog initialFrom={pathDlg.from} onClose={() => setPathDlg(null)} onRun={(a, b) => { setSelection(null); setPathReq({ a, b }); }} />}
    </div>
  );
}
