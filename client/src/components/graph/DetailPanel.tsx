import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Crosshair, ExternalLink, Link2, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { TYPE_META, TYPE_ORDER, TypeIcon, recordPath } from '@/lib/entities';
import { fmtDate, humanize } from '@/lib/format';
import { useMeta } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import type { GraphEdge, GraphNode, NodeDetail } from '@/types';
import { Badge, Button, ConfirmDialog, ErrorState, Skeleton, statusTone } from '@/components/ui/primitives';
import { SelectField, TextArea } from '@/components/ui/forms';
import type { Selection } from './GraphCanvas';

const CONF_NOTE: Record<string, string> = {
  recorded: 'Stored as part of the record itself (for example the case an evidence item belongs to).',
  unverified: 'Not yet verified. Treat as a lead only.',
  low: 'Low confidence.', medium: 'Medium confidence.', high: 'High confidence: still a recorded association, not proof.',
};

function EdgeDetail({ edge, nodes, canWrite, onDone }: { edge: GraphEdge; nodes: Map<string, GraphNode>; canWrite: boolean; onDone: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const meta = useMeta().data;
  const [confirm, setConfirm] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confidence, setConfidence] = useState(edge.confidence);
  const [description, setDescription] = useState(edge.description ?? '');
  const [error, setError] = useState('');
  const a = nodes.get(edge.source), b = nodes.get(edge.target);
  const editable = edge.table === 'relationships' && edge.relationship_id !== null;

  const remove = useMutation({
    mutationFn: () => api.del(`/relationships/${encodeURIComponent(edge.id)}`),
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Association removed. Both records are kept.'); setConfirm(false); onDone(); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not remove it.'),
  });
  const save = useMutation({
    mutationFn: () => api.patch(`/relationships/${edge.relationship_id}`, { confidence, description }),
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Association updated.'); setEditing(false); },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'Could not save.'),
  });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">Association</p>
        <h3 className="mt-1 text-[18px] font-semibold tracking-tight">{edge.label}</h3>
      </div>
      <ul className="space-y-2">
        {[a, b].map((n) => n && (
          <li key={n.key} className="flex items-center gap-2.5 rounded-xl border border-line px-3 py-2">
            <TypeIcon type={n.type} size={16} />
            <Link to={recordPath(n.type, n.id)} className="min-w-0 flex-1 truncate text-[13.5px] font-medium hover:underline">{n.label}</Link>
            <span className="text-[11.5px] text-muted">{TYPE_META[n.type].label}</span>
          </li>
        ))}
      </ul>
      <dl className="space-y-2 text-[13px]">
        <div className="flex justify-between gap-3"><dt className="text-muted">Confidence</dt><dd><Badge tone={statusTone(edge.confidence)}>{edge.confidence === 'recorded' ? 'Part of record' : humanize(edge.confidence)}</Badge></dd></div>
        {edge.detail && <div className="flex justify-between gap-3"><dt className="text-muted">Detail</dt><dd className="text-right">{humanize(edge.detail)}</dd></div>}
        {edge.recorded_on && <div className="flex justify-between gap-3"><dt className="text-muted">Recorded</dt><dd>{fmtDate(edge.recorded_on)}</dd></div>}
        {edge.created_by_name && <div className="flex justify-between gap-3"><dt className="text-muted">Recorded by</dt><dd>{edge.created_by_name}</dd></div>}
        {edge.citation && <div className="flex justify-between gap-3"><dt className="text-muted">Source</dt><dd className="text-right">{edge.citation}</dd></div>}
      </dl>
      {edge.description && !editing && <p className="rounded-xl bg-mist px-3 py-2.5 text-[13.5px]">{edge.description}</p>}
      <p className="text-[12.5px] text-muted">{CONF_NOTE[edge.confidence] ?? ''}</p>

      {editing && (
        <div className="space-y-3 rounded-xl border border-line p-3">
          <SelectField label="Confidence" value={confidence} onChange={(e) => setConfidence(e.target.value)} options={meta?.confidenceLevels ?? []} />
          <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
          {error && <p role="alert" className="text-[12.5px] text-danger">{error}</p>}
          <div className="flex gap-2"><Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>Save</Button><Button size="sm" variant="secondary" onClick={() => setEditing(false)}>Cancel</Button></div>
        </div>
      )}
      {canWrite && editable && !editing && <Button size="sm" variant="secondary" onClick={() => { setEditing(true); setError(''); }}>Edit confidence / description</Button>}
      {canWrite && edge.removable && <Button size="sm" variant="secondary" className="w-full text-danger" icon={<Trash2 size={14} />} onClick={() => { setError(''); setConfirm(true); }}>Remove this association</Button>}
      {!edge.removable && <p className="rounded-xl bg-mist px-3 py-2 text-[12.5px] text-muted">This connection belongs to the record itself. Edit the record to change it.</p>}
      {confirm && <ConfirmDialog title="Remove association?" danger confirmLabel="Remove" loading={remove.isPending} error={error} onConfirm={() => remove.mutate()} onClose={() => setConfirm(false)}
        message={<p>“{edge.label}” between <strong>{a?.label}</strong> and <strong>{b?.label}</strong> will be removed. Neither record is deleted.</p>} />}
    </div>
  );
}

