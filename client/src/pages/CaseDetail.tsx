import { useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Archive, ArchiveRestore, ArrowLeft, CalendarDays, MapPin, MoveRight, Network, Pencil, Plus, Unlink, UserPlus, X } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { TypeIcon } from '@/lib/entities';
import { fmtDate, fmtDateTime, humanize, timeAgo } from '@/lib/format';
import { ENTITY_CONFIG } from '@/lib/entityConfig';
import { labelOf, useLookups, useMeta } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import type { CaseDetail as Detail, CaseRow, CaseStatus, PersonLink, LookupItem } from '@/types';
import { TopBand } from '@/components/TopBand';
import { RecordPicker } from '@/components/RecordPicker';
import { CaseFormDialog } from '@/components/cases/CaseForm';
import { EntityFormDialog } from '@/components/EntityForm';
import { ResolutionDialog } from '@/components/dashboard/Board';
import { Avatar, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, InlineError, Menu, Modal, priorityTone, SectionTitle, Skeleton, statusTone, Tabs } from '@/components/ui/primitives';
import { SelectField, TextArea } from '@/components/ui/forms';

type Kind = 'suspects' | 'victims' | 'witnesses';
const KIND_META: Record<Kind, { type: 'suspect' | 'victim' | 'witness'; title: string; idField: string }> = {
  suspects: { type: 'suspect', title: 'Suspects', idField: 'suspect_id' },
  victims: { type: 'victim', title: 'Victims', idField: 'victim_id' },
  witnesses: { type: 'witness', title: 'Witnesses', idField: 'witness_id' },
};
const errText = (e: unknown, fallback = 'Something went wrong.') => (e instanceof ApiError ? e.message : fallback);

function LinkPersonDialog({ caseId, kind, onClose }: { caseId: number; kind: Kind; onClose: () => void }) {
  const km = KIND_META[kind];
  const meta = useMeta().data;
  const qc = useQueryClient();
  const toast = useToast();
  const [pick, setPick] = useState<LookupItem | null>(null);
  const [involvement, setInvolvement] = useState('person_of_interest');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');
  const link = useMutation({
    mutationFn: () => api.post(`/cases/${caseId}/${kind}`, { [km.idField]: pick!.id, ...(kind === 'suspects' ? { involvement_status: involvement } : {}), notes: notes.trim() || undefined }),
    onSuccess: () => { void qc.invalidateQueries(); toast.success(`${KIND_META[kind].type.charAt(0).toUpperCase() + KIND_META[kind].type.slice(1)} linked to this case.`); onClose(); },
    onError: (e) => setError(errText(e)),
  });
  return (
    <Modal title={`Link an existing ${km.type}`} subtitle="Links a record that already exists. To add someone new, use “Create new”." onClose={onClose} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={link.isPending} onClick={() => { setError(''); if (!pick) { setError(`Choose a ${km.type} first.`); return; } link.mutate(); }}>Link to case</Button></>}>
      <div className="grid gap-4">
        <RecordPicker label={km.type.charAt(0).toUpperCase() + km.type.slice(1)} value={pick} onChange={setPick} types={[km.type]} />
        {kind === 'suspects' && <SelectField label="Involvement" value={involvement} onChange={(e) => setInvolvement(e.target.value)} options={meta?.involvementStatuses ?? []} hint="A status in this case, not a verdict. There is no “guilty” option." />}
        <TextArea label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Optional" />
        <InlineError>{error}</InlineError>
      </div>
    </Modal>
  );
}

