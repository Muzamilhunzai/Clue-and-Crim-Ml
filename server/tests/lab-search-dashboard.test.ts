import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, createTestContext, signIn, type TestContext } from './helpers';
import { DEMOS } from '../src/services/labService';

let ctx: TestContext;
beforeAll(() => { ctx = createTestContext(); });
afterAll(() => ctx.cleanup());

const tableCounts = () =>
  Object.fromEntries(
    ['cases', 'evidence', 'custody_log', 'case_investigators', 'relationships', 'suspects', 'audit_log', 'users'].map((t) => [
      t, (ctx.db.prepare(`SELECT COUNT(*) AS n FROM ${t}`).get() as { n: number }).n,
    ]),
  );

describe('ADBMS lab', () => {
  for (const demo of DEMOS) {
    it(`runs "${demo.title}" without changing any stored data and behaves as designed`, async () => {
      const chief = await signIn(ctx.app, ACCOUNTS.chief);
      const before = tableCounts();
      const res = await chief.post(`/api/lab/demos/${demo.id}`);
      expect(res.status).toBe(200);
      expect(res.body.persisted).toBe(false);
      expect(res.body.steps.length).toBeGreaterThan(2);
      const unexpected = res.body.steps.filter((s: { status: string }) => s.status === 'unexpected');
      expect(unexpected, JSON.stringify(unexpected)).toEqual([]);
      expect(tableCounts()).toEqual(before);
      expect(ctx.db.inTransaction).toBe(false);
    });
  }

  it('shows rejections for the constraint and custody demos', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const c = (await chief.post('/api/lab/demos/constraints')).body;
    expect(c.steps.filter((s: { status: string }) => s.status === 'rejected').length).toBeGreaterThanOrEqual(9);
    const k = (await chief.post('/api/lab/demos/custody-rules')).body;
    expect(k.steps.filter((s: { status: string }) => s.status === 'rejected').length).toBeGreaterThanOrEqual(5);
  });

  it('reports a healthy database and lists schema objects', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const o = (await chief.get('/api/lab/overview')).body;
    expect(o).toMatchObject({ foreign_keys: true, integrity_check: 'ok', foreign_key_violations: 0, custody_violations: 0 });
    expect(o.journal_mode).toBe('wal');
    const s = (await chief.get('/api/lab/schema')).body;
    expect(s.tables.map((t: { name: string }) => t.name)).toEqual(expect.arrayContaining(['cases', 'custody_log', 'relationships']));
    expect(s.triggers.length).toBeGreaterThan(20);
    expect(s.views.length).toBeGreaterThanOrEqual(7);
  });

  it('explains queries: the indexed lookup is a SEARCH and NOT INDEXED is a SCAN', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const plans = (await chief.get('/api/lab/plans')).body.items as { id: string; access: string; plan: string[]; error?: string }[];
    expect(plans.every((p) => !p.error), JSON.stringify(plans.filter((p) => p.error))).toBe(true);
    expect(plans.find((p) => p.id === 'status-index')!.plan.join(' ')).toMatch(/SEARCH cases USING (COVERING )?INDEX idx_cases_status/);
    expect(plans.find((p) => p.id === 'status-noindex')!.access).toBe('scan');
  });

  it('only previews whitelisted views and 404s unknown demos', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    expect((await chief.get('/api/lab/views/v_node_degree')).status).toBe(200);
    expect((await chief.get('/api/lab/views/users')).status).toBe(404);
    expect((await chief.post('/api/lab/demos/drop-everything')).status).toBe(404);
  });
});

describe('search', () => {
  it('finds records across types with prefix matching and highlights', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = (await chief.get('/api/search?q=locksm')).body.results;
    expect(res.some((r: { type: string; label: string }) => r.type === 'suspect' && r.label === 'Rashid Malik')).toBe(true);
    const multi = (await chief.get('/api/search?q=harbor+jewellery')).body.results;
    expect(multi[0].type).toBe('case');
    expect(multi[0].title_highlight).toContain('[[');
  });

  it('does not index restricted contact details', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    expect((await chief.get('/api/search?q=5550201')).body.results).toEqual([]);
    expect((await chief.get(`/api/search?q=${encodeURIComponent('"* OR (')}`)).status).toBe(200); // malformed input is harmless
    expect((await chief.get('/api/search?q=')).body.results).toEqual([]);
  });

  it('keeps the index in sync when records change', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    await chief.patch('/api/suspects/12', { alias: 'Shadowfax' });
    expect((await chief.get('/api/search?q=shadowfax')).body.results.length).toBe(1);
    await chief.patch('/api/suspects/12', { alias: 'Hooded figure' });
    expect((await chief.get('/api/search?q=shadowfax')).body.results.length).toBe(0);
  });
});

describe('dashboard', () => {
  it('computes every figure from the database', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const d = (await chief.get('/api/dashboard?tz=300')).body;
    const total = (ctx.db.prepare('SELECT COUNT(*) AS n FROM cases').get() as { n: number }).n;
    expect(d.totals.total).toBe(total);
    expect(d.totals.active + d.totals.closed).toBe(total);
    expect(d.weekly).toHaveLength(5);
    expect(d.weekly.reduce((n: number, w: { total: number }) => n + w.total, 0)).toBeGreaterThan(0);
    expect(d.evidence.total).toBe(28);
    expect(d.totals.clearance_rate).toBe(75);
    expect(d.integrity.custody_problems).toBe(0);
    expect(d.recentActivity.some((a: { entity_type: string }) => a.entity_type === 'session')).toBe(false);
  });

  it('serves the activity feed with filters and pagination', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const p = (await chief.get('/api/activity?pageSize=10&entity_type=evidence')).body;
    expect(p.items).toHaveLength(10);
    expect(p.items.every((a: { entity_type: string }) => a.entity_type === 'evidence')).toBe(true);
    expect(p.total).toBeGreaterThan(10);
    const forCase = (await chief.get('/api/activity?case_id=1')).body;
    expect(forCase.items.every((a: { case_id: number }) => a.case_id === 1)).toBe(true);
  });
});
