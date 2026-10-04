import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { sql } from '../db/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'ciodesk-secret-key-change-in-production';

export interface AuthRequest extends Request {
  user?: {
    id: string;
    username: string;
    role: string;
    full_name: string | null;
    office: string | null;
    is_active: boolean;
  };
}

export function generateToken(user: { id: string; username: string; role: string }): string {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export async function authMiddleware(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'No token provided' });
    return;
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as { id: string; username: string; role: string };
    const users = await sql`
      SELECT id, username, role, full_name, office, is_active
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
    req.user = user as AuthRequest['user'];
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

export function requireRole(...roles: string[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
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
