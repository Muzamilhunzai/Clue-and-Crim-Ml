import { config } from './config';
import { openDatabase } from './database/connection';
import { migrate } from './database/migrate';
import { createApp } from './app';

const db = openDatabase();
const result = migrate(db);
if (result.applied.length) console.log(`Applied migrations: ${result.applied.join(', ')}`);

const hasUsers = (db.prepare('SELECT COUNT(*) AS n FROM users').get() as { n: number }).n > 0;
if (!hasUsers) {
  console.warn('\n  The database has no accounts yet. Run:  npm run db:seed   (demo data)\n');
}

const app = createApp(db);
const server = app.listen(config.port, () => {
  console.log(`TraceNet API listening on http://localhost:${config.port}  (${config.env})`);
  console.log(`Database: ${config.databasePath}`);
});

function shutdown() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
