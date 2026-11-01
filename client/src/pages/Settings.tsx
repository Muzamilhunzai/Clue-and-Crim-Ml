import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, ShieldCheck } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { fmtDateTime, humanize } from '@/lib/format';
import { useAuth } from '@/hooks/useAuth';
import { useMeta } from '@/hooks/useData';
import { useToast } from '@/hooks/useToast';
import { TopBand } from '@/components/TopBand';
import { Avatar, Badge, Button, Card, InlineError, PageHeader, SectionTitle } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/forms';

const PERM_LABELS: Record<string, string> = {
  'case:create': 'Open cases', 'case:update': 'Edit cases (assigned cases for investigators)', 'case:archive': 'Archive and restore cases', 'case:assign': 'Assign investigators',
  'people:write': 'Add and edit suspects, victims, witnesses', 'people:delete': 'Delete people records', 'clue:write': 'Add and edit clues', 'clue:delete': 'Delete clues',
  'location:write': 'Add and edit locations', 'location:delete': 'Delete locations', 'evidence:create': 'Log evidence', 'evidence:update': 'Edit evidence', 'custody:transfer': 'Record custody transfers',
  'relationship:write': 'Record and remove associations', 'sensitive:view': 'See victim / suspect personal details', 'protected:view': 'See protected witness contacts',
  'investigator:manage': 'Manage investigator accounts', 'investigator:view_contact': 'See investigator contact details', 'lab:use': 'Use the ADBMS lab',
};

export default function Settings() {
  const { user, signOut } = useAuth();
  const perms = useMeta().data?.permissions ?? [];
  const toast = useToast();
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const change = useMutation({
    mutationFn: () => api.post('/auth/change-password', { current_password: cur, new_password: next }),
    onSuccess: () => { toast.success('Password changed. Other devices were signed out.'); setCur(''); setNext(''); setAgain(''); },
    onError: (e) => { if (e instanceof ApiError) { setErrors(e.fields); setFormError(Object.keys(e.fields).length ? '' : e.message); } else setFormError('Could not change the password.'); },
  });
  if (!user) return null;
  const submit = () => {
    setErrors({}); setFormError('');
    if (next !== again) { setErrors({ confirm: 'The two passwords do not match.' }); return; }
    change.mutate();
  };
  return (
    <div className="pb-14">
      <TopBand />
      <PageHeader title="Account" subtitle="Your profile, what your role allows, and your password." />
      <div className="grid gap-4 px-5 sm:px-8 lg:grid-cols-2">
        <Card>
          <div className="flex items-center gap-4"><Avatar name={user.full_name} size={56} /><div><p className="text-[19px] font-semibold">{user.full_name}</p><Badge tone="ink" dot={false}><ShieldCheck size={11} />{humanize(user.role)}</Badge></div></div>
          <dl className="mt-5 space-y-2.5 text-[14px]">
            <div className="flex justify-between gap-4"><dt className="text-muted">Email</dt><dd>{user.email}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Username</dt><dd>{user.username}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Badge</dt><dd className="tabular">{user.badge_number}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Department</dt><dd>{user.department ?? '-'}</dd></div>
            <div className="flex justify-between gap-4"><dt className="text-muted">Last sign-in</dt><dd>{fmtDateTime(user.last_login_at)}</dd></div>
          </dl>
          <Button variant="secondary" className="mt-5" onClick={() => void signOut()}>Sign out</Button>
        </Card>
        <Card>
          <SectionTitle>Change password</SectionTitle>
          <form className="grid gap-4" noValidate onSubmit={(e) => { e.preventDefault(); submit(); }}>
            <TextField label="Current password" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} error={errors.current_password} />
            <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors.new_password} hint="At least 10 characters, with a letter and a number." />
            <TextField label="Repeat new password" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} error={errors.confirm} />
            <InlineError>{formError}</InlineError>
            <div><Button type="submit" loading={change.isPending} icon={<KeyRound size={16} />}>Change password</Button></div>
          </form>
        </Card>
        <Card className="lg:col-span-2">
          <SectionTitle>What your role can do</SectionTitle>
          <p className="-mt-2 mb-3 text-[13px] text-muted">These rules are enforced by the server on every request. The interface only hides what you cannot use.</p>
          <ul className="grid gap-x-6 gap-y-1.5 sm:grid-cols-2">{perms.map((p) => <li key={p} className="flex items-center gap-2 text-[13.5px]"><span className="h-1.5 w-1.5 rounded-full bg-ink" />{PERM_LABELS[p] ?? p}</li>)}</ul>
        </Card>
      </div>
    </div>
  );
}
