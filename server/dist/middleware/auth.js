import jwt from 'jsonwebtoken';
import { sql } from '../db/index.js';
import { getJwtSecret } from '../env.js';
import { hasCustomPage } from '../permissions.js';
export function generateToken(user) {
    return jwt.sign({ id: user.id, username: user.username, role: user.role }, getJwtSecret(), { expiresIn: '7d' });
}
export async function authMiddleware(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'No token provided' });
        return;
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, getJwtSecret());
        const users = await sql `
      SELECT id, username, role, full_name, office, is_active, is_approved
      FROM users WHERE id = ${decoded.id} LIMIT 1
    `;
        if (users.length === 0) {
            res.status(401).json({ error: 'User not found' });
            return;
        }
        const user = users[0];
        if (!user.is_active) {
            res.status(401).json({ error: 'Account is deactivated' });
            return;
        }
        if (!user.is_approved) {
            res.status(401).json({ error: 'Account pending approval' });
            return;
        }
        req.user = user;
        next();
    }
    catch {
        res.status(401).json({ error: 'Invalid token' });
    }
}
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        if (!roles.includes(req.user.role)) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }
        next();
    };
}
// Like requireRole, but a custom role (see routes/roles.ts) that was granted
// the page also passes. Built-in roles keep the exact allowlist behaviour.
export function requireAccess(rolesAllowed, page) {
    return async (req, res, next) => {
        if (!req.user) {
            res.status(401).json({ error: 'Not authenticated' });
            return;
        }
        // Express 4 does not await async middleware — catch here so a DB error
        // becomes a 500 instead of an unhandled rejection.
        try {
            if (rolesAllowed.includes(req.user.role) || await hasCustomPage(req.user.role, page)) {
                next();
                return;
            }
        }
        catch (error) {
            console.error('requireAccess error:', error);
            res.status(500).json({ error: 'Internal server error' });
            return;
        }
        res.status(403).json({ error: 'Insufficient permissions' });
    };
}
