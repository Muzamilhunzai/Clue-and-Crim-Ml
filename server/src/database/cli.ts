/* Database command line:  migrate | seed | reset | schema | verify */
import fs from 'node:fs';
import { config } from '../config';
import { openDatabase } from './connection';
import { migrate, buildSchemaFile } from './migrate';
import { seed } from './seed';

const command = process.argv[2];

function removeDbFiles() {
  for (const suffix of ['', '-wal', '-shm']) {
    const f = config.databasePath + suffix;
    if (fs.existsSync(f)) fs.rmSync(f);
  }
}

try {
  switch (command) {
    case 'migrate': {
      const db = openDatabase();
      const r = migrate(db);
      console.log(`Migrations applied: ${r.applied.join(', ') || 'none (already up to date)'}`);
      db.close();
      break;
    }
    case 'seed': {
      const db = openDatabase();
      migrate(db);
      const r = seed(db);
      console.log(`Seeded fictional data and ${r.users} demo accounts. Demo password: see DEMO_PASSWORD in .env (default in .env.example).`);
      db.close();
      break;
    }
    case 'reset': {
      removeDbFiles();
      const db = openDatabase();
      const m = migrate(db);
      const r = seed(db);
      console.log(`Database recreated at ${config.databasePath}`);
      console.log(`  migrations: ${m.applied.join(', ')}`);
      console.log(`  seeded ${r.users} demo accounts + fictional case data`);
      db.close();
      break;
    }
    case 'schema': {
      fs.writeFileSync(config.schemaFile, buildSchemaFile());
      console.log(`Wrote ${config.schemaFile}`);
      break;
    }
    case 'verify': {
      const db = openDatabase();
      const fk = db.prepare('PRAGMA foreign_key_check').all();
      const ic = db.prepare('PRAGMA integrity_check').get() as { integrity_check: string };
      const custody = db.prepare('SELECT * FROM v_custody_violations').all();
      console.log({ foreignKeyViolations: fk.length, integrity: ic.integrity_check, custodyViolations: custody.length });
      db.close();
      break;
    }
    default:
      console.error('Usage: cli.ts <migrate|seed|reset|schema|verify>');
      process.exit(1);
  }
} catch (err) {
  console.error((err as Error).message);
  process.exit(1);
}
