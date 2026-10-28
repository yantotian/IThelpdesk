export declare const isProduction: boolean;
/**
 * Returns the secret used to sign JWTs and file-access tokens.
 *
 * In production a missing or placeholder secret is fatal — the process refuses
 * to boot rather than silently signing tokens with a value an attacker knows.
 * In development we fall back to a clearly-marked throwaway value so `npm run
 * dev` keeps working out of the box.
 */
export declare function getJwtSecret(): string;
