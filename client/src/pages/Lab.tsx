import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CircleAlert, CircleCheck, Database, Info, Play, ShieldX, TriangleAlert } from 'lucide-react';
import { api, ApiError } from '@/lib/api';
import { cx } from '@/lib/format';
import type { LabDemoMeta, LabDemoResult, LabStep } from '@/types';
import { TopBand } from '@/components/TopBand';
import { Badge, Button, Card, EmptyState, ErrorState, PageHeader, SectionTitle, Skeleton, Tabs } from '@/components/ui/primitives';

const STEP: Record<LabStep['status'], { icon: typeof Info; cls: string; label: string }> = {
  ok: { icon: CircleCheck, cls: 'text-ok bg-ok-soft', label: 'Succeeded' },
  rejected: { icon: ShieldX, cls: 'text-danger bg-danger-soft', label: 'Refused by the database' },
  info: { icon: Info, cls: 'text-info bg-info-soft', label: 'Note' },
  warn: { icon: TriangleAlert, cls: 'text-warn bg-warn-soft', label: 'Bad outcome (shown on purpose)' },
  unexpected: { icon: CircleAlert, cls: 'text-white bg-danger', label: 'Did not behave as designed' },
};

function Sql({ children }: { children: string }) {
  return <pre className="mt-2 overflow-x-auto rounded-xl bg-ink px-4 py-3 font-mono text-[12.5px] leading-relaxed text-cream/90">{children}</pre>;
}

