import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, createTestContext, signIn, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(() => { ctx = createTestContext(); });
afterAll(() => ctx.cleanup());

describe('case management', () => {
  it('creates a case with a sequential TN number, a lead, an audit row and timestamps', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const a = await chief.post('/api/cases', { title: 'First new case', crime_type: 'fraud', incident_date: '2026-03-01', priority: 'high', lead_id: 2, support_ids: [3] });
    const b = await chief.post('/api/cases', { title: 'Second new case', crime_type: 'theft', incident_date: '2026-03-02' });
    expect(a.status).toBe(201);
    const year = new Date().getUTCFullYear();
    expect(a.body.case.case_number).toBe(`TN-${year}-0017`);
    expect(b.body.case.case_number).toBe(`TN-${year}-0018`);
    expect(a.body.investigators.map((i: { assignment_role: string }) => i.assignment_role)).toEqual(['lead', 'support']);
    expect(a.body.case.created_at).toBeTruthy();
    expect(a.body.activity[0].summary).toContain('Opened case');
  });

  it('validates input with per-field messages', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await chief.post('/api/cases', { title: 'x', crime_type: 'unicorn', incident_date: '2999-01-01' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.details.fields)).toEqual(expect.arrayContaining(['title', 'crime_type', 'incident_date']));
  });

  it('searches, filters, sorts and paginates', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const page1 = (await chief.get('/api/cases?pageSize=5&sort=priority&order=desc')).body;
    expect(page1.items).toHaveLength(5);
    expect(page1.items[0].priority).toBe('critical');
    expect(page1.total).toBeGreaterThan(5);
    const page2 = (await chief.get('/api/cases?pageSize=5&page=2&sort=priority&order=desc')).body;
    expect(page2.items[0].id).not.toBe(page1.items[0].id);

    const search = (await chief.get('/api/cases?q=skimmer')).body;
    expect(search.items.map((c: { case_number: string }) => c.case_number)).toContain('TN-2026-0014');
    const byStatus = (await chief.get('/api/cases?status=open')).body;
    expect(byStatus.items.every((c: { status: string }) => c.status === 'open')).toBe(true);
    const mine = (await (await signIn(ctx.app, ACCOUNTS.omar)).get('/api/cases?assignee=me&pageSize=50')).body;
    expect(mine.items.length).toBeGreaterThan(0);
    expect(mine.items.every((c: { investigators: { id: number }[] }) => c.investigators.some((i) => i.id === 4))).toBe(true);
  });

  it('hides archived cases from the default list and shows them on request', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const normal = (await chief.get('/api/cases?pageSize=100')).body.items as { is_archived: number }[];
    expect(normal.some((c) => c.is_archived === 1)).toBe(false);
    const only = (await chief.get('/api/cases?archived=only')).body.items as { is_archived: number }[];
    expect(only.length).toBeGreaterThan(0);
    expect(only.every((c) => c.is_archived === 1)).toBe(true);
  });

  it('builds the board with one column per status and per-column totals', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const { columns } = (await chief.get('/api/cases/board')).body;
    expect(columns.map((c: { status: string }) => c.status)).toEqual(['open', 'investigating', 'suspect_identified', 'closed']);
    const total = columns.reduce((n: number, c: { total: number }) => n + c.total, 0);
    const list = (await chief.get('/api/cases?pageSize=100')).body.total;
    expect(total).toBe(list);
  });

  it('requires a resolution to close, then closes and reopens', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const before = (await chief.get('/api/cases/5')).body.case;
    const noRes = await chief.patch('/api/cases/5/status', { status: 'closed' });
    expect(noRes.status).toBe(422);
    const closed = await chief.patch('/api/cases/5/status', { status: 'closed', resolution: 'solved', version: before.version });
    expect(closed.status).toBe(200);
    expect(closed.body.case.status).toBe('closed');
    expect(closed.body.case.closed_at).toBeTruthy();
    const reopened = await chief.patch('/api/cases/5/status', { status: 'investigating' });
    expect(reopened.body.case.closed_at).toBeNull();
    expect(reopened.body.case.resolution).toBeNull();
  });

  it('detects conflicting edits (optimistic concurrency) and returns the current version', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const v = (await chief.get('/api/cases/2')).body.case.version;
    const first = await chief.patch('/api/cases/2', { priority: 'critical', version: v });
    expect(first.status).toBe(200);
    expect(first.body.case.version).toBe(v + 1);
    const stale = await chief.patch('/api/cases/2', { priority: 'low', version: v });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('VERSION_CONFLICT');
    expect(stale.body.error.details.current.priority).toBe('critical');
  });

  it('archives only closed cases, keeps every linked record, and makes them read-only', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    expect((await chief.post('/api/cases/1/archive')).status).toBe(409); // still open
    const before = (await chief.get('/api/cases/8')).body;
    const archived = await chief.post('/api/cases/8/archive');
    expect(archived.status).toBe(200);
    expect(archived.body.case.is_archived).toBe(1);
    expect(archived.body.suspects).toHaveLength(before.suspects.length); // nothing deleted
    expect(archived.body.evidence).toHaveLength(before.evidence.length);
    // read-only while archived
    expect((await chief.patch('/api/cases/8', { title: 'Edited while archived', version: archived.body.case.version })).status).toBe(409);
    expect((await chief.post('/api/cases/8/suspects', { suspect_id: 1 })).status).toBe(409);
    // restore
    const restored = await chief.post('/api/cases/8/unarchive');
    expect(restored.body.case.is_archived).toBe(0);
  });

  it('assigns a new lead (demoting the old one) and refuses to remove the only lead', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await chief.post('/api/cases/4/investigators', { user_id: 3, role: 'lead' });
    const roles = Object.fromEntries(res.body.investigators.map((i: { id: number; assignment_role: string }) => [i.id, i.assignment_role]));
    expect(roles[3]).toBe('lead');
    expect(roles[2]).toBe('support');
    expect((await chief.delete('/api/cases/4/investigators/3')).status).toBe(409);
    expect((await chief.delete('/api/cases/4/investigators/2')).status).toBe(200);
  });

  it('refuses to assign evidence officers and deactivated users', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    expect((await chief.post('/api/cases/4/investigators', { user_id: 5, role: 'support' })).status).toBe(409);
    expect((await chief.post('/api/cases/4/investigators', { user_id: 7, role: 'support' })).status).toBe(409);
  });

  it('links a suspect once, rejects a duplicate, and unlinking keeps the suspect', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const link = await chief.post('/api/cases/6/suspects', { suspect_id: 3, involvement_status: 'questioned', notes: 'Routine check' });
    expect(link.status).toBe(201);
    expect(link.body.suspects.find((s: { id: number }) => s.id === 3).involvement_status).toBe('questioned');
    expect((await chief.post('/api/cases/6/suspects', { suspect_id: 3 })).status).toBe(409);
    const upd = await chief.patch('/api/cases/6/suspects/3', { involvement_status: 'cleared' });
    expect(upd.body.suspects.find((s: { id: number }) => s.id === 3).involvement_status).toBe('cleared');
    await chief.delete('/api/cases/6/suspects/3');
    expect((await chief.get('/api/suspects/3')).status).toBe(200);
  });

  it('has no "guilty" status: association is not a finding', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await chief.post('/api/cases/6/suspects', { suspect_id: 4, involvement_status: 'guilty' });
    expect(res.status).toBe(422);
    const meta = (await chief.get('/api/meta')).body;
    expect(meta.involvementStatuses.map((s: { value: string }) => s.value)).not.toContain('guilty');
  });

  it('adds case notes', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await chief.post('/api/cases/6/notes', { body: 'Interviewed the bus driver.' });
    expect(res.status).toBe(201);
    expect(res.body.notes[0].body).toBe('Interviewed the bus driver.');
  });

  it('returns 404 for a missing case and 422 for a bad id', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    expect((await chief.get('/api/cases/99999')).status).toBe(404);
    expect((await chief.get('/api/cases/abc')).status).toBe(422);
  });
});
