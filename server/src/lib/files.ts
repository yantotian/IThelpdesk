import crypto from 'crypto';

const SECRET = () => process.env.JWT_SECRET || 'ciodesk-secret-key-change-in-production';

/** Default lifetime of a signed file URL: 1 hour (matches the old Supabase behaviour). */
const TTL_SECONDS = 3600;

export interface FileTokenPayload {
  /** Path relative to UPLOAD_DIR, e.g. "ticket-attachments/<ticketId>/<file>". */
  p: string;
  /** Expiry, seconds since epoch. */
  e: number;
}

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf as never).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

const unb64url = (s: string) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(data: string): string {
  return b64url(crypto.createHmac('sha256', SECRET()).update(data).digest());
}

/**
 * Create a signed token granting temporary read access to a stored file.
 * The token travels in the URL, so <img src=...> works without an
 * Authorization header (browsers cannot attach one for subresources).
 */
export function createFileToken(relPath: string, ttlSeconds = TTL_SECONDS): string {
  const payload: FileTokenPayload = {
    p: relPath,
    e: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const encoded = b64url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded)}`;
}

/** Verify a signed token. Returns the payload, or null if invalid/expired. */
export function verifyFileToken(token: string): FileTokenPayload | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const encoded = token.slice(0, dot);
  const provided = token.slice(dot + 1);

  const expected = sign(encoded);
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // Constant-time compare to avoid leaking the signature byte-by-byte.
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(unb64url(encoded).toString('utf8')) as FileTokenPayload;
    if (typeof payload.p !== 'string' || typeof payload.e !== 'number') return null;
    if (payload.e < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}
