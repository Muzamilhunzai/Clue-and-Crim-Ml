import { useMemo, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import { cx, fmtChip } from '@/lib/format';
import type { Dashboard } from '@/types';
import { Card, Skeleton } from '@/components/ui/primitives';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const niceMax = (n: number) => { if (n <= 4) return 4; const step = n <= 10 ? 2 : n <= 20 ? 5 : 10; return Math.ceil(n / step) * step; };

/** Grouped bars: hatched = the same weekday one week earlier, solid = this week. Built from real created_at timestamps. */
function ActivityChart({ weekly }: { weekly: Dashboard['weekly'] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = niceMax(Math.max(1, ...weekly.flatMap((w) => [w.total, w.previous_total])));
  const ticks = [max, max / 2, 0];
  const cur = weekly.reduce((n, w) => n + w.total, 0);
  const prev = weekly.reduce((n, w) => n + w.previous_total, 0);
  const diff = cur - prev;
  const H = 150;

  return (
    <Card className="flex flex-col">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-[15px] font-semibold">Records logged</h3>
          <p className="text-[12.5px] text-muted">Cases, evidence and clues · last 5 days</p>
        </div>
        <div className="flex items-center gap-3 text-[12px] text-muted">
          <span className="flex items-center gap-1.5"><span className="hatch h-3 w-3 rounded-[3px] border border-ink" />Last week</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-[3px] bg-ink" />This week</span>
        </div>
      </div>

      <div className="mt-4 flex gap-3" role="img" aria-label={`Records logged per day. This week ${cur}, last week ${prev}.`}>
        <div className="flex flex-col justify-between pb-6 text-right text-[11.5px] text-faint tabular" style={{ height: H + 24 }}>
          {ticks.map((t) => <span key={t}>{t}</span>)}
        </div>
        <div className="relative min-w-0 flex-1" style={{ height: H + 24 }}>
          <div className="absolute inset-x-0 top-0 flex flex-col justify-between" style={{ height: H }} aria-hidden>
            {ticks.map((t) => <div key={t} className="border-t border-dashed border-line-strong/70" />)}
          </div>
          <div className="absolute inset-x-0 top-0 grid grid-cols-5" style={{ height: H + 24 }}>
            {weekly.map((w, i) => (
              <div key={w.date} className="relative flex flex-col items-center" onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0}
                aria-label={`${WEEKDAYS[w.weekday]} ${fmtChip(w.date)}: ${w.total} this week (${w.cases} cases, ${w.evidence} evidence, ${w.clues} clues), ${w.previous_total} last week`}>
                <div className="flex w-full flex-1 items-end justify-center gap-1.5" style={{ height: H }}>
                  {[{ v: w.previous_total, hatched: true }, { v: w.total, hatched: false }].map((b) => (
                    <div key={String(b.hatched)} className="flex h-full w-[34%] max-w-7 flex-col items-center justify-end">
                      <span className="mb-1 text-[11px] font-medium leading-none tabular">{b.v || ''}</span>
                      <div className={cx('w-full rounded-t-[7px] transition-all', b.hatched ? 'hatch border border-b-0 border-ink' : 'bg-ink', hover !== null && hover !== i && 'opacity-40')}
                        style={{ height: `${Math.max(b.v ? 4 : 0, (b.v / max) * (H - 18))}px` }} />
                    </div>
                  ))}
                </div>
                <span className={cx('mt-2 text-[12px]', hover === i ? 'font-semibold text-ink' : 'text-muted')}>{WEEKDAYS[w.weekday]}</span>
                {hover === i && (
                  <div className="anim-pop pointer-events-none absolute -top-2 left-1/2 z-10 w-40 -translate-x-1/2 -translate-y-full rounded-xl bg-ink p-2.5 text-[12px] text-cream shadow-[var(--shadow-pop)]">
                    <p className="font-semibold">{WEEKDAYS[w.weekday]} · {fmtChip(w.date)}</p>
                    <p className="text-cream/70">{w.cases} cases · {w.evidence} evidence · {w.clues} clues</p>
                    <p className="mt-1 text-cream/70">Last week: {w.previous_total}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
      <p className="mt-2 text-[12.5px] text-muted">
        <span className="font-semibold text-ink tabular">{cur}</span> logged vs <span className="tabular">{prev}</span> the week before
        {diff !== 0 && <> · <span className={diff > 0 ? 'text-ok' : 'text-danger'}>{diff > 0 ? '▲' : '▼'} {Math.abs(diff)}</span></>}
      </p>
    </Card>
  );
}

/** Semicircle tick gauge (reference: "68%"). Value = share of closed cases that were solved or referred to court. */
function ClearanceGauge({ pct, solved, closed }: { pct: number; solved: number; closed: number }) {
  const N = 40;
  const lit = Math.round((pct / 100) * N);
  const cx0 = 130, cy0 = 128, r1 = 92, r2 = 116;
  const ticks = useMemo(() => Array.from({ length: N + 1 }, (_, i) => {
    const a = Math.PI - (i / N) * Math.PI;
    return { i, x1: cx0 + r1 * Math.cos(a), y1: cy0 - r1 * Math.sin(a), x2: cx0 + r2 * Math.cos(a), y2: cy0 - r2 * Math.sin(a) };
  }), []);
  return (
    <Card className="flex flex-col items-center">
      <div className="w-full">
        <h3 className="text-[15px] font-semibold">Clearance rate</h3>
        <p className="text-[12.5px] text-muted">Closed cases that were solved</p>
      </div>
      <div className="relative mt-1 w-full max-w-[280px]" role="img" aria-label={`Clearance rate ${pct} percent: ${solved} of ${closed} closed cases solved or referred to court`}>
        <svg viewBox="0 0 260 140" className="w-full">
          {ticks.map((t) => <line key={t.i} x1={t.x1} y1={t.y1} x2={t.x2} y2={t.y2} strokeWidth={t.i % 5 === 0 ? 3 : 2.2} strokeLinecap="round" stroke={t.i <= lit && pct > 0 ? '#1f1f1f' : '#d4d5ca'} />)}
        </svg>
        <div className="absolute inset-x-0 bottom-1 text-center">
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular">{pct}<span className="text-[22px] text-muted">%</span></p>
        </div>
      </div>
      <p className="mt-1 text-center text-[12.5px] text-muted"><span className="tabular font-medium text-ink">{solved}</span> of <span className="tabular">{closed}</span> closed cases solved or referred to court</p>
    </Card>
  );
}

function Delta({ current, previous }: { current: number; previous: number }) {
  const d = current - previous;
  const Icon = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : ArrowRight;
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-muted" title="Records logged in the last 5 days vs the 5 days before">
      <span className={cx('flex h-5 w-5 items-center justify-center rounded-full', d > 0 ? 'bg-ink text-white' : 'border border-line-strong text-muted')}><Icon size={12} strokeWidth={2.4} /></span>
      <span className="tabular">{d > 0 ? `+${d}` : d < 0 ? d : 'no change'}</span>
    </span>
  );
}

function Kpis({ d }: { d: Dashboard }) {
  const items = [
    { label: 'Active cases', value: d.totals.active, delta: d.trend.cases, note: 'opened' },
    { label: 'Closed cases', value: d.totals.closed, note: `${d.totals.archived} archived` },
    { label: 'Evidence in custody', value: d.evidence.in_custody, delta: d.trend.evidence, note: 'logged' },
    { label: 'Clues on file', value: d.counts.clues, delta: d.trend.clues, note: 'logged' },
  ];
  return (
    <Card>
      <h3 className="text-[15px] font-semibold">Overview</h3>
      <p className="text-[12.5px] text-muted">Arrows compare the last 5 days with the 5 days before</p>
      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-5">
        {items.map((k) => (
          <div key={k.label}>
            <dt className="text-[12.5px] text-muted">{k.label}</dt>
            <dd className="mt-0.5 text-[34px] font-semibold leading-none tracking-tight tabular">{k.value}</dd>
            <div className="mt-1.5 h-5">{k.delta ? <Delta current={k.delta.current} previous={k.delta.previous} /> : <span className="text-[12px] text-muted">{k.note}</span>}</div>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function StatsBand({ data }: { data?: Dashboard }) {
  if (!data) {
    return <div className="grid gap-4 px-5 sm:px-8 lg:grid-cols-[1.35fr_1fr_1fr]">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-[268px] rounded-[14px]" />)}</div>;
  }
  return (
    <div className="grid gap-4 px-5 sm:px-8 md:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr]">
      <div className="md:col-span-2 lg:col-span-1"><ActivityChart weekly={data.weekly} /></div>
      <ClearanceGauge pct={data.totals.clearance_rate} solved={data.totals.solved} closed={data.totals.closed} />
      <Kpis d={data} />
    </div>
  );
}
