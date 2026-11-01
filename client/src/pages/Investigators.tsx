import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, KeyRound, Mail, Pencil, Phone, Plus, ShieldCheck, UserCog } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { fmtDate, fmtDateTime, humanize, timeAgo } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { labelOf, useMeta } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import type { Investigator } from '@/types';
import { TopBand } from '@/components/TopBand';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, InlineError, Modal, PageHeader, priorityTone, SectionTitle, Skeleton, statusTone } from '@/components/ui/primitives';
import { Checkbox, SelectField, TextField } from '@/components/ui/forms';

const roleTone = (r: string) => (r === 'chief_investigator' ? 'ink' : r === 'evidence_officer' ? 'info' : 'neutral') as 'ink' | 'info' | 'neutral';

function InvestigatorForm({ existing, onClose }: { existing?: Investigator; onClose: () => void }) {
  const meta = useMeta().data;
  const qc = useQueryClient();
  const toast = useToast();
  const [v, setV] = useState({
    username: existing?.username ?? '', full_name: existing?.full_name ?? '', email: existing?.email ?? '', role: existing?.role ?? 'investigator',
    badge_number: existing?.badge_number ?? '', department: existing?.department ?? '', phone: existing?.phone ?? '', password: '', is_active: existing ? !!existing.is_active : true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const set = (k: string) => (e: { target: { value: string } }) => setV((s) => ({ ...s, [k]: e.target.value }));
  const save = useMutation({
    mutationFn: () => existing
      ? api.patch(`/investigators/${existing.id}`, { full_name: v.full_name, email: v.email, role: v.role, badge_number: v.badge_number, department: v.department || null, phone: v.phone || null, is_active: v.is_active ? 1 : 0 })
      : api.post('/investigators', { username: v.username, full_name: v.full_name, email: v.email, role: v.role, badge_number: v.badge_number, department: v.department || undefined, phone: v.phone || undefined, password: v.password }),
    onSuccess: () => { void qc.invalidateQueries(); toast.success(existing ? 'Investigator updated.' : 'Investigator added.'); onClose(); },
    onError: (e) => { if (e instanceof ApiError) { setErrors(e.fields); setFormError(Object.keys(e.fields).length ? 'Please fix the highlighted fields.' : e.message); } else setFormError('Could not save.'); },
  });
  const submit = () => { setErrors({}); setFormError(''); save.mutate(); };
  return (
    <Modal title={existing ? `Edit ${existing.full_name}` : 'Add an investigator'} onClose={onClose} width={600}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={submit}>{existing ? 'Save changes' : 'Add investigator'}</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <TextField label="Full name" required value={v.full_name} onChange={set('full_name')} error={errors.full_name} className="sm:col-span-2" />
        {!existing && <TextField label="Username" required value={v.username} onChange={set('username')} error={errors.username} autoComplete="off" />}
        <TextField label="Email" required type="email" value={v.email} onChange={set('email')} error={errors.email} className={existing ? 'sm:col-span-2' : undefined} />
        <SelectField label="Role" value={v.role} onChange={set('role')} options={meta?.roles ?? []} error={errors.role} />
        <TextField label="Badge number" required value={v.badge_number} onChange={set('badge_number')} error={errors.badge_number} />
        <TextField label="Department" value={v.department} onChange={set('department')} error={errors.department} />
        <TextField label="Phone" value={v.phone} onChange={set('phone')} error={errors.phone} />
        {!existing && <TextField label="Initial password" required type="password" autoComplete="new-password" value={v.password} onChange={set('password')} error={errors.password} hint="At least 10 characters with a letter and a number." className="sm:col-span-2" />}
        {existing && <div className="sm:col-span-2"><Checkbox label="Account is active" hint="Deactivated people are signed out everywhere and cannot sign in." checked={v.is_active} onChange={(c) => setV((s) => ({ ...s, is_active: c }))} /></div>}
        {formError && <div className="sm:col-span-2"><InlineError>{formError}</InlineError></div>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}

function ResetPasswordDialog({ person, onClose }: { person: Investigator; onClose: () => void }) {
  const toast = useToast();
  const [pw, setPw] = useState('');
  const [error, setError] = useState('');
  const save = useMutation({
    mutationFn: () => api.post(`/investigators/${person.id}/reset-password`, { password: pw }),
    onSuccess: () => { toast.success(`Password reset for ${person.full_name}. They were signed out everywhere.`); onClose(); },
    onError: (e) => setError(e instanceof ApiError ? (e.fields.password ?? e.message) : 'Could not reset.'),
  });
  return (
    <Modal title={`Reset password for ${person.full_name}`} onClose={onClose} width={440}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => { setError(''); save.mutate(); }}>Reset password</Button></>}>
      <TextField label="New password" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} hint="At least 10 characters with a letter and a number. Share it securely; they should change it after signing in." error={error} />
    </Modal>
  );
}

export function InvestigatorsList() {
  const nav = useNavigate();
  const { can } = useAuth();
  const q = useQuery({ queryKey: ['investigators'], queryFn: () => api.get<{ items: Investigator[] }>('/investigators') });
  const [adding, setAdding] = useState(false);
  const max = Math.max(1, ...(q.data?.items ?? []).map((i) => i.active_cases));
  return (
    <div className="pb-14">
      <TopBand>{can('investigator:manage') && <Button onClick={() => setAdding(true)} icon={<Plus size={17} />} className="h-9 rounded-full pl-3.5 pr-4">Add</Button>}</TopBand>
      <PageHeader title="Investigators" subtitle="Team members, roles and current workloads. Contact details are visible to the chief investigator." />
      <div className="px-5 sm:px-8">
        {q.isError ? <ErrorState error={q.error} onRetry={() => void q.refetch()} /> : (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {q.isPending && [0, 1, 2].map((i) => <Skeleton key={i} className="h-44 rounded-[14px]" />)}
            {q.data?.items.map((p) => (
              <button key={p.id} onClick={() => nav(`/investigators/${p.id}`)} className={`rounded-[14px] border border-line bg-white p-5 text-left transition hover:border-ink ${p.is_active ? '' : 'opacity-60'}`}>
                <div className="flex items-center gap-3">
                  <Avatar name={p.full_name} size={46} />
                  <div className="min-w-0"><p className="truncate text-[16px] font-semibold">{p.full_name}</p><div className="mt-1 flex flex-wrap gap-1.5"><Badge tone={roleTone(p.role)} dot={false}>{humanize(p.role)}</Badge>{!p.is_active && <Badge tone="neutral">Deactivated</Badge>}</div></div>
                </div>
                <div className="mt-5">
                  <div className="mb-1.5 flex justify-between text-[12.5px]"><span className="text-muted">Active cases</span><span className="font-semibold tabular">{p.active_cases}</span></div>
                  <div className="h-2 overflow-hidden rounded-full bg-mist"><div className="h-full rounded-full bg-ink" style={{ width: `${(p.active_cases / max) * 100}%` }} /></div>
                  <p className="mt-2 text-[12.5px] text-muted tabular">Leads {p.leading} · closed {p.closed_cases}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
      {adding && <InvestigatorForm onClose={() => setAdding(false)} />}
    </div>
  );
}

export function InvestigatorDetail() {
  const { id } = useParams();
  const { can, user } = useAuth();
  const meta = useMeta().data;
  const [editing, setEditing] = useState(false);
  const [reset, setReset] = useState(false);
  const q = useQuery({ queryKey: ['investigators', id], queryFn: () => api.get<{ investigator: Investigator; cases: { id: number; case_number: string; title: string; status: string; priority: string; is_archived: number; assignment_role: string; updated_at: string }[] }>(`/investigators/${id}`) });
  if (q.isPending) return <div><TopBand /><div className="px-5 pt-8 sm:px-8"><Skeleton className="h-60" /></div></div>;
  if (q.isError) return <div><TopBand /><ErrorState error={q.error} onRetry={() => void q.refetch()} /></div>;
  const p = q.data.investigator;
  const manage = can('investigator:manage');
  return (
    <div className="pb-14">
      <TopBand />
      <div className="flex flex-wrap items-end justify-between gap-4 px-5 pb-5 pt-6 sm:px-8">
        <div>
          <Link to="/investigators" className="mb-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-muted hover:text-ink"><ArrowLeft size={14} />Investigators</Link>
          <div className="flex items-center gap-4"><Avatar name={p.full_name} size={56} /><div><h1 className="text-[28px] font-semibold leading-tight tracking-tight">{p.full_name}</h1><div className="mt-1.5 flex flex-wrap gap-2"><Badge tone={roleTone(p.role)} dot={false}><ShieldCheck size={11} />{humanize(p.role)}</Badge>{!p.is_active && <Badge tone="neutral">Deactivated</Badge>}{p.id === user?.id && <Badge tone="neutral" dot={false}>You</Badge>}</div></div></div>
        </div>
        {manage && <div className="flex gap-2"><Button variant="secondary" icon={<Pencil size={16} />} onClick={() => setEditing(true)}>Edit</Button><Button variant="secondary" icon={<KeyRound size={16} />} onClick={() => setReset(true)}>Reset password</Button></div>}
      </div>
      <div className="grid gap-4 px-5 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)]">
        <Card>
          <SectionTitle>Profile</SectionTitle>
          <dl className="space-y-3 text-[14px]">
            <div className="flex justify-between gap-4"><dt className="text-muted">Active cases</dt><dd className="font-semibold tabular">{p.active_cases}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Leading</dt><dd className="font-semibold tabular">{p.leading}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Closed cases</dt><dd className="font-semibold tabular">{p.closed_cases}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Department</dt><dd>{p.department ?? '-'}</dd></div>
            {p.badge_number ? <div className="flex justify-between gap-4"><dt className="text-muted">Badge</dt><dd className="tabular">{p.badge_number}</dd></div> : null}
            {p.email ? <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-1.5 text-muted"><Mail size={13} />Email</dt><dd className="truncate">{p.email}</dd></div> : null}
            {p.phone ? <div className="flex items-center justify-between gap-4"><dt className="flex items-center gap-1.5 text-muted"><Phone size={13} />Phone</dt><dd>{p.phone}</dd></div> : null}
            {p.last_login_at ? <div className="flex justify-between gap-4"><dt className="text-muted">Last sign-in</dt><dd>{fmtDateTime(p.last_login_at)}</dd></div> : null}
            <div className="flex justify-between gap-4"><dt className="text-muted">Joined</dt><dd>{fmtDate(p.created_at)}</dd></div>
          </dl>
          {!p.email && !manage && p.id !== user?.id && <p className="mt-4 rounded-xl bg-mist px-3 py-2 text-[12.5px] text-muted"><UserCog size={13} className="mr-1.5 inline" />Contact details are shown to the chief investigator only.</p>}
        </Card>
        <Card>
          <SectionTitle>Assigned cases <span className="text-muted">({q.data.cases.length})</span></SectionTitle>
          {q.data.cases.length === 0 ? <EmptyState title="No cases assigned" /> : (
            <ul className="divide-y divide-line">
              {q.data.cases.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                  <div className="min-w-0 flex-1"><Link to={`/cases/${c.id}`} className="text-[14px] font-medium hover:underline">{c.title}</Link><p className="text-[12.5px] text-muted"><span className="tabular">{c.case_number}</span> · {c.assignment_role === 'lead' ? 'Lead' : 'Support'} · updated {timeAgo(c.updated_at)}</p></div>
                  <Badge tone={priorityTone(c.priority)}>{labelOf(meta?.casePriorities, c.priority)}</Badge>
                  <Badge tone={statusTone(c.status)}>{labelOf(meta?.caseStatuses, c.status)}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
      {editing && <InvestigatorForm existing={p} onClose={() => setEditing(false)} />}
      {reset && <ResetPasswordDialog person={p} onClose={() => setReset(false)} />}
    </div>
  );
}
