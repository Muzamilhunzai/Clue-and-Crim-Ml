import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { useLookups, useMeta } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import type { CaseDetail, CaseRow } from '@/types';
import { Button, InlineError, Modal } from '@/components/ui/primitives';
import { SelectField, TextArea, TextField } from '@/components/ui/forms';

/** Create or edit a case. Edits send the version the form was loaded with: a stale version is refused (optimistic locking). */
export function CaseFormDialog({ existing, onClose, onSaved }: { existing?: CaseRow; onClose: () => void; onSaved?: (id: number) => void }) {
  const meta = useMeta().data;
  const lookups = useLookups().data;
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState({
    title: existing?.title ?? '',
    crime_type: existing?.crime_type ?? '',
    incident_date: existing?.incident_date ?? todayIso(),
    location_id: existing?.location_id ? String(existing.location_id) : '',
    priority: existing?.priority ?? 'medium',
    description: existing?.description ?? '',
    lead_id: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const set = (k: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        title: form.title.trim(), crime_type: form.crime_type, incident_date: form.incident_date, priority: form.priority,
        description: form.description.trim(), location_id: form.location_id ? Number(form.location_id) : null,
      };
      if (existing) return api.patch<CaseDetail>(`/cases/${existing.id}`, { ...body, version: existing.version });
      if (can('case:assign') && form.lead_id) body.lead_id = Number(form.lead_id);
      return api.post<CaseDetail>('/cases', body);
    },
    onSuccess: (res) => {
      void qc.invalidateQueries();
      toast.success(existing ? 'Case updated.' : `Case ${res.case.case_number} opened.`);
      onSaved?.(res.case.id);
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) { setErrors(e.fields); setFormError(Object.keys(e.fields).length ? 'Please fix the highlighted fields.' : e.message); }
      else setFormError('Could not save the case.');
    },
  });

  const assignable = (lookups?.users ?? []).filter((u) => u.role !== 'evidence_officer');
  return (
    <Modal title={existing ? `Edit ${existing.case_number}` : 'Open a new case'} subtitle={existing ? undefined : 'A case number is generated automatically.'} onClose={onClose} width={600}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={() => { setErrors({}); setFormError(''); save.mutate(); }}>{existing ? 'Save changes' : 'Open case'}</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); setErrors({}); setFormError(''); save.mutate(); }} noValidate>
        <TextField label="Title" required className="sm:col-span-2" value={form.title} onChange={set('title')} error={errors.title} placeholder="e.g. Harbor Street jewellery burglary" maxLength={160} />
        <SelectField label="Crime type" required value={form.crime_type} onChange={set('crime_type')} options={meta?.crimeTypes ?? []} placeholder="Select a type" error={errors.crime_type} />
        <SelectField label="Priority" value={form.priority} onChange={set('priority')} options={meta?.casePriorities ?? []} error={errors.priority} />
        <TextField label="Incident date" required type="date" max={todayIso()} value={form.incident_date} onChange={set('incident_date')} error={errors.incident_date} />
        <SelectField label="Incident location" value={form.location_id} onChange={set('location_id')} placeholder="Not recorded"
          options={(lookups?.locations ?? []).map((l) => ({ value: l.id, label: l.name }))} error={errors.location_id} />
        {!existing && can('case:assign') && (
          <SelectField label="Lead investigator" className="sm:col-span-2" value={form.lead_id} onChange={set('lead_id')} placeholder="Me (default)"
            options={assignable.map((u) => ({ value: u.id, label: u.full_name }))} hint="Support investigators can be added from the case page." />
        )}
        <TextArea label="Description" className="sm:col-span-2" value={form.description} onChange={set('description')} error={errors.description} placeholder="What happened, where, and what is known so far." maxLength={4000} />
        {formError && <div className="sm:col-span-2"><InlineError>{formError}</InlineError></div>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
