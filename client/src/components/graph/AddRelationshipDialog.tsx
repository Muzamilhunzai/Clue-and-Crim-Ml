import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { humanize } from '@/lib/format';
import { useMeta } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import type { LookupItem, RelRules } from '@/types';
import { RecordPicker } from '@/components/RecordPicker';
import { Button, InlineError, Modal } from '@/components/ui/primitives';
import { SelectField, TextArea, TextField } from '@/components/ui/forms';

/**
 * Record an association between two records. Only combinations that make sense are offered
 * (rules come from the database table relationship_rules), and the server re-checks everything.
 */
export function AddRelationshipDialog({ from, onClose, onCreated }: { from?: LookupItem; onClose: () => void; onCreated: () => void }) {
  const toast = useToast();
  const qc = useQueryClient();
  const meta = useMeta().data;
  const rules = useQuery({ queryKey: ['rel-rules'], queryFn: () => api.get<RelRules>('/relationships/rules'), staleTime: 5 * 60_000 }).data;
  const [a, setA] = useState<LookupItem | null>(from ?? null);
  const [b, setB] = useState<LookupItem | null>(null);
  const [relation, setRelation] = useState('');
  const [confidence, setConfidence] = useState('unverified');
  const [description, setDescription] = useState('');
  const [source, setSource] = useState('');
  const [involvement, setInvolvement] = useState('person_of_interest');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');

  const info = useMemo(() => {
    if (!a || !b || !rules) return { options: [] as { value: string; label: string }[], structural: false, same: false, note: '' };
    if (a.type === b.type && a.id === b.id) return { options: [], structural: false, same: true, note: 'A record cannot be related to itself.' };
    const [x, y] = a.type <= b.type ? [a, b] : [b, a];
    if (x.type === 'case' && ['suspect', 'victim', 'witness'].includes(y.type)) {
      const s = rules.structural.find((r) => r.b_type === y.type)!;
      return { options: [{ value: s.relation_type, label: s.label }], structural: true, same: false, note: '' };
    }
    const codes = rules.pairs.filter((p) => p.a_type === x.type && p.b_type === y.type).map((p) => p.relation_type);
    const options = codes.map((c) => ({ value: c, label: rules.types.find((t) => t.code === c)?.label ?? humanize(c) }));
    return { options, structural: false, same: false, note: options.length ? '' : `A ${x.type} cannot be related to a ${y.type} here.` };
  }, [a, b, rules]);

  const effective = info.options.some((o) => o.value === relation) ? relation : info.options.length === 1 ? info.options[0].value : '';
  const suspectInvolved = info.structural && (a?.type === 'suspect' || b?.type === 'suspect');
  const typeDescription = rules?.types.find((t) => t.code === effective)?.description;

  const create = useMutation({
    mutationFn: () => api.post('/relationships', {
      a_type: a!.type, a_id: a!.id, b_type: b!.type, b_id: b!.id, relation_type: effective,
      confidence, description: description.trim() || undefined, source: source.trim() || undefined,
      ...(suspectInvolved ? { involvement_status: involvement } : {}),
    }),
    onSuccess: () => { void qc.invalidateQueries(); toast.success('Association recorded.'); onCreated(); onClose(); },
    onError: (e) => {
      if (e instanceof ApiError) { setErrors(e.fields); setFormError(e.message); } else setFormError('Could not record the association.');
    },
  });

  const submit = () => {
    setErrors({}); setFormError('');
    const miss: Record<string, string> = {};
    if (!a) miss.a = 'Choose the first record.';
    if (!b) miss.b = 'Choose the second record.';
    if (a && b && !effective) miss.relation_type = 'Choose a relationship type.';
    if (Object.keys(miss).length) { setErrors(miss); return; }
    create.mutate();
  };

  return (
    <Modal title="Record an association" subtitle="Links two records. It is a recorded association, not proof of anything." onClose={onClose} width={580}
      footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button loading={create.isPending} onClick={submit} disabled={info.same}>Record association</Button></>}>
      <div className="grid gap-4">
        <RecordPicker label="From record" value={a} onChange={(v) => { setA(v); setRelation(''); }} error={errors.a} />
        <RecordPicker label="To record" value={b} onChange={(v) => { setB(v); setRelation(''); }} error={errors.b} />
        {info.note && <InlineError>{info.note}</InlineError>}
        {a && b && !info.note && (
          <>
            <SelectField label="Relationship type" required value={effective} onChange={(e) => setRelation(e.target.value)} options={info.options} placeholder="Choose…"
              error={errors.relation_type} hint={typeDescription} />
            {suspectInvolved ? (
              <SelectField label="Involvement" value={involvement} onChange={(e) => setInvolvement(e.target.value)} options={meta?.involvementStatuses ?? []}
                hint="How the person is currently treated in this case. There is no 'guilty' status: that is for a court." />
            ) : (
              <>
                <SelectField label="Confidence" value={confidence} onChange={(e) => setConfidence(e.target.value)} options={meta?.confidenceLevels ?? []} hint="How sure the team is that this link is real." error={errors.confidence} />
                <TextArea label="Description" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What connects these two records?" maxLength={1000} error={errors.description} />
                <TextField label="Source" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Who or what reported this (optional)" maxLength={200} error={errors.source} />
              </>
            )}
          </>
        )}
        {formError && !info.note && <InlineError>{formError}</InlineError>}
      </div>
    </Modal>
  );
}
