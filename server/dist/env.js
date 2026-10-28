import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// Must be imported BEFORE anything that reads process.env, because ES module
// imports are evaluated in declaration order.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
for (const candidate of [
    path.join(__dirname, '..', '.env'),
    path.join(process.cwd(), '.env'),
    path.join(process.cwd(), 'server', '.env'),
]) {
    if (fs.existsSync(candidate)) {
        config({ path: candidate });
        break;
    }
}
export const isProduction = process.env.NODE_ENV === 'production';
const DEV_FALLBACK_SECRET = 'dev-only-insecure-secret-do-not-use-in-production';
// Values that ship in the repo/docs and must never be trusted as real secrets.
const KNOWN_WEAK_SECRETS = new Set([
    'ciodesk-secret-key-change-in-production',
    DEV_FALLBACK_SECRET,
]);
let warnedAboutSecret = false;
/**
 * Returns the secret used to sign JWTs and file-access tokens.
 *
 * In production a missing or placeholder secret is fatal — the process refuses
 * to boot rather than silently signing tokens with a value an attacker knows.
 * In development we fall back to a clearly-marked throwaway value so `npm run
 * dev` keeps working out of the box.
 */
export function getJwtSecret() {
    const secret = process.env.JWT_SECRET;
    const weak = !secret || secret.includes('change-') || KNOWN_WEAK_SECRETS.has(secret);
    if (!weak)
        return secret;
    if (isProduction) {
        throw new Error('[env] JWT_SECRET is unset or still a placeholder. Refusing to start in ' +
            'production — generate a strong value with `openssl rand -base64 48`.');
    }
    if (!warnedAboutSecret) {
        warnedAboutSecret = true;
        console.warn('[env] WARNING: JWT_SECRET is unset or still a placeholder. Using an ' +
            'insecure development-only secret. Never do this in production.');
    }
    return DEV_FALLBACK_SECRET;
}