function AssignDialog({ detail, onClose }: { detail: Detail; onClose: () => void }) {
  const lookups = useLookups().data;
  const meta = useMeta().data;
  const qc = useQueryClient();
  const toast = useToast();
  const [user, setUser] = useState('');
  const [role, setRole] = useState('support');
  const [error, setError] = useState('');
  const taken = new Set(detail.investigators.map((i) => i.id));
  const save = useMutation({
    mutationFn: () => api.post(`/cases/${detail.case.id}/investigators`, { user_id: Number(user), role }),
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Investigator assigned.'); onClose(); },
    onError: (e) => setError(errText(e)),
  });
  return (
    <Modal title="Assign an investigator" onClose={onClose} width={460}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => { setError(''); if (!user) { setError('Choose an investigator.'); return; } save.mutate(); }}>Assign</Button></>}>
      <div className="grid gap-4">
        <SelectField label="Investigator" value={user} onChange={(e) => setUser(e.target.value)} placeholder="Choose…" options={(lookups?.users ?? []).filter((u) => u.role !== 'evidence_officer' && !taken.has(u.id)).map((u) => ({ value: u.id, label: u.full_name }))} />
        <SelectField label="Role on this case" value={role} onChange={(e) => setRole(e.target.value)} options={meta?.assignmentRoles ?? []} hint="Making someone the lead moves the current lead to support." />
        <InlineError>{error}</InlineError>
      </div>
    </Modal>
  );
}

function PersonList({ detail, kind }: { detail: Detail; kind: Kind }) {
  const km = KIND_META[kind];
  const meta = useMeta().data;
  const qc = useQueryClient();
  const toast = useToast();
  const [linking, setLinking] = useState(false);
  const [creating, setCreating] = useState(false);
  const [unlinking, setUnlinking] = useState<PersonLink | null>(null);
  const rows = detail[kind];
  const canEdit = detail.permissions.can_edit;
  const cfg = ENTITY_CONFIG[km.type];

  const patch = useMutation({
    mutationFn: (v: { id: number; body: Record<string, unknown> }) => api.patch(`/cases/${detail.case.id}/${kind}/${v.id}`, v.body),
    onSuccess: () => void qc.invalidateQueries(), onError: (e) => toast.error(errText(e)),
  });
  const unlink = useMutation({
    mutationFn: (p: PersonLink) => api.del(`/cases/${detail.case.id}/${kind}/${p.id}`),
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Unlinked. The record itself is kept.'); setUnlinking(null); }, onError: (e) => toast.error(errText(e)),
  });
  const linkNew = async (newId: number) => {
    try { await api.post(`/cases/${detail.case.id}/${kind}`, { [km.idField]: newId }); void qc.invalidateQueries(); }
    catch (e) { toast.error(errText(e, 'Created, but could not link it to the case.')); }
  };

  return (
    <Card>
      <SectionTitle aside={canEdit && <div className="flex gap-2"><Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => setCreating(true)}>Create new</Button><Button size="sm" variant="secondary" icon={<UserPlus size={14} />} onClick={() => setLinking(true)}>Link existing</Button></div>}>
        {km.title} <span className="text-muted">({rows.length})</span>
      </SectionTitle>
      {rows.length === 0 ? <EmptyState icon={<TypeIcon type={km.type} size={20} />} title={`No ${km.title.toLowerCase()} linked`} hint={canEdit ? 'Link an existing record or create a new one.' : undefined} /> : (
        <ul className="divide-y divide-line">
          {rows.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <Link to={`/${cfg.apiPath}/${p.id}`} className="text-[14.5px] font-medium hover:underline">{p.full_name}</Link>
                <p className="text-[12.5px] text-muted"><span className="tabular">{p.code}</span>{p.alias ? ` · aka “${p.alias}”` : ''}{p.occupation ? ` · ${p.occupation}` : ''}{p.case_count > 1 ? ` · in ${p.case_count} cases` : ''}{p.is_protected ? ' · protected' : ''}</p>
                {(p.notes || p.harm_summary || p.statement_summary) && <p className="mt-1 text-[12.5px] text-muted">{p.harm_summary || p.statement_summary || p.notes}</p>}
              </div>
              {kind === 'suspects' && (canEdit
                ? <select aria-label={`Involvement of ${p.full_name}`} value={p.involvement_status} onChange={(e) => patch.mutate({ id: p.id, body: { involvement_status: e.target.value } })} className="h-8 rounded-full border border-line-strong bg-white px-3 text-[12.5px] font-medium">{meta?.involvementStatuses.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
                : <Badge tone="neutral">{labelOf(meta?.involvementStatuses, p.involvement_status)}</Badge>)}
              {kind === 'witnesses' && (canEdit
                ? <select aria-label={`Follow-up for ${p.full_name}`} value={p.follow_up_status} onChange={(e) => patch.mutate({ id: p.id, body: { follow_up_status: e.target.value } })} className="h-8 rounded-full border border-line-strong bg-white px-3 text-[12.5px] font-medium">{meta?.followUpStatuses.map((o) => <option key={o.value} value={o.value}>Follow-up: {o.label}</option>)}</select>
                : <Badge tone="neutral">Follow-up: {labelOf(meta?.followUpStatuses, p.follow_up_status)}</Badge>)}
              {kind === 'victims' && p.victim_type && <Badge tone="neutral" dot={false}>{labelOf(meta?.victimTypes, p.victim_type)}</Badge>}
              {canEdit && <button aria-label={`Unlink ${p.full_name}`} title="Unlink from this case" onClick={() => setUnlinking(p)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-mist hover:text-danger"><Unlink size={16} /></button>}
            </li>
          ))}
        </ul>
      )}
      {linking && <LinkPersonDialog caseId={detail.case.id} kind={kind} onClose={() => setLinking(false)} />}
      {creating && <EntityFormDialog cfg={cfg} onClose={() => setCreating(false)} onSaved={(id) => void linkNew(id)} />}
      {unlinking && <ConfirmDialog title={`Unlink ${unlinking.full_name}?`} confirmLabel="Unlink" loading={unlink.isPending} onConfirm={() => unlink.mutate(unlinking)} onClose={() => setUnlinking(null)}
        message={<p>Removes the link between this person and {detail.case.case_number}. The person’s record and their links to other cases stay.</p>} />}
    </Card>
  );
}

