/**
 * Applies the full schema. Idempotent: safe to run on every boot.
 * schema.sql ships next to this file in dev (src/db) and is copied into the
 * image alongside dist (db/schema.sql) in production.
 */
export declare function runMigrations(): Promise<void>;
/** Creates the bootstrap admin account if no user with that username exists. */
export declare function ensureAdminUser(): Promise<void>;
