import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { sql } from '../db/index.js';
import { authMiddleware, type AuthRequest } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';

const router = Router();

const uploadDir = process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads');

const BUCKETS = ['ticket-attachments', 'id-photos', 'id-signatures'] as const;
type Bucket = (typeof BUCKETS)[number];

for (const b of BUCKETS) {
  fs.mkdirSync(path.join(uploadDir, b), { recursive: true });
}

const ALLOWED_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/webp', 'image/gif',
  'application/pdf', 'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain', 'text/csv',
]);

const relOf = (abs: string) =>
  path.relative(uploadDir, abs).split(path.sep).join('/');

/** True when `abs` resolves to a location inside the upload root. */
const withinUploadDir = (abs: string) => {
  const root = path.resolve(uploadDir);
  const resolved = path.resolve(abs);
  return resolved === root || resolved.startsWith(root + path.sep);
};

/**
 * Unlink only files that provably live inside the upload root.
 *
 * Follows the containment pattern from the js/path-injection guidance:
 * normalize with path.resolve + fs.realpathSync FIRST, reject anything that
 * does not start with the canonical root, then pass that exact guarded value
 * to the sink — the guard and the sink operate on the same normalized value.
 */
const safeUnlink = (abs: string) => {
  try {
    const root = fs.realpathSync(path.resolve(uploadDir));
    const target = fs.realpathSync(path.resolve(abs));
    if (!target.startsWith(root + path.sep)) return;
    fs.unlinkSync(target);
  } catch {
    /* outside the upload root, or already gone — nothing to clean up */
  }
};

// Ticket ids are uuids (see schema.sql); rejecting anything else keeps them
// safe to use as a path segment.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * multer resolves `destination` while the multipart stream is still being
 * read, so req.body is not yet populated when `file` precedes `ticketId` in
 * the form. Ticket attachments are therefore written to a flat staging
 * directory and moved into <bucket>/<ticketId>/ only after the body has been
 * fully parsed — that keeps the layout independent of field order.
 */
const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const bucket = (req.params as Record<string, string>).bucket as Bucket;
    // Re-validate here (not just in route middleware) and verify containment,
    // so req.file.path can never point outside the upload root.
    const dir = BUCKETS.includes(bucket)
      ? path.resolve(uploadDir, bucket)
      : null;
    if (!dir || !withinUploadDir(dir)) {
      cb(new Error('Unknown bucket'), '');
      return;
    }
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).slice(0, 12).replace(/[^\w.]/g, '');
    const rand = Math.random().toString(36).slice(2, 12);
    cb(null, `${Date.now()}_${rand}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ALLOWED_TYPES.has(file.mimetype)) cb(null, true);
    else cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

/** POST /api/upload/:bucket  — generic upload (id photos, signatures) */
router.post(
  '/:bucket',
  apiLimiter,
  authMiddleware,
  (req, res, next) => {
    const bucket = req.params.bucket as Bucket;
    if (!BUCKETS.includes(bucket)) {
      res.status(404).json({ error: 'Unknown bucket' });
      return;
    }
    next();
  },
  upload.single('file'),
  async (req: AuthRequest, res) => {
    try {
      if (!req.file) {
        res.status(400).json({ error: 'No file uploaded' });
        return;
      }
      const rel = relOf(req.file.path);

      if (req.params.bucket === 'ticket-attachments') {
        const { ticketId } = req.body;
        if (!ticketId || typeof ticketId !== 'string' || !UUID_RE.test(ticketId)) {
          safeUnlink(req.file.path);
          res.status(400).json({ error: 'ticketId is required' });
          return;
        }
        // Caller must be a participant of the ticket they are attaching to.
        const allowed = await sql.unsafe(
          `SELECT 1 FROM tickets
            WHERE id = $1 AND (requester_id = $2 OR assigned_to = $2)
            LIMIT 1`,
          [ticketId, req.user!.id],
        );
        if (allowed.length === 0) {
          safeUnlink(req.file.path);
          res.status(403).json({ error: 'Access denied' });
          return;
        }

        // Now that the body is parsed, move the file under its ticket folder.
        const finalDir = path.join(uploadDir, 'ticket-attachments', ticketId);
        fs.mkdirSync(finalDir, { recursive: true });
        const finalPath = path.join(finalDir, path.basename(req.file.path));
        fs.renameSync(req.file.path, finalPath);
        const finalRel = relOf(finalPath);

        const [row] = await sql`
          INSERT INTO ticket_attachments (ticket_id, uploader_id, file_name, file_path, file_size, mime_type)
          VALUES (${ticketId}, ${req.user!.id}, ${req.file.originalname}, ${finalRel}, ${req.file.size}, ${req.file.mimetype})
          RETURNING *
        `;

        await sql`
          INSERT INTO ticket_activities (ticket_id, actor_id, activity_type, content, new_value)
          VALUES (${ticketId}, ${req.user!.id}, 'attachment', ${`Attachment uploaded: ${req.file.originalname}`}, ${finalRel})
        `;

        res.status(201).json(row);
        return;
      }

      res.json({ path: rel });
    } catch (error) {
      if (req.file) safeUnlink(req.file.path);
      console.error('Upload error:', error);
      res.status(500).json({ error: 'Upload failed' });
    }
  },
);

export default router;
