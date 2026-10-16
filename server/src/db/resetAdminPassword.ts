import '../env.js';
import bcrypt from 'bcryptjs';
import { isProduction } from '../env.js';
import { sql, testConnection } from './index.js';

/**
 * Resets the bootstrap administrator's password to ADMIN_PASSWORD from the
 * environment (server/.env for a manual run, the compose file for Docker).
 *
 * `ensureAdminUser` only inserts when no user with that username exists, so
 * changing ADMIN_PASSWORD after the first boot silently does nothing: the
 * stored hash drifts away from the config and the admin can no longer sign in.
 * This script is the explicit, repeatable way to bring the two back in sync.
 *
 * Usage:
 *   npm --prefix server run admin:reset-password
 *
 * The password is read from ADMIN_PASSWORD only — never from argv, where it
 * would be visible in the process list.
 */
async function main(): Promise<void> {
  if (!(await testConnection())) {
    console.error('[reset] cannot connect. Check DATABASE_URL and that PostgreSQL is running.');
    process.exit(1);
  }

  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  // Same floor the admin-reset route enforces; the 12-character rule is what
  // production seeding requires, so warn instead of failing an explicit reset.
  if (!password || password.length < 8) {
    console.error('[reset] ADMIN_PASSWORD must be set to at least 8 characters.');
    process.exit(1);
  }
  if (password.length < 12) {
    console.warn(
      '[reset] WARNING: ADMIN_PASSWORD is shorter than 12 characters. ' +
        'Seeding this value on a fresh production database would be refused.',
    );
  }
  if (isProduction) {
    console.warn('[reset] NOTE: NODE_ENV=production — the live production admin is being reset.');
  }

  const users = await sql`
    SELECT id, is_active FROM users WHERE username = ${username} LIMIT 1
  `;
  if (users.length === 0) {
    console.error(
      `[reset] no user '${username}'. Run \`npm --prefix server run db:init\` first — ` +
        'ADMIN_PASSWORD is only applied when the account is created.',
    );
    process.exit(1);
  }

  const hash = await bcrypt.hash(password, 10);
  await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${users[0].id}`;

  if (!users[0].is_active) {
    console.warn(
      `[reset] WARNING: '${username}' is deactivated — login stays blocked until it is reactivated.`,
    );
  }

  console.log(`[reset] password updated for '${username}'. It now matches ADMIN_PASSWORD.`);
  await sql.end();
}

main().catch((error) => {
  console.error('[reset] failed:', error);
  process.exit(1);
});
