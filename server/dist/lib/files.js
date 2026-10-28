import crypto from 'crypto';
import { getJwtSecret } from '../env.js';
/** Default lifetime of a signed file URL: 1 hour (matches the old Supabase behaviour). */
const TTL_SECONDS = 3600;
// Strip base64 '=' padding without a regex: /=+$/ is quadratic on inputs such
// as a long run of '=' followed by a non-'=' character, so it is flagged as
// polynomial ReDoS on tainted input. Padding is at most two characters, and a
// char loop is linear and exact for any input.
const stripPadding = (s) => {
    let end = s.length;
    while (end > 0 && s.charCodeAt(end - 1) === 0x3d)
        end--; // 0x3d = '='
    return end === s.length ? s : s.slice(0, end);
};
const b64url = (buf) => stripPadding(Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'));
const unb64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
function sign(data) {
    return b64url(crypto.createHmac('sha256', getJwtSecret()).update(data).digest());
}
/**
 * Create a signed token granting temporary read access to a stored file.
 * The token travels in the URL, so <img src=...> works without an
 * Authorization header (browsers cannot attach one for subresources).
 */
export function createFileToken(relPath, ttlSeconds = TTL_SECONDS) {
    const payload = {
        p: relPath,
        e: Math.floor(Date.now() / 1000) + ttlSeconds,
    };
    const encoded = b64url(JSON.stringify(payload));
    return `${encoded}.${sign(encoded)}`;
}
/** Verify a signed token. Returns the payload, or null if invalid/expired. */
export function verifyFileToken(token) {
    const dot = token.lastIndexOf('.');
    if (dot <= 0)
        return null;
    const encoded = token.slice(0, dot);
    const provided = token.slice(dot + 1);
    const expected = sign(encoded);
    const a = Buffer.from(provided);
    const b = Buffer.from(expected);
    // Constant-time compare to avoid leaking the signature byte-by-byte.
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
        return null;
    try {
        const payload = JSON.parse(unb64url(encoded).toString('utf8'));
        if (typeof payload.p !== 'string' || typeof payload.e !== 'number')
            return null;
        if (payload.e < Math.floor(Date.now() / 1000))
            return null;
        return payload;
    }
    catch {
        return null;
    }
}
