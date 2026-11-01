import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    // Hermetic: a developer's own .env (demo mode, custom password, ports...) must never change test results.
    // dotenv does not override variables that are already set, so these win over .env.
    env: {
      NODE_ENV: 'test',
      DEMO_MODE: 'false',
      DEMO_PASSWORD: 'TraceNet@2026',
      SESSION_TTL_HOURS: '12',
      COOKIE_SECURE: 'false',
      CLIENT_ORIGIN: 'http://localhost:5173',
    },
    include: ['tests/**/*.test.ts'],
    pool: 'forks',
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