function NodeDetailView({ node, canWrite, onFocus, onSelectEdge, onConnect, onPathFrom }: {
  node: GraphNode; canWrite: boolean; onFocus: (n: GraphNode) => void; onSelectEdge: (id: string) => void; onConnect: (n: GraphNode) => void; onPathFrom: (n: GraphNode) => void;
}) {
  const nav = useNavigate();
  const q = useQuery({ queryKey: ['rel-node', node.key], queryFn: () => api.get<NodeDetail>(`/relationships/node/${node.key}`) });
  const meta = TYPE_META[node.type];
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ background: `${meta.color}1c`, color: meta.color }}><TypeIcon type={node.type} size={22} /></span>
        <div className="min-w-0">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-muted">{meta.label} · {node.code}</p>
          <h3 className="text-[18px] font-semibold leading-tight tracking-tight">{node.label}</h3>
          {node.subtitle && <p className="text-[13px] text-muted">{node.subtitle}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {node.status && <Badge tone={statusTone(node.status)}>{humanize(node.status)}</Badge>}
        <Badge tone="neutral" dot={false}>{node.degree} connection{node.degree === 1 ? '' : 's'}</Badge>
        {node.case_count >= 2 && <Badge tone="ink" dot={false}>Linked to {node.case_count} cases</Badge>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" variant="secondary" icon={<ExternalLink size={14} />} onClick={() => nav(recordPath(node.type, node.id))}>Open record</Button>
        <Button size="sm" variant="secondary" icon={<Crosshair size={14} />} onClick={() => onFocus(node)}>Centre graph</Button>
        {canWrite && <Button size="sm" variant="secondary" icon={<Link2 size={14} />} onClick={() => onConnect(node)}>Connect to…</Button>}
        <Button size="sm" variant="secondary" icon={<ArrowRight size={14} />} onClick={() => onPathFrom(node)}>Find path…</Button>
      </div>

      <div>
        <h4 className="mb-2 text-[13px] font-semibold">Connected records</h4>
        {q.isPending && <div className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /></div>}
        {q.isError && <ErrorState error={q.error} />}
        {q.data && (
          <>
            <div className="mb-2 flex flex-wrap gap-1.5">
              {TYPE_ORDER.filter((t) => q.data.counts_by_type[t]).map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-mist px-2 py-0.5 text-[12px]"><TypeIcon type={t} size={12} />{q.data.counts_by_type[t]} {(q.data.counts_by_type[t] === 1 ? TYPE_META[t].label : TYPE_META[t].plural).toLowerCase()}</span>
              ))}
            </div>
            <ul className="max-h-[340px] space-y-1 overflow-y-auto pr-1">
              {q.data.links.map(({ edge, other }) => (
                <li key={edge.id}>
                  <button onClick={() => onSelectEdge(edge.id)} className="flex w-full items-center gap-2.5 rounded-xl border border-transparent px-2.5 py-2 text-left hover:border-line hover:bg-mist">
                    <TypeIcon type={other.type} size={15} className="shrink-0" />
                    <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{other.label}</span><span className="block truncate text-[12px] text-muted">{edge.label} · {edge.confidence === 'recorded' ? 'part of record' : edge.confidence}</span></span>
                  </button>
                </li>
              ))}
              {!q.data.links.length && <li className="py-3 text-center text-[13px] text-muted">No connections recorded yet.</li>}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

export function DetailPanel({ selection, nodes, edges, canWrite, onClear, ...handlers }: {
  selection: Selection; nodes: GraphNode[]; edges: GraphEdge[]; canWrite: boolean; onClear: () => void;
  onFocus: (n: GraphNode) => void; onSelectEdge: (id: string) => void; onConnect: (n: GraphNode) => void; onPathFrom: (n: GraphNode) => void;
}) {
  const byKey = new Map(nodes.map((n) => [n.key, n]));
  if (selection?.kind === 'node') {
    const n = byKey.get(selection.key);
    if (n) return <NodeDetailView node={n} canWrite={canWrite} {...handlers} />;
  }
  if (selection?.kind === 'edge') {
    const e = edges.find((x) => x.id === selection.id);
    if (e) return <EdgeDetail edge={e} nodes={byKey} canWrite={canWrite} onDone={onClear} />;
  }
  return null;
}
