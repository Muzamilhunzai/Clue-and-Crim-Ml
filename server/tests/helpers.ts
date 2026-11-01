import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app';
import { openDatabase, type Db } from '../src/database/connection';
import { migrate } from '../src/database/migrate';
import { seed } from '../src/database/seed';

export const DEMO_PASSWORD = 'TraceNet@2026';

export interface TestContext {
  db: Db;
  app: ReturnType<typeof createApp>;
  file: string;
  cleanup: () => void;
}

/** A fresh, seeded, file-backed database per test file (a file is needed for the two-connection isolation demo). */
export function createTestContext(): TestContext {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tracenet-test-'));
  const file = path.join(dir, 'test.db');
  const db = openDatabase(file);
  migrate(db);
  seed(db, DEMO_PASSWORD);
  const app = createApp(db);
  return {
    db, app, file,
    cleanup: () => {
      db.close();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

/** A signed-in HTTP client (keeps the session cookie, adds the CSRF header to every request). */
export async function signIn(app: TestContext['app'], login: string, password = DEMO_PASSWORD) {
  const agent = request.agent(app);
  const res = await agent.post('/api/auth/login').set('X-TraceNet-Client', 'web').send({ login, password });
  if (res.status !== 200) throw new Error(`Could not sign in as ${login}: ${res.status} ${JSON.stringify(res.body)}`);
  const h = <T extends request.Test>(t: T) => t.set('X-TraceNet-Client', 'web');
  return {
    agent,
    user: res.body.user as { id: number; role: string; full_name: string },
    get: (url: string) => agent.get(url),
    post: (url: string, body?: object) => h(agent.post(url)).send(body ?? {}),
    patch: (url: string, body?: object) => h(agent.patch(url)).send(body ?? {}),
    delete: (url: string) => h(agent.delete(url)),
  };
}

export const ACCOUNTS = {
  chief: 'chief@tracenet.local',
  sana: 'sana@tracenet.local',       // lead on cases 1, 4, 8, 9
  bilal: 'bilal@tracenet.local',
  omar: 'omar@tracenet.local',
  evidence: 'evidence@tracenet.local',
};
