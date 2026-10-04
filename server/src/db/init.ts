import '../env.js';
import { sql, testConnection } from './index.js';
import { runMigrations, ensureAdminUser } from './migrate.js';

async function init() {
  console.log('[init] connecting to database...');
  if (!(await testConnection())) {
    console.error('[init] cannot connect. Check DATABASE_URL and that PostgreSQL is running.');
    process.exit(1);
  }

  await runMigrations();
  console.log('[init] schema applied');

  await ensureAdminUser();
  console.log('[init] done');
  process.exit(0);
}

init().catch((error) => {
  console.error('[init] failed:', error);
  process.exit(1);
});
