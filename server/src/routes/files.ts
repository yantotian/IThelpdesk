import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import { sql } from '../db/index.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { createFileToken, verifyFileToken } from '../lib/files.js';

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const isAdmin = (role: string) => role === 'it_admin' || role === 'sysadmin';

/**
 * Resolve a caller-relative path to an absolute path, refusing anything that
 * escapes UPLOAD_DIR (path traversal, absolute paths, symlink tricks).
 */
function resolveSafePath(relPath: string): string | null {
  const root = path.resolve(uploadDir);
  const full = path.resolve(root, relPath);
  if (full !== root && !full.startsWith(root + path.sep)) return null;
  return full;
}

/**
 * Mirror the Supabase storage policies that migration 00009 put in place:
 *  - ticket attachments: ticket participants (requester/assignee) + admins
 *  - ID photos / signatures: owner only + admins (these hold PII)
 */
async function canAccess(
  relPath: string,
  user: { id: string; role: string },
): Promise<boolean> {
  if (isAdmin(user.role)) return true;

  if (relPath.startsWith('ticket-attachments/')) {
    const rows = await sql.unsafe(
      `SELECT 1
         FROM ticket_attachments ta
         JOIN tickets t ON t.id = ta.ticket_id
        WHERE ta.file_path = $1
          AND (t.requester_id = $2 OR t.assigned_to = $2)
        LIMIT 1`,
      [relPath, user.id],
    );
    return rows.length > 0;
  }

  if (relPath.startsWith('id-photos/') || relPath.startsWith('id-signatures/')) {
    const rows = await sql.unsafe(
      `SELECT 1 FROM id_requests
        WHERE (photo_url = $1 OR signature_url = $1) AND requester_id = $2
        LIMIT 1`,
      [relPath, user.id],
    );
    return rows.length > 0;
  }

  return false;
}

// POST /api/files/sign -> { url }  (caller is authenticated; we authorize here)
router.post('/sign', apiLimiter, authMiddleware, async (req: AuthRequest, res) => {
  try {
    const { path: relPath } = req.body ?? {};
    if (typeof relPath !== 'string' || !relPath) {
      res.status(400).json({ error: 'path is required' });
      return;
    }

    const full = resolveSafePath(relPath);
    if (!full || !fs.existsSync(full)) {
      res.status(404).json({ error: 'File not found' });
      return;
    }

    if (!(await canAccess(relPath, req.user!))) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const token = createFileToken(relPath);
    res.json({ url: `/api/files/${token}`, expires_in: 3600 });
  } catch (error) {
    console.error('Sign file error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/files/:token  (the signed token IS the credential)
router.get('/:token', async (req, res) => {
  const payload = verifyFileToken(req.params.token);
  if (!payload) {
    res.status(403).json({ error: 'Invalid or expired link' });
    return;
  }

  const full = resolveSafePath(payload.p);
  if (!full || !fs.existsSync(full)) {
    res.status(404).json({ error: 'File not found' });
    return;
  }

  res.sendFile(full);
});

export default router;
