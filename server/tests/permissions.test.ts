import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, createTestContext, signIn, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(() => { ctx = createTestContext(); });
afterAll(() => ctx.cleanup());

const newCase = { title: 'Permissions probe case', crime_type: 'theft', incident_date: '2026-01-05' };

describe('role-based access control (enforced on the server)', () => {
  it('lets chiefs and investigators open cases but not evidence officers', async () => {
    const officer = await signIn(ctx.app, ACCOUNTS.evidence);
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    expect((await officer.post('/api/cases', newCase)).status).toBe(403);
    const res = await sana.post('/api/cases', newCase);
    expect(res.status).toBe(201);
    expect(res.body.investigators[0]).toMatchObject({ id: sana.user.id, assignment_role: 'lead' }); // creator becomes lead
  });

  it('stops an investigator from assigning other people while opening a case', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const res = await sana.post('/api/cases', { ...newCase, lead_id: 3 });
    expect(res.status).toBe(403);
  });

  it('only lets an investigator edit cases they are assigned to', async () => {
    const omar = await signIn(ctx.app, ACCOUNTS.omar);  // not on case 1
    const sana = await signIn(ctx.app, ACCOUNTS.sana);  // lead on case 1
    const detail = (await sana.get('/api/cases/1')).body;
    const denied = await omar.patch('/api/cases/1', { title: 'Hijacked title', version: detail.case.version });
    expect(denied.status).toBe(403);
    const allowed = await sana.patch('/api/cases/1', { title: 'Harbor Street Jewellery Store Burglary', version: detail.case.version });
    expect(allowed.status).toBe(200);
  });

  it('hides edit capability from users who may not edit', async () => {
    const omar = await signIn(ctx.app, ACCOUNTS.omar);
    const res = await omar.get('/api/cases/1');
    expect(res.body.permissions.can_edit).toBe(false);
  });

  it('restricts archive/assign to chief investigators', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    expect((await sana.post('/api/cases/8/archive')).status).toBe(403);
    expect((await sana.post('/api/cases/1/investigators', { user_id: 4, role: 'support' })).status).toBe(403);
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    expect((await chief.post('/api/cases/1/investigators', { user_id: 4, role: 'support' })).status).toBe(201);
  });

  it('lets only evidence officers and chiefs transfer custody', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const officer = await signIn(ctx.app, ACCOUNTS.evidence);
    expect((await sana.post('/api/evidence/1/custody', { to_custodian_id: 4, reason: 'Needs analysis' })).status).toBe(403);
    expect((await officer.post('/api/evidence/1/custody', { to_custodian_id: 4, reason: 'Signed out for analysis' })).status).toBe(201);
  });

  it('keeps evidence officers read-only on people, cases and clues', async () => {
    const officer = await signIn(ctx.app, ACCOUNTS.evidence);
    expect((await officer.patch('/api/suspects/1', { notes: 'x' })).status).toBe(403);
    expect((await officer.post('/api/clues', { case_id: 1, title: 'Sneaky clue', discovered_at: '2026-01-01' })).status).toBe(403);
    expect((await officer.get('/api/suspects')).status).toBe(200);
  });

  it('masks restricted victim and witness fields per role', async () => {
    const officer = await signIn(ctx.app, ACCOUNTS.evidence);
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const chief = await signIn(ctx.app, ACCOUNTS.chief);

    const asOfficer = (await officer.get('/api/victims/3')).body.record;
    expect(asOfficer.phone).toBeNull();
    expect(asOfficer.restricted_fields).toContain('phone');
    expect((await sana.get('/api/victims/3')).body.record.phone).toBeTruthy();

    // protected witness (id 6): contact details are chief-only
    expect((await sana.get('/api/witnesses/6')).body.record.phone).toBeNull();
    expect((await chief.get('/api/witnesses/6')).body.record.phone).toBeTruthy();
    // list endpoints mask the same way
    const list = (await sana.get('/api/witnesses?pageSize=50')).body.items as { id: number; phone: string | null }[];
    expect(list.find((w) => w.id === 6)!.phone).toBeNull();
    expect(list.find((w) => w.id === 1)!.phone).toBeTruthy();
  });

  it('refuses edits to restricted fields the user cannot see', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const res = await sana.patch('/api/witnesses/6', { phone: '+92 000 000' });
    expect(res.status).toBe(403);
  });

  it('shows contact details of investigators only to the chief (and to oneself)', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const seenBySana = (await sana.get('/api/investigators')).body.items as { id: number; email: string | null }[];
    expect(seenBySana.find((u) => u.id === 3)!.email).toBeNull();
    expect(seenBySana.find((u) => u.id === sana.user.id)!.email).toBeTruthy();
    const seenByChief = (await chief.get('/api/investigators')).body.items as { id: number; email: string | null }[];
    expect(seenByChief.find((u) => u.id === 3)!.email).toBeTruthy();
  });

  it('limits user management and the ADBMS lab to chief investigators', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    expect((await sana.post('/api/investigators', {})).status).toBe(403);
    expect((await sana.get('/api/lab/overview')).status).toBe(403);
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    expect((await chief.get('/api/lab/overview')).status).toBe(200);
  });

  it('protects the last chief investigator and one\'s own account', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await chief.patch(`/api/investigators/${chief.user.id}`, { is_active: false });
    expect(res.status).toBe(409);
  });
});