export default function CaseDetail() {
  const { id } = useParams();
  const meta = useMeta().data;
  const qc = useQueryClient();
  const toast = useToast();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') ?? 'overview') as 'overview' | 'people' | 'evidence' | 'clues' | 'notes' | 'activity';
  const [editing, setEditing] = useState(false);
  const [assign, setAssign] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [archiveAsk, setArchiveAsk] = useState(false);
  const [addEvidence, setAddEvidence] = useState(false);
  const [addClue, setAddClue] = useState(false);
  const [note, setNote] = useState('');

  const q = useQuery({ queryKey: ['case', id], queryFn: () => api.get<Detail>(`/cases/${id}`) });
  const status = useMutation({
    mutationFn: (v: { status: CaseStatus; resolution?: string }) => api.patch(`/cases/${id}/status`, { status: v.status, version: q.data!.case.version, ...(v.resolution ? { resolution: v.resolution } : {}) }),
    onSuccess: (_r, v) => { void qc.invalidateQueries(); toast.success(`Case moved to ${labelOf(meta?.caseStatuses, v.status)}.`); setClosing(false); },
    onError: (e) => { const m = e instanceof ApiError && e.code === 'VERSION_CONFLICT' ? 'Someone else changed this case just now. It has been reloaded: try again.' : errText(e); if (closing) setCloseError(m); else toast.error(m); void qc.invalidateQueries({ queryKey: ['case'] }); },
  });
  const archive = useMutation({
    mutationFn: (on: boolean) => api.post(`/cases/${id}/${on ? 'archive' : 'unarchive'}`),
    onSuccess: (_r, on) => { void qc.invalidateQueries(); toast.success(on ? 'Case archived. Nothing was deleted.' : 'Case restored.'); setArchiveAsk(false); }, onError: (e) => { toast.error(errText(e)); setArchiveAsk(false); },
  });
  const removeInv = useMutation({
    mutationFn: (uid: number) => api.del(`/cases/${id}/investigators/${uid}`),
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Investigator removed from the case.'); }, onError: (e) => toast.error(errText(e)),
  });
  const addNote = useMutation({
    mutationFn: () => api.post(`/cases/${id}/notes`, { body: note.trim() }),
    onSuccess: () => { setNote(''); void qc.invalidateQueries(); toast.success('Note added.'); }, onError: (e) => toast.error(errText(e)),
  });

  if (q.isPending) return <div><TopBand /><div className="space-y-4 px-5 pt-8 sm:px-8"><Skeleton className="h-10 w-96" /><Skeleton className="h-72" /></div></div>;
  if (q.isError) return <div><TopBand /><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>;
  const d = q.data;
  const c = d.case;
  const p = d.permissions;
  const setTab = (t: string) => setSp((prev) => { const n = new URLSearchParams(prev); n.set('tab', t); return n; }, { replace: true });

  return (
    <div className="pb-14">
      <TopBand />
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-6 sm:px-8">
        <div className="min-w-0">
          <Link to="/cases" className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"><ArrowLeft size={14} />Cases</Link>
          <p className="text-[13px] font-medium text-muted tabular">{c.case_number}</p>
          <h1 className="max-w-3xl text-[26px] font-semibold leading-tight tracking-tight sm:text-[30px]">{c.title}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(c.status)}>{labelOf(meta?.caseStatuses, c.status)}{c.resolution ? ` · ${labelOf(meta?.caseResolutions, c.resolution)}` : ''}</Badge>
            <Badge tone={priorityTone(c.priority)}>{labelOf(meta?.casePriorities, c.priority)} priority</Badge>
            <Badge tone="neutral" dot={false}>{labelOf(meta?.crimeTypes, c.crime_type)}</Badge>
            {c.is_archived ? <Badge tone="neutral" dot={false}><Archive size={11} />Archived</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to={`/graph?focus=case:${c.id}`}><Button variant="secondary" icon={<Network size={16} />}>View in graph</Button></Link>
          {p.can_edit && <Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>Edit</Button>}
          {p.can_edit && (
            <Menu label="Change status" align="right" trigger={<span className="inline-flex h-10 items-center gap-2 rounded-xl border border-line-strong bg-white px-4 text-[14px] font-medium text-ink"><MoveRight size={16} />Status</span>}
              items={(meta?.caseStatuses ?? []).filter((s) => s.value !== c.status).map((s) => ({ label: `Move to ${s.label}`, onClick: () => { if (s.value === 'closed') { setCloseError(''); setClosing(true); } else status.mutate({ status: s.value as CaseStatus }); } }))} />
          )}
          {p.can_archive && (c.is_archived ? <Button variant="secondary" icon={<ArchiveRestore size={16} />} onClick={() => archive.mutate(false)}>Restore</Button>
            : c.status === 'closed' && <Button variant="secondary" icon={<Archive size={16} />} onClick={() => setArchiveAsk(true)}>Archive</Button>)}
        </div>
      </div>
      {c.is_archived ? <div className="mx-5 mb-4 rounded-xl border border-line-strong bg-white px-4 py-3 text-[13.5px] sm:mx-8"><Archive size={15} className="mr-2 inline" />This case is archived and read-only. Every linked record is still here; a chief investigator can restore it.</div> : null}

      <Tabs value={tab} onChange={setTab} tabs={[
        { id: 'overview', label: 'Overview' },
        { id: 'people', label: 'People', count: d.suspects.length + d.victims.length + d.witnesses.length },
        { id: 'evidence', label: 'Evidence', count: d.evidence.length },
        { id: 'clues', label: 'Clues', count: d.clues.length },
        { id: 'notes', label: 'Notes', count: d.notes.length },
        { id: 'activity', label: 'Activity' },
      ]} />

      <div className="px-5 pt-5 sm:px-8">
        {tab === 'overview' && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
            <div className="min-w-0 space-y-4">
              <Card>
                <SectionTitle>What happened</SectionTitle>
                <p className="whitespace-pre-wrap text-[14.5px] leading-relaxed">{c.description || <span className="text-muted">No description recorded.</span>}</p>
                <dl className="mt-5 grid gap-4 border-t border-line pt-4 sm:grid-cols-3">
                  <div><dt className="flex items-center gap-1.5 text-[12.5px] text-muted"><CalendarDays size={13} />Incident date</dt><dd className="mt-0.5 font-medium">{fmtDate(c.incident_date)}</dd></div>
                  <div className="sm:col-span-2"><dt className="flex items-center gap-1.5 text-[12.5px] text-muted"><MapPin size={13} />Location</dt><dd className="mt-0.5 font-medium">{c.location_id ? <Link className="hover:underline" to={`/locations/${c.location_id}`}>{c.location_name}</Link> : 'Not recorded'}{c.location_address && <span className="block text-[12.5px] font-normal text-muted">{c.location_address}</span>}</dd></div>
                  <div><dt className="text-[12.5px] text-muted">Opened</dt><dd className="mt-0.5">{fmtDate(c.created_at)}{c.created_by_name ? ` by ${c.created_by_name}` : ''}</dd></div>
                  <div><dt className="text-[12.5px] text-muted">Last updated</dt><dd className="mt-0.5">{timeAgo(c.updated_at)}</dd></div>
                  {c.closed_at && <div><dt className="text-[12.5px] text-muted">Closed</dt><dd className="mt-0.5">{fmtDate(c.closed_at)}</dd></div>}
                </dl>
              </Card>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
                {[['Suspects', c.suspect_count, 'people'], ['Victims', c.victim_count, 'people'], ['Witnesses', c.witness_count, 'people'], ['Evidence', c.evidence_count, 'evidence'], ['Clues', c.clue_count, 'clues']].map(([l, n, t]) => (
                  <button key={String(l)} onClick={() => setTab(String(t))} className="rounded-[14px] border border-line bg-white p-4 text-left transition hover:border-ink"><p className="text-[30px] font-semibold leading-none tabular">{n}</p><p className="mt-1 text-[12.5px] text-muted">{l}</p></button>
                ))}
              </div>
            </div>
            <Card>
              <SectionTitle aside={p.can_assign && <Button size="sm" variant="secondary" icon={<UserPlus size={14} />} onClick={() => setAssign(true)}>Assign</Button>}>Investigators</SectionTitle>
              <ul className="divide-y divide-line">
                {d.investigators.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <Avatar name={i.full_name} size={34} />
                    <div className="min-w-0 flex-1"><Link to={`/investigators/${i.id}`} className="block truncate text-[14px] font-medium hover:underline">{i.full_name}</Link><p className="text-[12.5px] text-muted">{i.assignment_role === 'lead' ? 'Lead investigator' : 'Support'} · {humanize(i.role)}</p></div>
                    {p.can_assign && i.assignment_role !== 'lead' && <button aria-label={`Remove ${i.full_name}`} title="Remove from case" onClick={() => removeInv.mutate(i.id)} className="flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-mist hover:text-danger"><X size={16} /></button>}
                  </li>
                ))}
                {!d.investigators.length && <li className="py-4 text-center text-[13px] text-muted">Nobody assigned yet.</li>}
              </ul>
            </Card>
          </div>
        )}

        {tab === 'people' && <div className="space-y-4">{(['suspects', 'victims', 'witnesses'] as Kind[]).map((k) => <PersonList key={k} detail={d} kind={k} />)}</div>}

        {tab === 'evidence' && (
          <Card>
            <SectionTitle aside={p.can_add_evidence && <Button size="sm" icon={<Plus size={14} />} onClick={() => setAddEvidence(true)}>Add evidence</Button>}>Evidence <span className="text-muted">({d.evidence.length})</span></SectionTitle>
            {d.evidence.length === 0 ? <EmptyState title="No evidence logged" hint="Every item gets its own chain of custody." /> : (
              <ul className="divide-y divide-line">
                {d.evidence.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1"><Link to={`/evidence/${e.id}`} className="text-[14.5px] font-medium hover:underline">{e.title}</Link><p className="text-[12.5px] text-muted"><span className="tabular">{e.evidence_code}</span> · {labelOf(meta?.evidenceCategories, e.category)} · collected {fmtDate(e.collected_at)} · with {e.custodian_name}</p></div>
                    <Badge tone={statusTone(e.status)}>{labelOf(meta?.evidenceStatuses, e.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'clues' && (
          <Card>
            <SectionTitle aside={p.can_edit && <Button size="sm" icon={<Plus size={14} />} onClick={() => setAddClue(true)}>Add clue</Button>}>Clues <span className="text-muted">({d.clues.length})</span></SectionTitle>
            {d.clues.length === 0 ? <EmptyState title="No clues recorded" /> : (
              <ul className="divide-y divide-line">
                {d.clues.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0">
                    <div className="min-w-0 flex-1"><Link to={`/clues/${k.id}`} className="text-[14.5px] font-medium hover:underline">{k.title}</Link><p className="text-[12.5px] text-muted"><span className="tabular">{k.clue_code}</span> · discovered {fmtDate(k.discovered_at)}{k.source ? ` · ${k.source}` : ''}</p></div>
                    <Badge tone={statusTone(k.confidence)}>Confidence: {labelOf(meta?.confidenceLevels, k.confidence)}</Badge>
                    <Badge tone={statusTone(k.status)}>{labelOf(meta?.clueStatuses, k.status)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {tab === 'notes' && (
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <Card>
              <SectionTitle>Case notes</SectionTitle>
              {d.notes.length === 0 ? <EmptyState title="No notes yet" /> : (
                <ul className="space-y-4">{d.notes.map((n) => (
                  <li key={n.id} className="flex gap-3"><Avatar name={n.author} size={32} /><div className="min-w-0 flex-1 rounded-2xl rounded-tl-md bg-mist px-4 py-3"><p className="whitespace-pre-wrap text-[14px]">{n.body}</p><p className="mt-1.5 text-[12px] text-muted">{n.author} · {fmtDateTime(n.created_at)}</p></div></li>
                ))}</ul>
              )}
            </Card>
            {p.can_edit && (
              <Card className="h-fit">
                <SectionTitle>Add a note</SectionTitle>
                <TextArea label="Note" value={note} onChange={(e) => setNote(e.target.value)} rows={5} maxLength={2000} placeholder="Interview summary, decision, follow-up…" hint="Notes are part of the permanent case record." />
                <Button className="mt-3" loading={addNote.isPending} disabled={!note.trim()} onClick={() => addNote.mutate()}>Add note</Button>
              </Card>
            )}
          </div>
        )}

        {tab === 'activity' && (
          <Card>
            <SectionTitle>Activity</SectionTitle>
            <ul className="space-y-3.5">{d.activity.map((a) => (
              <li key={a.id} className="flex gap-3"><span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-ink" /><div><p className="text-[14px]">{a.summary}</p><p className="text-[12px] text-muted">{a.user_name ?? 'System'} · {fmtDateTime(a.created_at)}</p></div></li>
            ))}</ul>
          </Card>
        )}
      </div>

      {editing && <CaseFormDialog existing={{ ...c, investigators: d.investigators } as CaseRow} onClose={() => setEditing(false)} />}
      {assign && <AssignDialog detail={d} onClose={() => setAssign(false)} />}
      {closing && <ResolutionDialog target={{ ...c, investigators: d.investigators } as CaseRow} busy={status.isPending} error={closeError} onClose={() => setClosing(false)} onConfirm={(resolution) => status.mutate({ status: 'closed', resolution })} />}
      {archiveAsk && <ConfirmDialog title="Archive this case?" confirmLabel="Archive" loading={archive.isPending} onConfirm={() => archive.mutate(true)} onClose={() => setArchiveAsk(false)}
        message={<p>{c.case_number} becomes read-only and leaves the default lists. Suspects, victims, witnesses, evidence, clues and custody history are all kept, and it can be restored later.</p>} />}
      {addEvidence && <EntityFormDialog cfg={ENTITY_CONFIG.evidence} presetCase={c.id} onClose={() => setAddEvidence(false)} />}
      {addClue && <EntityFormDialog cfg={ENTITY_CONFIG.clue} presetCase={c.id} onClose={() => setAddClue(false)} />}
    </div>
  );
}
