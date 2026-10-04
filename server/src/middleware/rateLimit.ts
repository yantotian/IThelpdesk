import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

// Keyed on client IP. That is the only signal available at this point in the
// chain: the limiter is mounted ahead of authMiddleware so that it guards the
// authorization call itself, which means req.user is not populated yet.
//
// The practical consequence: on a shared egress (a whole office behind one
// NAT address) the whole office shares a budget, so `limit` below is sized
// with that in mind rather than for a single person.
const keyByIp = (req: import('express').Request): string => ipKeyGenerator(req.ip ?? '');

const shared = {
  // ipKeyGenerator() normalizes IPv6 to a /56 subnet, so a single client
  // cannot rotate through its own addresses to reset the window for free.
  keyGenerator: keyByIp,
  standardHeaders: 'draft-7' as const,
  legacyHeaders: false,
};

// Generous ceiling for the authenticated API: high enough that a busy office
// on one address will not trip it, low enough to bound a flood.
export const apiLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

// Tight limit for the credential endpoints. skipSuccessfulRequests means only
// failed attempts count, so a legitimate user is never locked out by their own
// successful logins. Keyed on IP rather than username on purpose: keying on the
// account would let an anonymous caller lock a known user out.
export const loginLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 20,
  skipSuccessfulRequests: true,
  message: { error: 'Too many login attempts. Please wait before trying again.' },
});

// Password changes run bcrypt.compare and then bcrypt.hash, so every attempt
// costs real CPU (~100ms at cost 10) no matter whether it succeeds. Unlike the
// login limiter this counts every attempt rather than only failures, which is
// what actually bounds the hashing work; 10 per 15 minutes is far more than any
// real user needs for a self-service password change.
export const passwordChangeLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 10,
  message: { error: 'Too many password change attempts. Please wait before trying again.' },
});

// Bounds the SPA catch-all in index.ts, which is reached on every client-side
// navigation. The ceiling is deliberately high: that handler now serves an
// in-memory buffer, so this exists to put a bound on the route rather than to
// stop a real workload. Set it low and a shared office egress starts getting
// 429s on ordinary page transitions, which is worse than the thing being
// guarded against. Tune upward if a large deployment ever hits it.
export const spaShellLimiter = rateLimit({
  ...shared,
  windowMs: 15 * 60 * 1000,
  limit: 3000,
  message: { error: 'Too many requests. Please slow down and try again shortly.' },
});

// Counters live in process memory, which matches the single-container
// deployment in docker-compose.yml. If this is ever scaled to more than one
// replica, each replica will enforce its own independent budget — swap the
// store for a shared backend (rate-limit-redis) at that point.