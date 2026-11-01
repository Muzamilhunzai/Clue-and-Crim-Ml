import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Lock, Network, Pencil, Repeat, Trash2 } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { TYPE_META, TypeIcon, graphPath, recordPath } from '@/lib/entities';
import { fmtDate, humanize } from '@/lib/format';
import { labelOf, useMeta } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import type { CustodyEntry, EntityRecord, GraphEdge, GraphNode } from '@/types';
import { ENTITY_CONFIG, type FieldSpec, type PlainType } from '@/lib/entityConfig';
import { TopBand } from '@/components/TopBand';
import { EntityFormDialog } from '@/components/EntityForm';
import { CustodyTimeline, TransferDialog } from '@/components/evidence/Custody';
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, SectionTitle, Skeleton, statusTone } from '@/components/ui/primitives';

interface Detail {
  record: EntityRecord;
  cases: { id: number; case_number: string; title: string; status: string; priority: string; role_detail: string | null; notes?: string | null; statement_summary?: string | null }[];
  relationships: { edge: GraphEdge; other: GraphNode }[];
  custody?: CustodyEntry[]; custody_check?: { ok: boolean; entries: number; problems: string[] };
  evidence?: { id: number; evidence_code: string; title: string; status: string }[];
  clues?: { id: number; clue_code: string; title: string; status: string }[];
  permissions: { can_edit: boolean; can_delete: boolean; can_see_restricted: boolean; can_transfer: boolean; case_id?: number };
}

const OPT_KEYS = { genders: 'genders', victimTypes: 'victimTypes', evidenceCategories: 'evidenceCategories', evidenceStatuses: 'evidenceStatuses', confidenceLevels: 'confidenceLevels', clueStatuses: 'clueStatuses', locationKinds: 'locationKinds', involvementStatuses: 'involvementStatuses', followUpStatuses: 'followUpStatuses' } as const;

function Value({ f, rec, meta }: { f: FieldSpec; rec: EntityRecord; meta: ReturnType<typeof useMeta>['data'] }) {
  const masked = rec.restricted_fields?.includes(f.name);
  if (masked) return <span className="inline-flex items-center gap-1.5 rounded-full bg-mist px-2.5 py-0.5 text-[12.5px] text-muted"><Lock size={11} />Restricted for your role</span>;
  const raw = rec[f.name];
  if (f.kind === 'checkbox') return <>{raw === 1 ? 'Yes' : 'No'}</>;
  if (raw === null || raw === undefined || raw === '') return <span className="text-faint">Not recorded</span>;
  if (f.kind === 'date') return <>{fmtDate(String(raw))}</>;
  if (f.kind === 'select' && f.options) {
    const label = labelOf(meta?.[OPT_KEYS[f.options]] as { value: string; label: string }[] | undefined, String(raw));
    return f.name === 'status' || f.name === 'confidence' ? <Badge tone={statusTone(String(raw))}>{label}</Badge> : <>{label}</>;
  }
  if (f.kind === 'case') return <Link className="font-medium hover:underline" to={`/cases/${raw}`}>{String(rec.case_number)} · {String(rec.case_title)}</Link>;
  if (f.kind === 'location') return <Link className="font-medium hover:underline" to={`/locations/${raw}`}>{String(rec.location_name ?? rec.name)}</Link>;
  return <span className="whitespace-pre-wrap">{String(raw)}</span>;
}

