import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, createTestContext, signIn, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(() => { ctx = createTestContext(); });
afterAll(() => ctx.cleanup());

describe('relationship engine', () => {
  it('builds the graph from real rows: nodes, labelled edges and degree counts', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await chief.get('/api/relationships/graph?focus=case:1&depth=1');
    expect(res.status).toBe(200);
    const g = res.body;
    expect(g.focus).toBe('case:1');
    const keys = g.nodes.map((n: { key: string }) => n.key);
    expect(keys).toContain('case:1');
    expect(keys).toContain('suspect:1');
    expect(keys).toContain('evidence:1');
    expect(g.nodes.every((n: { depth: number }) => n.depth <= 1)).toBe(true);
    // every edge connects two returned nodes and carries a label
    for (const e of g.edges) {
      expect(keys).toContain(e.source);
      expect(keys).toContain(e.target);
      expect(e.label).toBeTruthy();
    }
    // counts match what is stored
    const suspects = ctx.db.prepare('SELECT COUNT(*) AS n FROM case_suspects WHERE case_id = 1').get() as { n: number };
    expect(g.nodes.filter((n: { type: string }) => n.type === 'suspect')).toHaveLength(suspects.n);
  });

  it('expands with depth and never loops on cycles', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const d1 = (await chief.get('/api/relationships/graph?focus=suspect:1&depth=1')).body;
    const d2 = (await chief.get('/api/relationships/graph?focus=suspect:1&depth=2')).body;
    const d3 = (await chief.get('/api/relationships/graph?focus=suspect:1&depth=3')).body;
    expect(d2.nodes.length).toBeGreaterThan(d1.nodes.length);
    expect(d3.nodes.length).toBeGreaterThanOrEqual(d2.nodes.length);
    const keys = d3.nodes.map((n: { key: string }) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('flags records that connect several cases', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const g = (await chief.get('/api/relationships/graph?focus=suspect:1&depth=1')).body;
    const rocky = g.nodes.find((n: { key: string }) => n.key === 'suspect:1');
    expect(rocky.case_count).toBe(3);
    const hot = (await chief.get('/api/relationships/hotspots')).body;
    expect(hot.multiCase.some((n: { type: string; id: number }) => n.type === 'suspect' && n.id === 1)).toBe(true);
    expect(hot.topCases.length).toBeGreaterThan(0);
  });

  it('shows a record\'s direct connections with the record at the other end', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = (await chief.get('/api/relationships/node/suspect:1')).body;
    expect(res.node.label).toBe('Rashid Malik');
    expect(res.links.length).toBe(res.node.degree);
    expect(res.counts_by_type.case).toBe(3);
    expect(res.links[0].other.label).toBeTruthy();
  });

  it('records a new association (and it appears in the graph - nothing is hard-coded)', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const before = (await sana.get('/api/relationships/graph?focus=suspect:3&depth=1')).body;
    expect(before.nodes.map((n: { key: string }) => n.key)).not.toContain('location:5');
    const res = await sana.post('/api/relationships', {
      a_type: 'suspect', a_id: 3, b_type: 'location', b_id: 5, relation_type: 'seen_at', confidence: 'low', description: 'Seen near the loading bay',
    });
    expect(res.status).toBe(201);
    const after = (await sana.get('/api/relationships/graph?focus=suspect:3&depth=1')).body;
    // the new record joins the neighbourhood, and the graph is the induced subgraph of everything it now contains
    expect(after.nodes.map((n: { key: string }) => n.key)).toContain('location:5');
    expect(after.nodes.length).toBe(before.nodes.length + 1);
    expect(after.edges.length).toBeGreaterThan(before.edges.length);
    const edge = after.edges.find((e: { id: string }) => e.id === res.body.id);
    expect(edge).toMatchObject({ label: 'Seen at', confidence: 'low', removable: true, description: 'Seen near the loading bay' });
  });

  it('prevents duplicates, including the same pair entered in the opposite direction', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const body = { a_type: 'clue', a_id: 3, b_type: 'suspect', b_id: 10, relation_type: 'points_to' };
    expect((await sana.post('/api/relationships', body)).status).toBe(201);
    const dup = await sana.post('/api/relationships', body);
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE_RELATIONSHIP');
    const reversed = await sana.post('/api/relationships', { a_type: 'suspect', a_id: 10, b_type: 'clue', b_id: 3, relation_type: 'points_to' });
    expect(reversed.status).toBe(409);
  });

  it('only allows relationship types that make sense for the pair of record types', async () => {
    const sana = await signIn(ctx.app, ACCOUNTS.sana);
    const bad = await sana.post('/api/relationships', { a_type: 'suspect', a_id: 1, b_type: 'victim', b_id: 1, relation_type: 'found_at' });
    expect(bad.status).toBe(422);
    expect(bad.body.error.message).toMatch(/Allowed:/);
    const self = await sana.post('/api/relationships', { a_type: 'suspect', a_id: 1, b_type: 'suspect', b_id: 1, relation_type: 'acquainted_with' });
    expect(self.status).toBe(422);
    const missing = await sana.post('/api/relationships', { a_type: 'clue', a_id: 99999, b_type: 'suspect', b_id: 1, relation_type: 'points_to' });
    expect(missing.status).toBe(404);
    const unknownType = await sana.post('/api/relationships', { a_type: 'clue', a_id: 1, b_type: 'suspect', b_id: 1, relation_type: 'invented' });
    expect(unknownType.status).toBe(422);
  });

  it('routes case-to-person associations into the junction tables', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await chief.post('/api/relationships', {
      a_type: 'suspect', a_id: 8, b_type: 'case', b_id: 1, relation_type: 'suspect_in_case', involvement_status: 'questioned',
    });
    expect(res.status).toBe(201);
    expect(res.body.structural).toBe(true);
    const row = ctx.db.prepare('SELECT involvement_status FROM case_suspects WHERE case_id = 1 AND suspect_id = 8').get() as { involvement_status: string };
    expect(row.involvement_status).toBe('questioned');
    const del = await chief.delete(`/api/relationships/${encodeURIComponent(res.body.id)}`);
    expect(del.status).toBe(200);
    expect(ctx.db.prepare('SELECT 1 FROM case_suspects WHERE case_id = 1 AND suspect_id = 8').get()).toBeUndefined();
    expect(ctx.db.prepare('SELECT 1 FROM suspects WHERE id = 8').get()).toBeTruthy(); // the person is kept
  });

  it('removes a recorded relationship but refuses to remove a connection that belongs to the record itself', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const g = (await chief.get('/api/relationships/graph?focus=evidence:1&depth=1')).body;
    const intrinsic = g.edges.find((e: { table: string }) => e.table === 'evidence');
    expect(intrinsic.removable).toBe(false);
    const refused = await chief.delete(`/api/relationships/${encodeURIComponent(intrinsic.id)}`);
    expect(refused.status).toBe(400);
    const rec = g.edges.find((e: { table: string }) => e.table === 'relationships');
    const ok = await chief.delete(`/api/relationships/${encodeURIComponent(rec.id)}`);
    expect(ok.status).toBe(200);
    expect((await chief.delete(`/api/relationships/${encodeURIComponent(rec.id)}`)).status).toBe(404);
  });

  it('cross-case links must point at a different case than the item\'s home case', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await chief.post('/api/relationships', { a_type: 'case', a_id: 1, b_type: 'evidence', b_id: 1, relation_type: 'related_case' });
    expect(res.status).toBe(409);
    expect(res.body.error.message).toMatch(/already belongs/);
  });

  it('lets evidence officers read the graph but not change it', async () => {
    const officer = await signIn(ctx.app, ACCOUNTS.evidence);
    expect((await officer.get('/api/relationships/graph?focus=case:1')).status).toBe(200);
    const res = await officer.post('/api/relationships', { a_type: 'clue', a_id: 1, b_type: 'suspect', b_id: 2, relation_type: 'points_to' });
    expect(res.status).toBe(403);
  });

  it('finds the shortest connection between two records', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const res = (await chief.get('/api/relationships/path?from=suspect:2&to=suspect:9')).body;
    expect(res.found).toBe(true);
    expect(res.nodes[0].key).toBe('suspect:2');
    expect(res.nodes.at(-1).key).toBe('suspect:9');
    expect(res.edges).toHaveLength(res.hops);
    const none = (await chief.get('/api/relationships/path?from=suspect:11&to=victim:8&max=2')).body;
    expect(none.found).toBe(false);
  });

  it('lists permitted relationship types and looks records up for the picker', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const rules = (await chief.get('/api/relationships/rules')).body;
    expect(rules.types.length).toBeGreaterThan(5);
    expect(rules.structural.map((s: { b_type: string }) => s.b_type)).toEqual(['suspect', 'victim', 'witness']);
    const items = (await chief.get('/api/relationships/lookup?type=suspect&q=zain')).body.items;
    expect(items[0]).toMatchObject({ type: 'suspect', label: 'Zain Aslam' });
    expect((await chief.get('/api/relationships/lookup?type=bogus')).status).toBe(422);
    expect((await chief.get('/api/relationships/graph?focus=nonsense')).status).toBe(422);
    expect((await chief.get('/api/relationships/graph?focus=case:99999')).status).toBe(404);
  });

  it('removes dangling relationships when a record is deleted', async () => {
    const chief = await signIn(ctx.app, ACCOUNTS.chief);
    const sus = await chief.post('/api/suspects', { full_name: 'Temporary Person' });
    const id = sus.body.record.id;
    await chief.post('/api/relationships', { a_type: 'clue', a_id: 1, b_type: 'suspect', b_id: id, relation_type: 'points_to' });
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM relationships WHERE b_type = ? AND b_id = ?').get('suspect', id)).toEqual({ n: 1 });
    await chief.delete(`/api/suspects/${id}`);
    expect(ctx.db.prepare('SELECT COUNT(*) AS n FROM relationships WHERE b_type = ? AND b_id = ?').get('suspect', id)).toEqual({ n: 0 });
  });
});
