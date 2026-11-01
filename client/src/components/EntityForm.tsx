import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { todayIso } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { useLookups, useMeta } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import type { EntityRecord } from '@/types';
import type { EntityConfig, FieldSpec } from '@/lib/entityConfig';
import { Button, InlineError, Modal } from '@/components/ui/primitives';
import { Checkbox, SelectField, TextArea, TextField } from '@/components/ui/forms';

type Values = Record<string, string | boolean>;

const initial = (cfg: EntityConfig, rec?: EntityRecord, presetCase?: number): Values => {
  const v: Values = {};
  for (const f of cfg.fields) {
    const raw = rec?.[f.name];
    if (f.kind === 'checkbox') v[f.name] = raw === 1 || raw === true;
    else if (rec) v[f.name] = raw === null || raw === undefined ? '' : String(raw).slice(0, f.kind === 'date' ? 10 : undefined);
    else v[f.name] = f.name === 'case_id' && presetCase ? String(presetCase) : f.name === 'discovered_at' || f.name === 'collected_at' ? todayIso() : '';
  }
  return v;
};

/** One form for every plain record type, driven by the field list in entityConfig. Server validation errors map onto the fields. */
export function EntityFormDialog({ cfg, existing, presetCase, onClose, onSaved }: {
  cfg: EntityConfig; existing?: EntityRecord; presetCase?: number; onClose: () => void; onSaved?: (id: number) => void;
}) {
  const meta = useMeta().data;
  const lookups = useLookups().data;
  const { can } = useAuth();
  const toast = useToast();
  const qc = useQueryClient();
  const [values, setValues] = useState<Values>(() => initial(cfg, existing, presetCase));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const masked = new Set(existing?.restricted_fields ?? []);
  const set = (name: string, v: string | boolean) => setValues((s) => ({ ...s, [name]: v }));

  const visible = cfg.fields.filter((f) => {
    if (existing ? f.createOnly : f.editOnly) return false;
    if (f.name === 'is_protected' && !can('protected:view')) return false;
    if (f.restricted && !existing && !can('sensitive:view')) return false;
    return true;
  });

  const save = useMutation({
    mutationFn: () => {
      const body: Record<string, unknown> = {};
      for (const f of visible) {
        if (existing && f.restricted && masked.size) continue;        // the server hides these from this user: do not send them back
        const v = values[f.name];
        if (f.kind === 'checkbox') { body[f.name] = v ? 1 : 0; continue; }
        if (f.kind === 'number') { body[f.name] = v === '' ? null : Number(v); continue; }
        if (v === '') {
          // empty optional text/date/location clears the value when editing; enums and required fields are simply left out
          if (existing && !f.required && (f.kind === 'text' || f.kind === 'textarea' || f.kind === 'date' || f.kind === 'location')) body[f.name] = null;
          continue;
        }
        body[f.name] = v;
      }
      return existing ? api.patch<{ record: EntityRecord }>(`/${cfg.apiPath}/${existing.id}`, body) : api.post<{ record: EntityRecord }>(`/${cfg.apiPath}`, body);
    },
    onSuccess: (res) => {
      void qc.invalidateQueries();
      toast.success(existing ? `${cfg.singular} updated.` : `${cfg.singular} created.`);
      onSaved?.(res.record.id);
      onClose();
    },
    onError: (e) => {
      if (e instanceof ApiError) { setErrors(e.fields); setFormError(Object.keys(e.fields).length ? 'Please fix the highlighted fields.' : e.message); }
      else setFormError('Could not save.');
    },
  });

  const options = (f: FieldSpec) => (f.options ? ((meta?.[f.options] as { value: string; label: string }[] | undefined) ?? []) : []);
  const render = (f: FieldSpec) => {
    const lockedOut = !!existing && !!f.restricted && masked.size > 0;
    const common = { label: f.label, error: errors[f.name], hint: lockedOut ? 'Restricted for your role.' : f.hint, required: f.required, locked: lockedOut, className: f.wide ? 'sm:col-span-2' : undefined };
    const v = values[f.name];
    switch (f.kind) {
      case 'textarea': return <TextArea key={f.name} {...common} value={String(v)} onChange={(e) => set(f.name, e.target.value)} disabled={lockedOut} maxLength={4000} />;
      case 'select': return <SelectField key={f.name} {...common} value={String(v)} onChange={(e) => set(f.name, e.target.value)} options={options(f)} placeholder={f.required ? 'Select…' : 'Not specified'} disabled={lockedOut} />;
      case 'case': return <SelectField key={f.name} {...common} value={String(v)} onChange={(e) => set(f.name, e.target.value)} placeholder="Select a case…"
        options={(lookups?.cases ?? []).filter((c) => !c.is_archived).map((c) => ({ value: c.id, label: `${c.case_number} · ${c.title}` }))} />;
      case 'location': return <SelectField key={f.name} {...common} value={String(v)} onChange={(e) => set(f.name, e.target.value)} placeholder="Not recorded"
        options={(lookups?.locations ?? []).map((l) => ({ value: l.id, label: l.name }))} />;
      case 'checkbox': return <div key={f.name} className="sm:col-span-2"><Checkbox label={f.label} hint={f.hint} checked={!!v} onChange={(c) => set(f.name, c)} disabled={lockedOut} /></div>;
      case 'date': return <TextField key={f.name} {...common} type="date" max={f.name === 'date_of_birth' || f.name.endsWith('_at') ? todayIso() : undefined} value={String(v)} onChange={(e) => set(f.name, e.target.value)} disabled={lockedOut} />;
      case 'number': return <TextField key={f.name} {...common} type="number" step="any" value={String(v)} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} />;
      default: return <TextField key={f.name} {...common} value={String(v)} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} disabled={lockedOut} maxLength={200} />;
    }
  };

  const submit = () => { setErrors({}); setFormError(''); save.mutate(); };
  return (
    <Modal title={existing ? `Edit ${cfg.singular.toLowerCase()}` : `New ${cfg.singular.toLowerCase()}`} onClose={onClose} width={620}
      subtitle={cfg.type === 'evidence' && !existing ? 'The first chain-of-custody entry is created automatically, with you as custodian.' : undefined}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={save.isPending} onClick={submit}>{existing ? 'Save changes' : `Create ${cfg.singular.toLowerCase()}`}</Button></>}>
      <form className="grid gap-4 sm:grid-cols-2" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
        {visible.map(render)}
        {formError && <div className="sm:col-span-2"><InlineError>{formError}</InlineError></div>}
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