export default function EntityDetail({ type }: { type: PlainType }) {
  const cfg = ENTITY_CONFIG[type];
  const { id } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const meta = useMeta().data;
  const [editing, setEditing] = useState(false);
  const [transfer, setTransfer] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);
  const [delError, setDelError] = useState('');

  const q = useQuery({ queryKey: [cfg.apiPath, 'detail', id], queryFn: () => api.get<Detail>(`/${cfg.apiPath}/${id}`) });
  const del = useMutation({
    mutationFn: () => api.del(`/${cfg.apiPath}/${id}`),
    onSuccess: () => { void qc.invalidateQueries(); toast.success(`${cfg.singular} deleted.`); nav(`/${cfg.apiPath}`, { replace: true }); },
    onError: (e) => setDelError(e instanceof ApiError ? e.message : 'Could not delete.'),
  });

  const back = <Link to={`/${cfg.apiPath}`} className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"><ArrowLeft size={14} />{cfg.plural}</Link>;
  if (q.isPending) return <div><TopBand /><div className="space-y-4 px-5 pt-8 sm:px-8"><Skeleton className="h-10 w-80" /><Skeleton className="h-64" /></div></div>;
  if (q.isError) return <div><TopBand /><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>;

  const d = q.data;
  const rec = d.record;
  const title = String(rec[cfg.titleField]);
  const fields = cfg.fields.filter((f) => f.name !== cfg.titleField && f.kind !== 'case');

  const Actions: ReactNode = (
    <div className="flex flex-wrap items-center gap-2">
      <Link to={graphPath(type, rec.id)}><Button variant="secondary" icon={<Network size={16} />}>View in graph</Button></Link>
      {type === 'evidence' && d.permissions.can_transfer && rec.status !== 'disposed' && <Button variant="secondary" icon={<Repeat size={16} />} onClick={() => setTransfer(true)}>Transfer custody</Button>}
      {d.permissions.can_edit && <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>Edit</Button>}
      {d.permissions.can_delete && <Button variant="secondary" className="text-danger" icon={<Trash2 size={16} />} onClick={() => { setDelError(''); setConfirmDel(true); }}>Delete</Button>}
    </div>
  );

  return (
    <div className="pb-14">
      <TopBand />
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-6 sm:px-8">
        <div className="min-w-0">
          {back}
          <div className="flex flex-wrap items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: `${TYPE_META[type].color}1c`, color: TYPE_META[type].color }}><TypeIcon type={type} size={22} /></span>
            <div>
              <p className="text-[12.5px] font-medium text-muted">{cfg.singular}{cfg.codeField ? ` · ${String(rec[cfg.codeField])}` : ''}</p>
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">{title}</h1>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {type === 'evidence' && <Badge tone={statusTone(String(rec.status))}>{labelOf(meta?.evidenceStatuses, String(rec.status))}</Badge>}
            {type === 'clue' && <><Badge tone={statusTone(String(rec.status))}>{labelOf(meta?.clueStatuses, String(rec.status))}</Badge><Badge tone={statusTone(String(rec.confidence))}>Confidence: {labelOf(meta?.confidenceLevels, String(rec.confidence))}</Badge></>}
            {type === 'witness' && rec.is_protected === 1 && <Badge tone="ink" dot={false}><Lock size={11} />Protected witness</Badge>}
            {type === 'suspect' && <Badge tone="neutral" dot={false}>Association only: not a finding of guilt</Badge>}
          </div>
        </div>
        {Actions}
      </div>

      <div className="grid gap-4 px-5 sm:px-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="min-w-0 space-y-4">
          <Card>
            <SectionTitle>Details</SectionTitle>
            <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2">
              {type === 'evidence' || type === 'clue' ? (
                <div className="sm:col-span-2"><dt className="text-[12.5px] text-muted">Case</dt><dd className="mt-0.5 text-[14px]"><Link className="font-medium hover:underline" to={`/cases/${rec.case_id}`}>{String(rec.case_number)} · {String(rec.case_title)}</Link></dd></div>
              ) : null}
              {fields.map((f) => (
                <div key={f.name} className={f.wide || f.kind === 'textarea' ? 'sm:col-span-2' : undefined}>
                  <dt className="text-[12.5px] text-muted">{f.label}</dt>
                  <dd className="mt-0.5 text-[14px]"><Value f={f} rec={rec} meta={meta} /></dd>
                </div>
              ))}
              {type === 'evidence' && (
                <>
                  <div><dt className="text-[12.5px] text-muted">Current custodian</dt><dd className="mt-0.5 text-[14px] font-medium">{String(rec.custodian_name)}</dd></div>
                  <div><dt className="text-[12.5px] text-muted">Collected by</dt><dd className="mt-0.5 text-[14px]">{String(rec.collected_by_name)}</dd></div>
                </>
              )}
              <div><dt className="text-[12.5px] text-muted">Created</dt><dd className="mt-0.5 text-[14px]">{fmtDate(String(rec.created_at))}</dd></div>
              <div><dt className="text-[12.5px] text-muted">Last updated</dt><dd className="mt-0.5 text-[14px]">{fmtDate(String(rec.updated_at))}</dd></div>
            </dl>
            {rec.restricted_fields && rec.restricted_fields.length > 0 && <p className="mt-4 flex items-center gap-2 rounded-xl bg-mist px-3 py-2 text-[12.5px] text-muted"><Lock size={13} />Some fields are hidden for your role. The server removes them before sending, so they never reach this page.</p>}
          </Card>

          {type === 'evidence' && d.custody && (
            <Card>
              <SectionTitle>Chain of custody</SectionTitle>
              <CustodyTimeline entries={d.custody} check={d.custody_check} />
            </Card>
          )}

          {type === 'location' && (
            <Card>
              <SectionTitle>At this location</SectionTitle>
              <div className="grid gap-4 sm:grid-cols-2">
                <div><h3 className="mb-2 text-[13px] font-semibold text-muted">Evidence collected here</h3>{d.evidence?.length ? d.evidence.map((e) => <Link key={e.id} to={`/evidence/${e.id}`} className="block rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-mist"><span className="tabular text-muted">{e.evidence_code}</span> {e.title}</Link>) : <p className="text-[13px] text-muted">None.</p>}</div>
                <div><h3 className="mb-2 text-[13px] font-semibold text-muted">Clues noticed here</h3>{d.clues?.length ? d.clues.map((c) => <Link key={c.id} to={`/clues/${c.id}`} className="block rounded-lg px-2 py-1.5 text-[13.5px] hover:bg-mist"><span className="tabular text-muted">{c.clue_code}</span> {c.title}</Link>) : <p className="text-[13px] text-muted">None.</p>}</div>
              </div>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-4">
          {d.cases.length > 0 && (
            <Card>
              <SectionTitle>Linked cases <span className="text-muted">({d.cases.length})</span></SectionTitle>
              <ul className="divide-y divide-line">
                {d.cases.map((c) => (
                  <li key={c.id} className="py-2.5 first:pt-0 last:pb-0">
                    <div className="flex items-start justify-between gap-2">
                      <Link to={`/cases/${c.id}`} className="min-w-0 text-[14px] font-medium hover:underline"><span className="tabular text-muted">{c.case_number}</span> {c.title}</Link>
                      <Badge tone={statusTone(c.status)}>{labelOf(meta?.caseStatuses, c.status)}</Badge>
                    </div>
                    {c.role_detail && <p className="mt-0.5 text-[12.5px] text-muted">{humanize(c.role_detail)}</p>}
                    {c.statement_summary && <p className="mt-1 text-[12.5px] text-muted">“{c.statement_summary}”</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <Card>
            <SectionTitle aside={<Link to={graphPath(type, rec.id)} className="text-[13px] font-medium hover:underline">Open graph</Link>}>Connections <span className="text-muted">({d.relationships.length})</span></SectionTitle>
            {d.relationships.length === 0 ? <EmptyState title="No connections yet" hint="Associations recorded in the relationship graph appear here." /> : (
              <ul className="space-y-1">
                {d.relationships.map(({ edge, other }) => (
                  <li key={edge.id}>
                    <Link to={recordPath(other.type, other.id)} className="flex items-center gap-2.5 rounded-xl px-2.5 py-2 hover:bg-mist">
                      <TypeIcon type={other.type} size={15} className="shrink-0" />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[13.5px] font-medium">{other.label}</span><span className="block truncate text-[12px] text-muted">{edge.label}{edge.confidence !== 'recorded' ? ` · ${edge.confidence}` : ''}</span></span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {editing && <EntityFormDialog cfg={cfg} existing={rec} onClose={() => setEditing(false)} />}
      {transfer && <TransferDialog evidenceId={rec.id} code={String(rec.evidence_code)} currentHolderId={Number(rec.current_custodian_id)} currentStatus={String(rec.status)} onClose={() => setTransfer(false)} />}
      {confirmDel && <ConfirmDialog title={`Delete ${cfg.singular.toLowerCase()}?`} danger confirmLabel="Delete" loading={del.isPending} error={delError} onConfirm={() => del.mutate()} onClose={() => setConfirmDel(false)}
        message={<p><strong>{title}</strong> and its recorded associations will be permanently removed. This cannot be undone.{type === 'suspect' || type === 'victim' || type === 'witness' ? ' People linked to a case cannot be deleted: unlink them from the case first.' : ''}</p>} />}
    </div>
  );
}
