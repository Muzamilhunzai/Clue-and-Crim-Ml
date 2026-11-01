import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ACCOUNTS, createTestContext, DEMO_PASSWORD, signIn, type TestContext } from './helpers';

let ctx: TestContext;
beforeAll(() => { ctx = createTestContext(); });
afterAll(() => ctx.cleanup());

const web = (t: request.Test) => t.set('X-TraceNet-Client', 'web');

describe('authentication', () => {
  it('signs in with email, sets an HttpOnly cookie, never exposes the password hash', async () => {
    const res = await web(request(ctx.app).post('/api/auth/login')).send({ login: ACCOUNTS.chief, password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.user.role).toBe('chief_investigator');
    expect(JSON.stringify(res.body)).not.toMatch(/password/i);
    const cookie = String(res.headers['set-cookie']);
    expect(cookie).toMatch(/tn_session=/);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });

  it('also accepts the username', async () => {
    const res = await web(request(ctx.app).post('/api/auth/login')).send({ login: 'sana', password: DEMO_PASSWORD });
    expect(res.status).toBe(200);
  });

  it('stores only a hash of the session token', async () => {
    const res = await web(request(ctx.app).post('/api/auth/login')).send({ login: ACCOUNTS.omar, password: DEMO_PASSWORD });
    const token = /tn_session=([^;]+)/.exec(String(res.headers['set-cookie']))![1];
    const rows = ctx.db.prepare('SELECT token_hash FROM sessions').all() as { token_hash: string }[];
    expect(rows.some((r) => r.token_hash === token)).toBe(false);
    expect(rows.some((r) => r.token_hash.length === 64)).toBe(true);
  });

  it('rejects a wrong password and an unknown user with the same message', async () => {
    const bad = await web(request(ctx.app).post('/api/auth/login')).send({ login: ACCOUNTS.chief, password: 'nope-nope-nope' });
    const unknown = await web(request(ctx.app).post('/api/auth/login')).send({ login: 'ghost@nowhere.test', password: 'nope-nope-nope' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.error.message).toBe(unknown.body.error.message);
  });

  it('validates the login form and returns field messages', async () => {
    const res = await web(request(ctx.app).post('/api/auth/login')).send({ login: '', password: '' });
    expect(res.status).toBe(422);
    expect(res.body.error.details.fields.login).toBeTruthy();
    expect(res.body.error.details.fields.password).toBeTruthy();
  });

  it('refuses deactivated accounts', async () => {
    const res = await web(request(ctx.app).post('/api/auth/login')).send({ login: 'kamran', password: DEMO_PASSWORD });
    expect(res.status).toBe(403);
  });

  it('protects every data route without a session', async () => {
    for (const url of ['/api/cases', '/api/dashboard', '/api/suspects', '/api/relationships/graph?focus=case:1', '/api/lab/overview']) {
      const res = await request(ctx.app).get(url);
      expect(res.status, url).toBe(401);
      expect(res.body.error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('returns the current user on /me and ends the session on logout', async () => {
    const c = await signIn(ctx.app, ACCOUNTS.sana);
    expect((await c.get('/api/auth/me')).body.user.username).toBe('sana');
    expect((await c.post('/api/auth/logout')).status).toBe(200);
    expect((await c.get('/api/auth/me')).status).toBe(401);
  });

  it('blocks state-changing requests that lack the CSRF header', async () => {
    const c = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await c.agent.post('/api/cases').send({ title: 'x' });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('CSRF');
  });

  it('blocks state-changing requests from a foreign Origin', async () => {
    const c = await signIn(ctx.app, ACCOUNTS.chief);
    const res = await c.agent.post('/api/cases').set('X-TraceNet-Client', 'web').set('Origin', 'https://evil.example').send({});
    expect(res.status).toBe(403);
  });

  it('changes a password, signs out other devices and enforces the policy', async () => {
    const other = await signIn(ctx.app, ACCOUNTS.omar);
    const c = await signIn(ctx.app, ACCOUNTS.omar);
    const weak = await c.post('/api/auth/change-password', { current_password: DEMO_PASSWORD, new_password: 'short' });
    expect(weak.status).toBe(422);
    const wrong = await c.post('/api/auth/change-password', { current_password: 'incorrect-1', new_password: 'BrandNewPass9' });
    expect(wrong.status).toBe(422);
    const ok = await c.post('/api/auth/change-password', { current_password: DEMO_PASSWORD, new_password: 'BrandNewPass9' });
    expect(ok.status).toBe(200);
    expect((await other.get('/api/auth/me')).status).toBe(401); // other session revoked
    expect((await c.get('/api/auth/me')).status).toBe(200);     // current session kept
    await expect(signIn(ctx.app, ACCOUNTS.omar)).rejects.toThrow();
    await signIn(ctx.app, ACCOUNTS.omar, 'BrandNewPass9');
  });

  it('only exposes demo accounts when DEMO_MODE is on', async () => {
    const res = await request(ctx.app).get('/api/auth/demo');
    expect(res.status).toBe(200);
    expect(res.body.enabled).toBe(false); // test environment: DEMO_MODE not set
  });
});
