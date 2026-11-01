import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, CircleCheck, CircleAlert, PackagePlus, Repeat } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { useLookups, useMeta } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import type { CustodyEntry } from '@/types';
import { Avatar, Button, InlineError, Modal } from '@/components/ui/primitives';
import { SelectField, TextArea, TextField } from '@/components/ui/forms';

export function CustodyTimeline({ entries, check }: { entries: CustodyEntry[]; check?: { ok: boolean; entries: number; problems: string[] } }) {
  return (
    <div>
      {check && (
        <div role="status" className={`mb-4 flex items-start gap-2 rounded-xl px-3 py-2.5 text-[13px] ${check.ok ? 'bg-ok-soft text-ok' : 'bg-danger-soft text-danger'}`}>
          {check.ok ? <CircleCheck size={16} className="mt-0.5 shrink-0" /> : <CircleAlert size={16} className="mt-0.5 shrink-0" />}
          <span>{check.ok ? `Chain is consistent: ${check.entries} entr${check.entries === 1 ? 'y' : 'ies'}, each handover starts with the previous holder.` : `Problems found: ${check.problems.join('; ')}`}</span>
        </div>
      )}
      <ol className="relative space-y-0">
        {entries.map((e, i) => {
          const last = i === entries.length - 1;
          return (
            <li key={e.id} className="relative flex gap-4 pb-5 last:pb-0">
              {!last && <span aria-hidden className="absolute left-[15px] top-8 h-[calc(100%-1.5rem)] w-px bg-line-strong" />}
              <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold tabular ${last ? 'bg-ink text-white' : 'border border-line-strong bg-white text-muted'}`}>{e.seq}</span>
              <div className="min-w-0 flex-1 rounded-xl border border-line bg-white px-4 py-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px]">
                  {e.from_name ? (<><Avatar name={e.from_name} size={22} /><span className="font-medium">{e.from_name}</span><ArrowRight size={14} className="text-muted" /></>) : <span className="inline-flex items-center gap-1.5 text-muted"><PackagePlus size={15} />Intake</span>}
                  <Avatar name={e.to_name} size={22} /><span className="font-semibold">{e.to_name}</span>
                  {last && <span className="rounded-full bg-ink px-2 py-0.5 text-[11px] font-medium text-white">Current holder</span>}
                </div>
                <p className="mt-1.5 text-[13.5px]">{e.reason}</p>
                <p className="mt-1 text-[12px] text-muted">{fmtDateTime(e.transferred_at)} · recorded by {e.transferred_by_name}{e.storage_location ? ` · ${e.storage_location}` : ''}</p>
              </div>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-[12px] text-muted">Entries can only be added, never edited or removed: the database refuses UPDATE and DELETE on this log. This is a recorded history, not tamper-proof storage.</p>
    </div>
  );
}

export function TransferDialog({ evidenceId, code, currentHolderId, currentStatus, onClose }: { evidenceId: number; code: string; currentHolderId: number; currentStatus: string; onClose: () => void }) {
  const lookups = useLookups().data;
  const meta = useMeta().data;
  const toast = useToast();
  const qc = useQueryClient();
  const [to, setTo] = useState('');
  const [reason, setReason] = useState('');
  const [storage, setStorage] = useState('');
  const [status, setStatus] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  const save = useMutation({
    mutationFn: () => api.post(`/evidence/${evidenceId}/custody`, { to_custodian_id: Number(to), reason: reason.trim(), storage_location: storage.trim() || undefined, status: status || undefined }),
    onSuccess: () => { void qc.invalidateQueries(); toast.success(`Custody of ${code} recorded.`); onClose(); },
    onError: (e) => { if (e instanceof ApiError) { setErrors(e.fields); setFormError(e.message); } else setFormError('Could not record the transfer.'); },
  });
  const submit = () => {
    setErrors({}); setFormError('');
    const miss: Record<string, string> = {};
    if (!to) miss.to_custodian_id = 'Choose the new custodian.';
    if (reason.trim().length < 3) miss.reason = 'Give a reason (at least 3 characters).';
    if (Object.keys(miss).length) { setErrors(miss); return; }
    save.mutate();
  };
  return (
    <Modal title={`Transfer custody of ${code}`} subtitle="Adds a new entry to the chain of custody. Previous entries are never changed." onClose={onClose} width={520}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} icon={<Repeat size={16} />} onClick={submit}>Record transfer</Button></>}>
      <div className="grid gap-4">
        <SelectField label="New custodian" required value={to} onChange={(e) => setTo(e.target.value)} placeholder="Choose a person…" error={errors.to_custodian_id}
          options={(lookups?.users ?? []).filter((u) => u.id !== currentHolderId).map((u) => ({ value: u.id, label: u.full_name }))} hint="Only active staff can hold evidence." />
        <TextArea label="Reason for transfer" required value={reason} onChange={(e) => setReason(e.target.value)} error={errors.reason} placeholder="e.g. Sent to the forensic lab for fingerprint analysis" maxLength={300} />
        <TextField label="Storage location" value={storage} onChange={(e) => setStorage(e.target.value)} placeholder="Optional" maxLength={120} />
        <SelectField label="Status after transfer" value={status} onChange={(e) => setStatus(e.target.value)} placeholder={`Keep current (${currentStatus.replace('_', ' ')})`} options={meta?.evidenceStatuses ?? []} />
        <InlineError>{formError}</InlineError>
      </div>
    </Modal>
  );
}
