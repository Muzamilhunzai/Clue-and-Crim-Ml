import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, createTestContext, signIn, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(() => { ctx = createTestContext(); });
afterAll(() => ctx.cleanup());

describe('evidence and chain of custody', () => {
  it('creates evidence with a unique code and an automatic intake custody entry', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const res = await sana.post('/api/evidence', {
      case_id: 1, title: 'Torn glove', category: 'trace', collected_at: '2026-10-20', collected_location_id: 1,
    });
    expect(res.status).toBe(201);
    expect(res.body.record.evidence_code).toMatch(/^EV-\d{4}-0029$/);
    expect(res.body.custody).toHaveLength(1);
    expect(res.body.custody[0]).toMatchObject({ seq: 1, from_custodian_id: null, to_custodian_id: sana.user.id });
    expect(res.body.custody_check.ok).toBe(true);
  });

  it('keeps evidence codes unique and sequential', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const a = await chief.post('/api/evidence', { case_id: 2, title: 'Evidence A', collected_at: '2026-10-21' });
    const b = await chief.post('/api/evidence', { case_id: 2, title: 'Evidence B', collected_at: '2026-10-21' });
    expect(a.body.record.evidence_code).not.toBe(b.body.record.evidence_code);
  });

  it('refuses evidence on cases the investigator is not assigned to', async () => {
    const omar = await signIn(ctx.app, ACCOUNTS.omar);
    expect((await omar.post('/api/evidence', { case_id: 1, title: 'Not my case', collected_at: '2026-10-20' })).status).toBe(403);
  });

  it('refuses evidence on an archived case', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await chief.post('/api/evidence', { case_id: 16, title: 'Too late', collected_at: '2026-10-20' });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('CASE_ARCHIVED');
  });

  it('appends a transfer: new entry, new custodian, audit row, verified chain', async () => {
    const officer = await signIn(ctx.app, ACCOUNTS.evidence);
    const before = (await officer.get('/api/evidence/1')).body;
    const res = await officer.post('/api/evidence/1/custody', { to_custodian_id: 4, reason: 'Sent for toolmark comparison', status: 'in_analysis', storage_location: 'Forensics bench 4' });
    expect(res.status).toBe(201);
    expect(res.body.custody).toHaveLength(before.custody.length + 1);
    const last = res.body.custody.at(-1);
    expect(last).toMatchObject({ from_custodian_id: before.record.current_custodian_id, to_custodian_id: 4, transferred_by: officer.user.id });
    expect(last.transferred_at).toBeTruthy();
    expect(res.body.record).toMatchObject({ current_custodian_id: 4, status: 'in_analysis', storage_location: 'Forensics bench 4' });
    expect(res.body.custody_check.ok).toBe(true);
    const act = ctx.db.prepare(`SELECT summary FROM audit_log WHERE action = 'custody.transfer' ORDER BY id DESC LIMIT 1`).get() as { summary: string };
    expect(act.summary).toContain('EV-2026-0001');
  });

  it('rejects a transfer to the current holder, to nobody, and without a reason', async () => {
    const officer = await signIn(ctx.app, ACCOUNTS.evidence);
    const cur = (await officer.get('/api/evidence/2')).body.record.current_custodian_id;
    expect((await officer.post('/api/evidence/2/custody', { to_custodian_id: cur, reason: 'No change' })).status).toBe(422);
    expect((await officer.post('/api/evidence/2/custody', { to_custodian_id: 99999, reason: 'Unknown person' })).status).toBe(422);
    expect((await officer.post('/api/evidence/2/custody', { to_custodian_id: 3 })).status).toBe(422);
    expect((await officer.post('/api/evidence/2/custody', { to_custodian_id: 7, reason: 'Deactivated holder' })).status).toBe(409);
  });

  it('refuses to transfer disposed evidence', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const officer = await signIn(ctx.app, ACCOUNTS.evidence);
    expect((await officer.patch('/api/evidence/3', { status: 'disposed' })).status).toBe(200);
    const res = await officer.post('/api/evidence/3/custody', { to_custodian_id: chief.user.id, reason: 'Late transfer' });
    expect(res.status).toBe(409);
  });

  it('makes the custody log append-only at the database level (UPDATE and DELETE are rejected)', () => {
    expect(() => ctx.db.prepare(`UPDATE custody_log SET reason = 'edited' WHERE id = 1`).run()).toThrow(/append-only/);
    expect(() => ctx.db.prepare(`DELETE FROM custody_log WHERE id = 1`).run()).toThrow(/append-only/);
    expect(() => ctx.db.prepare(`UPDATE audit_log SET summary = 'x' WHERE id = 1`).run()).toThrow(/append-only/);
  });

  it('rejects a forged or gapped chain at the database level', () => {
    const last = ctx.db.prepare('SELECT seq, to_custodian_id AS holder FROM custody_log WHERE evidence_id = 5 ORDER BY seq DESC LIMIT 1').get() as { seq: number; holder: number };
    const ins = ctx.db.prepare(`INSERT INTO custody_log (evidence_id, seq, from_custodian_id, to_custodian_id, transferred_by, reason) VALUES (5, ?, ?, ?, 1, 'test')`);
    expect(() => ins.run(last.seq + 2, last.holder, 1)).toThrow(/sequence/);
    expect(() => ins.run(last.seq + 1, last.holder === 1 ? 2 : 1, 3)).toThrow(/previous custodian/);
  });

  it('never deletes evidence through the API', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await chief.delete('/api/evidence/1');
    expect(res.status).toBe(405);
    expect(res.body.error.message).toMatch(/chain of custody/i);
  });

  it('reports an intact ledger for every seeded item', () => {
    const rows = ctx.db.prepare('SELECT * FROM v_custody_violations').all();
    expect(rows).toEqual([]);
  });

  it('lists evidence with search and filters', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const byCase = (await chief.get('/api/evidence?case_id=1&pageSize=50')).body;
    expect(byCase.items.length).toBeGreaterThanOrEqual(4);
    expect(byCase.items.every((e: { case_id: number }) => e.case_id === 1)).toBe(true);
    const search = (await chief.get('/api/evidence?q=crowbar')).body;
    expect(search.total).toBe(1);
  });
});

