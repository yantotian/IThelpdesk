import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import bcrypt from 'bcryptjs';
import { sql } from './index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Applies the full schema. Idempotent: safe to run on every boot.
 * schema.sql ships next to this file in dev (src/db) and is copied into the
 * image alongside dist (db/schema.sql) in production.
 */
export async function runMigrations(): Promise<void> {
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.join(__dirname, '..', '..', 'src', 'db', 'schema.sql'),
    path.join(process.cwd(), 'src', 'db', 'schema.sql'),
    path.join(process.cwd(), 'server', 'src', 'db', 'schema.sql'),
  ];
  const schemaPath = candidates.find((p) => fs.existsSync(p));
  if (!schemaPath) {
    throw new Error(`schema.sql not found. Looked in:\n  ${candidates.join('\n  ')}`);
  }

  const schema = fs.readFileSync(schemaPath, 'utf8');
  await sql.unsafe(schema);
}

/** Creates the bootstrap admin account if no user with that username exists. */
export async function ensureAdminUser(): Promise<void> {
  const username = (process.env.ADMIN_USERNAME || 'admin').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'admin123';

  const existing = await sql`SELECT id FROM users WHERE username = ${username} LIMIT 1`;
  if (existing.length > 0) return;

  const hash = await bcrypt.hash(password, 10);
  await sql`
    INSERT INTO users (username, email, password_hash, full_name, role, is_active)
    VALUES (${username}, ${`${username}@ciodesk.com`}, ${hash}, 'System Administrator', 'sysadmin', true)
  `;
  // Do not echo the admin username here: it comes from ADMIN_USERNAME, so
  // logging it writes clear-text environment data into the container log.
  console.log('[init] created default sysadmin account — change this password after first login.');
}
