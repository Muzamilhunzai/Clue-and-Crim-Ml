import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { api, ApiError } from '@/lib/api';
import { cx, humanize } from '@/lib/format';
import { Button, InlineError } from '@/components/ui/primitives';
import { TextField } from '@/components/ui/forms';

interface Demo { enabled: boolean; password?: string; accounts: { username: string; full_name: string; email: string; role: string }[] }

/** Decorative, but built from the product's own vocabulary: case hub, people, evidence, clue, location. */
function GraphArt() {
  const nodes = [
    { x: 250, y: 210, r: 26, c: '#f6f7ed', fg: '#1f1f1f', l: 'CASE' },
    { x: 110, y: 110, r: 17, c: '#eb6834' }, { x: 395, y: 105, r: 17, c: '#2a78d6' }, { x: 420, y: 290, r: 17, c: '#008300' },
    { x: 95, y: 310, r: 17, c: '#e87ba4' }, { x: 250, y: 380, r: 17, c: '#1baf7a' }, { x: 255, y: 60, r: 14, c: '#eda100' },
    { x: 40, y: 200, r: 11, c: '#eb6834' }, { x: 470, y: 190, r: 11, c: '#eda100' },
  ];
  const edges = [[0, 1], [0, 2], [0, 3], [0, 4], [0, 5], [0, 6], [1, 7], [1, 4], [2, 8], [2, 6], [3, 5], [3, 8]];
  return (
    <svg viewBox="0 0 520 440" className="h-full w-full" role="img" aria-label="Illustration of a case connected to suspects, victims, evidence, clues and locations">
      <defs><pattern id="dots" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="#f6f7ed" opacity="0.14" /></pattern></defs>
      <rect width="520" height="440" fill="url(#dots)" />
      {edges.map(([a, b], i) => <line key={i} x1={nodes[a].x} y1={nodes[a].y} x2={nodes[b].x} y2={nodes[b].y} stroke="#f6f7ed" strokeOpacity="0.38" strokeWidth="1.4" strokeDasharray={i % 3 === 2 ? '4 5' : undefined} />)}
      {nodes.map((n, i) => (
        <g key={i}>
          <circle cx={n.x} cy={n.y} r={n.r + 7} fill="none" stroke={n.c} strokeOpacity="0.35" />
          <circle cx={n.x} cy={n.y} r={n.r} fill={n.c} />
          {n.l && <text x={n.x} y={n.y + 4} textAnchor="middle" fontSize="10" fontWeight="700" fill={n.fg} letterSpacing="0.5">{n.l}</text>}
        </g>
      ))}
    </svg>
  );
}

export default function Login() {
  const { user, loading, signIn } = useAuth();
  const loc = useLocation();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<{ login?: string; password?: string }>({});
  const demo = useQuery({ queryKey: ['demo'], queryFn: () => api.get<Demo>('/auth/demo'), retry: false, staleTime: Infinity });

  if (!loading && user) return <Navigate to={(loc.state as { from?: string } | null)?.from ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const f: typeof fields = {};
    if (!login.trim()) f.login = 'Enter your email or username.';
    if (!password) f.password = 'Enter your password.';
    setFields(f); setError('');
    if (Object.keys(f).length) return;
    setBusy(true);
    try { await signIn(login.trim(), password); }
    catch (err) {
      if (err instanceof ApiError) { setError(err.message); setFields(err.fields); }
      else setError('Something went wrong. Please try again.');
    } finally { setBusy(false); }
  };

  return (
    <div className="grid min-h-screen bg-cream lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      <main className="flex items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[420px] anim-fade">
          <div className="mb-10 flex items-center gap-2.5">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink">
              <svg viewBox="0 0 32 32" width="24" height="24" fill="none" stroke="#f6f7ed" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="21" r="3.2" /><circle cx="22" cy="10" r="3.2" /><path d="M13.3 18.7l6.4-6.4" /><circle cx="23" cy="23" r="2" fill="#f6f7ed" stroke="none" /></svg>
            </span>
            <span className="text-[22px] font-semibold tracking-tight">TraceNet</span>
          </div>
          <h1 className="text-[34px] font-semibold leading-[1.1] tracking-tight">Welcome back</h1>
          <p className="mt-2 text-[15px] text-muted">Sign in to the Crime &amp; Clue Relationship Database.</p>

          <form onSubmit={submit} noValidate className="mt-8 space-y-4">
            <TextField label="Email or username" autoComplete="username" autoFocus value={login} onChange={(e) => setLogin(e.target.value)} error={fields.login} placeholder="you@tracenet.local" />
            <div className="relative">
              <TextField label="Password" type={show ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} error={fields.password} placeholder="Your password" className="[&_input]:pr-11" />
              <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                className="absolute right-2 top-[30px] flex h-8 w-8 items-center justify-center rounded-lg text-muted hover:bg-mist hover:text-ink">{show ? <EyeOff size={17} /> : <Eye size={17} />}</button>
            </div>
            <InlineError>{error}</InlineError>
            <Button type="submit" loading={busy} className="h-11 w-full text-[15px]" icon={!busy ? undefined : undefined}>{busy ? 'Signing in…' : <>Sign in <ArrowRight size={17} /></>}</Button>
          </form>

          {demo.data?.enabled && (
            <div className="mt-8 rounded-2xl border border-line-strong bg-white/70 p-4">
              <p className="flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-wide text-muted"><ShieldCheck size={14} />Demo accounts · local only</p>
              <p className="mb-3 mt-1 text-[12.5px] text-muted">Pick a role to fill the form. Shared demo password: <code className="rounded bg-mist px-1.5 py-0.5 text-ink">{demo.data.password}</code></p>
              <div className="flex flex-wrap gap-2">
                {demo.data.accounts.filter((a) => ['chief', 'sana', 'omar', 'evidence'].includes(a.email.split('@')[0])).map((a) => (
                  <button key={a.email} type="button" onClick={() => { setLogin(a.email); setPassword(demo.data!.password ?? ''); setError(''); setFields({}); }}
                    className={cx('rounded-full border px-3 py-1.5 text-left text-[12.5px] transition hover:border-ink', login === a.email ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white')}>
                    <span className="font-medium">{a.full_name.split(' ')[0]}</span> <span className={login === a.email ? 'text-white/70' : 'text-muted'}>· {humanize(a.role)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
          <p className="mt-8 text-[12.5px] text-faint">SZABIST Islamabad · Advanced Database Systems Lab</p>
        </div>
      </main>

      <aside className="relative hidden overflow-hidden bg-ink p-10 text-cream lg:flex lg:flex-col lg:justify-between">
        <div className="max-w-md">
          <p className="text-[13px] font-medium uppercase tracking-[0.14em] text-cream/60">Case intelligence</p>
          <h2 className="mt-3 text-[34px] font-semibold leading-[1.15] tracking-tight">See how every clue, person and place connects.</h2>
          <p className="mt-3 text-[15px] text-cream/70">Cases, suspects, witnesses, evidence and chain of custody in one relational database, with a relationship engine that shows the links.</p>
        </div>
        <div className="mx-auto my-6 aspect-[520/440] w-full max-w-[560px]"><GraphArt /></div>
        <p className="max-w-md text-[12.5px] text-cream/50">An association in TraceNet is a recorded link between two records. It is not a finding of fact or guilt.</p>
      </aside>
    </div>
  );
}