function RowsTable({ rows }: { rows: unknown[] }) {
  const list = rows as Record<string, unknown>[];
  if (!list.length || typeof list[0] !== 'object' || list[0] === null) return <pre className="mt-2 text-[12.5px] text-muted">{JSON.stringify(rows)}</pre>;
  const cols = Object.keys(list[0]);
  return (
    <div className="mt-2 overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-[12.5px]">
        <thead className="bg-mist text-muted"><tr>{cols.map((c) => <th key={c} className="px-3 py-1.5 font-medium">{c}</th>)}</tr></thead>
        <tbody>{list.slice(0, 8).map((r, i) => <tr key={i} className="border-t border-line">{cols.map((c) => <td key={c} className="px-3 py-1.5 tabular">{String(r[c] ?? 'NULL')}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function DemoCard({ demo }: { demo: LabDemoMeta }) {
  const run = useMutation({ mutationFn: () => api.post<LabDemoResult>(`/lab/demos/${demo.id}`) });
  const r = run.data;
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <Badge tone="neutral" dot={false}>{demo.concept}</Badge>
          <h3 className="mt-2 text-[17px] font-semibold tracking-tight">{demo.title}</h3>
          <p className="mt-1 text-[13.5px] text-muted">{demo.blurb}</p>
        </div>
        <Button loading={run.isPending} icon={<Play size={15} />} onClick={() => run.mutate()}>{r ? 'Run again' : 'Run demo'}</Button>
      </div>
      {run.isError && <p role="alert" className="mt-4 text-[13px] text-danger">{run.error instanceof ApiError ? run.error.message : 'The demo failed to run.'}</p>}
      {r && (
        <div className="mt-5 space-y-3 border-t border-line pt-5">
          <ol className="space-y-3">
            {r.steps.map((s, i) => {
              const st = STEP[s.status];
              const Icon = st.icon;
              return (
                <li key={i} className="flex gap-3">
                  <span className={cx('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full', st.cls)} title={st.label}><Icon size={15} /></span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-medium">{s.label} <span className="ml-1 text-[11.5px] font-normal uppercase tracking-wide text-muted">{st.label}</span></p>
                    {s.sql && <Sql>{s.sql}</Sql>}
                    <p className="mt-1.5 text-[13px] text-muted">{s.message}</p>
                    {s.rows && s.rows.length > 0 && <RowsTable rows={s.rows} />}
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="rounded-xl bg-cream px-4 py-3 text-[13.5px]"><strong>Takeaway.</strong> {r.takeaway}</div>
          <p className="text-[12px] text-muted">Nothing was saved: the demo ran inside a transaction that was rolled back, so your real records are untouched.</p>
        </div>
      )}
    </Card>
  );
}

function Overview() {
  const q = useQuery({ queryKey: ['lab', 'overview'], queryFn: () => api.get<{ sqlite_version: string; foreign_keys: boolean; journal_mode: string; busy_timeout_ms: number; integrity_check: string; foreign_key_violations: number; custody_violations: number; size_bytes: number | null; tables: { name: string; rows: number }[]; objects: { type: string; n: number }[]; migrations: { name: string; applied_at: string }[] }>('/lab/overview') });
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState error={q.error} />;
  const o = q.data;
  const checks = [
    { label: 'Foreign keys enforced', ok: o.foreign_keys, value: o.foreign_keys ? 'ON' : 'OFF' },
    { label: 'Integrity check', ok: o.integrity_check === 'ok', value: o.integrity_check },
    { label: 'Foreign key violations', ok: o.foreign_key_violations === 0, value: String(o.foreign_key_violations) },
    { label: 'Custody chain problems', ok: o.custody_violations === 0, value: String(o.custody_violations) },
  ];
  const objects = Object.fromEntries(o.objects.map((x) => [x.type, x.n]));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {checks.map((c) => (
          <Card key={c.label}><p className="text-[12.5px] text-muted">{c.label}</p><p className="mt-1 flex items-center gap-2 text-[22px] font-semibold tabular">{c.ok ? <CircleCheck size={20} className="text-ok" /> : <CircleAlert size={20} className="text-danger" />}{c.value}</p></Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <SectionTitle>Engine</SectionTitle>
          <dl className="space-y-2.5 text-[14px]">
            <div className="flex justify-between"><dt className="text-muted">SQLite version</dt><dd className="tabular">{o.sqlite_version}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Journal mode</dt><dd className="uppercase">{o.journal_mode}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Busy timeout</dt><dd className="tabular">{o.busy_timeout_ms} ms</dd></div>
            <div className="flex justify-between"><dt className="text-muted">File size</dt><dd className="tabular">{o.size_bytes === null ? '-' : `${(o.size_bytes / 1024).toFixed(0)} KB`}</dd></div>
            <div className="flex justify-between"><dt className="text-muted">Tables / views / indexes / triggers</dt><dd className="tabular">{objects.table ?? 0} / {objects.view ?? 0} / {objects.index ?? 0} / {objects.trigger ?? 0}</dd></div>
          </dl>
          <h4 className="mb-2 mt-5 text-[13px] font-semibold">Applied migrations</h4>
          <ul className="space-y-1 text-[12.5px] text-muted">{o.migrations.map((m) => <li key={m.name} className="flex justify-between gap-3"><span className="font-mono">{m.name}</span><span>{m.applied_at}</span></li>)}</ul>
        </Card>
        <Card>
          <SectionTitle>Rows per table</SectionTitle>
          <ul className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">{o.tables.map((t) => <li key={t.name} className="flex justify-between border-b border-dashed border-line py-1 text-[13.5px]"><span className="font-mono text-[12.5px]">{t.name}</span><span className="tabular">{t.rows}</span></li>)}</ul>
        </Card>
      </div>
    </div>
  );
}

function Demos() {
  const q = useQuery({ queryKey: ['lab', 'demos'], queryFn: () => api.get<{ items: LabDemoMeta[] }>('/lab/demos') });
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <div className="space-y-4">
      <p className="rounded-xl border border-line bg-white px-4 py-3 text-[13.5px] text-muted"><Database size={15} className="mr-2 inline" />Each demo runs real SQL against the live database, but inside <code className="rounded bg-mist px-1.5 text-ink">BEGIN IMMEDIATE … ROLLBACK</code>. You see what the database accepts and refuses; nothing is saved. Only fixed SQL written in the server runs: you cannot type your own.</p>
      {q.data.items.map((d) => <DemoCard key={d.id} demo={d} />)}
    </div>
  );
}

interface Plan { id: string; title: string; note: string; sql: string; plan: string[]; rows: number; iterations: number; avg_ms: number | null; access: 'index' | 'scan' | 'error'; error?: string }
function Plans() {
  const q = useQuery({ queryKey: ['lab', 'plans'], queryFn: () => api.get<{ items: Plan[] }>('/lab/plans') });
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState error={q.error} />;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {q.data.items.map((p) => (
        <Card key={p.id}>
          <div className="flex items-start justify-between gap-3"><h3 className="text-[16px] font-semibold tracking-tight">{p.title}</h3><Badge tone={p.access === 'index' ? 'ok' : p.access === 'scan' ? 'warn' : 'danger'}>{p.access === 'index' ? 'Uses an index' : p.access === 'scan' ? 'Full scan' : 'Error'}</Badge></div>
          <p className="mt-1 text-[13px] text-muted">{p.note}</p>
          <Sql>{p.sql}</Sql>
          <p className="mb-1 mt-3 text-[12px] font-semibold uppercase tracking-wide text-muted">EXPLAIN QUERY PLAN</p>
          <ul className="space-y-1 font-mono text-[12.5px]">{p.plan.map((l, i) => <li key={i} className="rounded-lg bg-mist px-3 py-1.5">{l}</li>)}</ul>
          <p className="mt-3 text-[12.5px] text-muted tabular">{p.rows} rows · average {p.avg_ms ?? '-'} ms over {p.iterations} runs</p>
          {p.error && <p className="mt-2 text-[12.5px] text-danger">{p.error}</p>}
        </Card>
      ))}
    </div>
  );
}

interface TableInfo { name: string; ddl: string; columns: { name: string; type: string; notnull: number; pk: number; dflt_value: string | null }[]; foreign_keys: { table: string; from: string; to: string; on_delete: string }[]; indexes: { name: string; ddl: string }[]; triggers: { name: string; ddl: string }[] }
function Schema() {
  const q = useQuery({ queryKey: ['lab', 'schema'], queryFn: () => api.get<{ tables: TableInfo[]; views: { name: string; ddl: string }[]; triggers: { name: string; table: string; ddl: string }[]; indexes: unknown[] }>('/lab/schema') });
  const [sel, setSel] = useState<string>('cases');
  const [view, setView] = useState<string | null>(null);
  const preview = useQuery({ queryKey: ['lab', 'view', view], enabled: !!view, queryFn: () => api.get<{ rows: unknown[] }>(`/lab/views/${view}`) });
  if (q.isPending) return <Skeleton className="h-64" />;
  if (q.isError) return <ErrorState error={q.error} />;
  const t = q.data.tables.find((x) => x.name === sel) ?? q.data.tables[0];
  const v = q.data.views.find((x) => x.name === view);
  return (
    <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
      <Card className="h-fit" pad={false}>
        <div className="max-h-[70vh] overflow-y-auto p-2">
          <p className="px-3 pb-1 pt-2 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Tables</p>
          {q.data.tables.map((x) => <button key={x.name} onClick={() => { setSel(x.name); setView(null); }} className={cx('block w-full truncate rounded-lg px-3 py-1.5 text-left font-mono text-[12.5px]', !view && x.name === t.name ? 'bg-ink text-white' : 'hover:bg-mist')}>{x.name}</button>)}
          <p className="px-3 pb-1 pt-4 text-[11.5px] font-semibold uppercase tracking-wide text-muted">Views</p>
          {q.data.views.map((x) => <button key={x.name} onClick={() => setView(x.name)} className={cx('block w-full truncate rounded-lg px-3 py-1.5 text-left font-mono text-[12.5px]', view === x.name ? 'bg-ink text-white' : 'hover:bg-mist')}>{x.name}</button>)}
        </div>
      </Card>
      <div className="min-w-0 space-y-4">
        {v ? (
          <Card>
            <SectionTitle>{v.name} <span className="text-[13px] font-normal text-muted">view</span></SectionTitle>
            <Sql>{v.ddl}</Sql>
            <h4 className="mb-1 mt-4 text-[13px] font-semibold">First rows</h4>
            {preview.isPending ? <Skeleton className="h-24" /> : <RowsTable rows={preview.data?.rows ?? []} />}
          </Card>
        ) : (
          <>
            <Card>
              <SectionTitle>{t.name}</SectionTitle>
              <div className="overflow-x-auto rounded-xl border border-line">
                <table className="w-full text-left text-[13px]"><thead className="bg-mist text-[12px] text-muted"><tr><th className="px-3 py-2">Column</th><th className="px-3 py-2">Type</th><th className="px-3 py-2">Null?</th><th className="px-3 py-2">Key</th><th className="px-3 py-2">Default</th></tr></thead>
                  <tbody>{t.columns.map((c) => <tr key={c.name} className="border-t border-line"><td className="px-3 py-1.5 font-mono text-[12.5px]">{c.name}</td><td className="px-3 py-1.5">{c.type}</td><td className="px-3 py-1.5">{c.notnull ? 'NOT NULL' : 'nullable'}</td><td className="px-3 py-1.5">{c.pk ? 'PK' : ''}</td><td className="px-3 py-1.5 font-mono text-[12px] text-muted">{c.dflt_value ?? ''}</td></tr>)}</tbody></table>
              </div>
              {t.foreign_keys.length > 0 && <><h4 className="mb-1.5 mt-4 text-[13px] font-semibold">Foreign keys</h4><ul className="space-y-1 text-[13px]">{t.foreign_keys.map((f, i) => <li key={i} className="font-mono text-[12.5px]">{f.from} → {f.table}.{f.to} <span className="text-muted">ON DELETE {f.on_delete}</span></li>)}</ul></>}
            </Card>
            {t.indexes.length > 0 && <Card><SectionTitle>Indexes <span className="text-muted">({t.indexes.length})</span></SectionTitle>{t.indexes.map((i) => <Sql key={i.name}>{i.ddl}</Sql>)}</Card>}
            {t.triggers.length > 0 && <Card><SectionTitle>Triggers <span className="text-muted">({t.triggers.length})</span></SectionTitle>{t.triggers.map((i) => <div key={i.name}><p className="mt-3 font-mono text-[12.5px] font-medium">{i.name}</p><Sql>{i.ddl}</Sql></div>)}</Card>}
            <Card><SectionTitle>CREATE TABLE</SectionTitle><Sql>{t.ddl}</Sql></Card>
          </>
        )}
        {!t && <EmptyState title="No tables" />}
      </div>
    </div>
  );
}

export default function Lab() {
  const [tab, setTab] = useState<'overview' | 'demos' | 'plans' | 'schema'>('demos');
  return (
    <div className="pb-14">
      <TopBand />
      <PageHeader title="ADBMS lab" subtitle="Live demonstrations of transactions, constraints, triggers, concurrency, indexes and query plans, run against this application’s own database." />
      <Tabs value={tab} onChange={setTab} tabs={[{ id: 'demos', label: 'Transactions & integrity' }, { id: 'plans', label: 'Indexes & query plans' }, { id: 'schema', label: 'Schema explorer' }, { id: 'overview', label: 'Database health' }]} />
      <div className="px-5 pt-5 sm:px-8">
        {tab === 'overview' && <Overview />}
        {tab === 'demos' && <Demos />}
        {tab === 'plans' && <Plans />}
        {tab === 'schema' && <Schema />}
      </div>
    </div>
  );
}
