import postgres from 'postgres';
// Loads .env and exposes isProduction; must run before we read process.env.
import { isProduction } from '../env.js';

const connectionString = process.env.DATABASE_URL;
if (!connectionString && isProduction) {
  throw new Error(
    '[db] DATABASE_URL is not set. Refusing to start in production without an ' +
      'explicit database connection string.',
  );
}

export const sql = postgres(
  connectionString || 'postgres://postgres:postgres@localhost:5432/helpdesk',
  {
    max: 10,
    idle_timeout: 30,
    connect_timeout: 10,
  },
);

export async function testConnection(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