describe('clues and other records', () => {
  it('creates, edits and deletes a clue (with scope checks)', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const created = await sana.post('/api/clues', { case_id: 1, title: 'Muddy footprint', discovered_at: '2026-10-22', confidence: 'low', location_id: 1 });
    expect(created.status).toBe(201);
    const id = created.body.record.id;
    expect(created.body.record.clue_code).toMatch(/^CL-\d{4}$/);
    const upd = await sana.patch(`/api/clues/${id}`, { confidence: 'high', status: 'under_review' });
    expect(upd.body.record).toMatchObject({ confidence: 'high', status: 'under_review' });
    const omar = await signIn(ctx.app, ACCOUNTS.omar);
    expect((await omar.patch(`/api/clues/${id}`, { confidence: 'low' })).status).toBe(403);
    expect((await sana.delete(`/api/clues/${id}`)).status).toBe(200);
    expect((await sana.get(`/api/clues/${id}`)).status).toBe(404);
  });

  it('creates a suspect with a generated code and refuses to delete one that is linked to cases', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const created = await sana.post('/api/suspects', { full_name: 'Test Subject', gender: 'female', occupation: 'Tester' });
    expect(created.status).toBe(201);
    expect(created.body.record.suspect_code).toBe('SU-0013');
    const blocked = await chief.delete('/api/suspects/1');
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.message).toMatch(/linked/i);
    expect((await chief.delete(`/api/suspects/${created.body.record.id}`)).status).toBe(200);
    expect((await sana.delete('/api/suspects/2')).status).toBe(403); // delete is chief-only
  });

  it('validates fields (dates, enums, required)', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const res = await sana.post('/api/suspects', { full_name: '', gender: 'robot', date_of_birth: '1990-13-45' });
    expect(res.status).toBe(422);
    expect(Object.keys(res.body.error.details.fields)).toEqual(expect.arrayContaining(['full_name', 'gender', 'date_of_birth']));
  });

  it('creates a location and refuses an exact duplicate', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const body = { name: 'Test Warehouse', address: '1 Test Road', kind: 'business', latitude: 33.7, longitude: 73.1 };
    expect((await sana.post('/api/locations', body)).status).toBe(201);
    expect((await sana.post('/api/locations', body)).status).toBe(409);
    expect((await sana.post('/api/locations', { ...body, name: 'Other', latitude: 123 })).status).toBe(422);
  });

  it('only ever binds user values as parameters (SQL injection attempts are inert)', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const hit = await chief.get(`/api/suspects?q=${encodeURIComponent("'; DROP TABLE suspects; --")}`);
    expect(hit.status).toBe(200);
    expect(hit.body.total).toBe(0);
    expect((await chief.get('/api/suspects')).body.total).toBeGreaterThan(0);
    const sort = await chief.get('/api/suspects?sort=full_name;DROP TABLE suspects');
    expect(sort.status).toBe(200); // unknown sort keys fall back to the default
  });
});
