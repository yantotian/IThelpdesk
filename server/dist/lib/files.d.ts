export interface FileTokenPayload {
    /** Path relative to UPLOAD_DIR, e.g. "ticket-attachments/<ticketId>/<file>". */
    p: string;
    /** Expiry, seconds since epoch. */
    e: number;
}
/**
 * Create a signed token granting temporary read access to a stored file.
 * The token travels in the URL, so <img src=...> works without an
 * Authorization header (browsers cannot attach one for subresources).
 */
export declare function createFileToken(relPath: string, ttlSeconds?: number): string;
/** Verify a signed token. Returns the payload, or null if invalid/expired. */
export declare function verifyFileToken(token: string): FileTokenPayload | null;
