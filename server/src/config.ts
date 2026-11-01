import path from 'node:path';
import dotenv from 'dotenv';

// Project root = the folder that contains the "server", "client" and "database" folders.
export const ROOT_DIR = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true });

const bool = (value: string | undefined, fallback: boolean) =>
  value === undefined || value === '' ? fallback : ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());

const int = (value: string | undefined, fallback: number) => {
  const n = Number.parseInt(value ?? '', 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

const env = process.env.NODE_ENV ?? 'development';

export const config = {
  env,
  isProduction: env === 'production',
  isTest: env === 'test',
  port: int(process.env.PORT, 4000),
  databasePath: path.resolve(ROOT_DIR, process.env.DATABASE_PATH ?? 'database/data/tracenet.db'),
  migrationsDir: path.join(ROOT_DIR, 'database', 'migrations'),
  seedFile: path.join(ROOT_DIR, 'database', 'seed.sql'),
  schemaFile: path.join(ROOT_DIR, 'database', 'schema.sql'),
  clientDist: path.join(ROOT_DIR, 'client', 'dist'),
  sessionTtlHours: int(process.env.SESSION_TTL_HOURS, 12),
  cookieName: 'tn_session',
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  demoMode: bool(process.env.DEMO_MODE, false),
  demoPassword: process.env.DEMO_PASSWORD ?? 'TraceNet@2026',
  bcryptRounds: env === 'test' ? 4 : 10,
};

if (config.isProduction && config.demoMode) {
  throw new Error('Refusing to start: DEMO_MODE=true is not allowed when NODE_ENV=production.');
}
