import { Router } from 'express';
import { sql } from '../db/index.js';
import { authMiddleware, requireAccess, type AuthRequest } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { hasCustomPage } from '../permissions.js';

const router = Router();
router.use(apiLimiter, authMiddleware);

// Get ID requests (admin sees all, requester sees own)
router.get('/', async (req: AuthRequest, res) => {
  try {
    const page = parseInt(req.query.page as string) || 0;
    // Cap is generous because the admin table fetches a full page at once.
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 500);
    const offset = page * limit;

    let requests;
    // Admins and custom roles granted the ID Requests page see everything;
    // everyone else sees only their own requests.
    if (['it_admin', 'sysadmin'].includes(req.user!.role) ||
        await hasCustomPage(req.user!.role, 'id-requests')) {
      requests = await sql.unsafe(`
        SELECT ir.*,
          json_build_object('id', p.id, 'full_name', p.full_name, 'username', p.username, 'office', p.office) as requester
        FROM id_requests ir
        LEFT JOIN users p ON ir.requester_id = p.id
        ORDER BY ir.created_at DESC
        LIMIT $1 OFFSET $2
      `, [limit, offset]);
    } else {
      requests = await sql.unsafe(`
        SELECT ir.*,
          json_build_object('id', p.id, 'full_name', p.full_name, 'username', p.username, 'office', p.office) as requester
        FROM id_requests ir
        LEFT JOIN users p ON ir.requester_id = p.id
        WHERE ir.requester_id = $1
        ORDER BY ir.created_at DESC
        LIMIT $2 OFFSET $3
      `, [req.user!.id, limit, offset]);
    }
    res.json(requests);
  } catch (error) {
    console.error('Get ID requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get my ID requests
router.get('/my', async (req: AuthRequest, res) => {
  try {
    const requests = await sql`
      SELECT * FROM id_requests
      WHERE requester_id = ${req.user!.id}
      ORDER BY created_at DESC
      LIMIT 20
    `;
    res.json(requests);
  } catch (error) {
    console.error('Get my ID requests error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Allowed ID types for a request. Mirrors the choices in the New Request form
// (a checkbox group, so any combination is allowed) and the CHECK constraint
// on id_requests.id_type.
const ID_TYPES = ['Official ID', 'Office ID'];

// Submit ID request
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { office_name, full_name, nickname, id_number, position, address, emergency_name, emergency_contact, emergency_address, id_type, photo_url, signature_url } = req.body;
    if (!office_name || !full_name || !id_number || !position || !address || !emergency_name || !emergency_contact || !emergency_address) {
      res.status(400).json({ error: 'All required fields must be provided' });
      return;
    }
    if (
      !Array.isArray(id_type) ||
      id_type.length === 0 ||
      !id_type.every((t: unknown) => ID_TYPES.includes(t as string))
    ) {
      res.status(400).json({ error: 'ID Type must include Official ID, Office ID, or both' });
      return;
    }
    // The ID photo is mandatory — the form enforces it too, but the API is the
    // guarantee (the signature stays optional, as it always has been).
    if (!photo_url) {
      res.status(400).json({ error: 'ID photo is required' });
      return;
    }

    const requests = await sql`
      INSERT INTO id_requests (requester_id, office_name, full_name, nickname, id_number, position, address, emergency_name, emergency_contact, emergency_address, id_type, photo_url, signature_url)
      VALUES (${req.user!.id}, ${office_name}, ${full_name}, ${nickname || null}, ${id_number}, ${position}, ${address}, ${emergency_name}, ${emergency_contact}, ${emergency_address}, ${id_type}, ${photo_url}, ${signature_url || null})
      RETURNING *
    `;
    res.status(201).json(requests[0]);
  } catch (error) {
    console.error('Submit ID request error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update ID request status and note for the requester (admin only)
router.put('/:id/status', requireAccess(['it_admin', 'sysadmin'], 'id-requests'), async (req, res) => {
  try {
    const { id } = req.params;
    const { status, notes } = req.body;
    if (!['pending', 'approved', 'rejected'].includes(status)) {
      res.status(400).json({ error: 'Invalid status' });
      return;
    }
    const targets = await sql`SELECT requester_id FROM id_requests WHERE id = ${id} LIMIT 1`;
    if (targets.length === 0) {
      res.status(404).json({ error: 'ID request not found' });
      return;
    }
    await sql`UPDATE id_requests SET status = ${status}, notes = ${notes || null}, updated_at = now() WHERE id = ${id}`;

    // Tell the requester: the note also appears under ADMIN NOTE on their
    // My Requests tab, this puts it in front of them. A notification failure
    // must not undo the status update.
    try {
      await sql`
        INSERT INTO notifications (user_id, type, title, body)
        VALUES (${targets[0].requester_id}, 'system', ${`ID Request — ${status}`},
                ${notes || 'The administrator updated the status of your ID request.'})
      `;
    } catch (notifyError) {
      console.error('ID request notification error:', notifyError);
    }

    res.json({ message: 'ID request status updated' });
  } catch (error) {
    console.error('Update ID request status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update payment status (admin only)
router.put('/:id/payment', requireAccess(['it_admin', 'sysadmin'], 'id-requests'), async (req, res) => {
  try {
    const { id } = req.params;
    const { is_paid } = req.body;
    await sql`UPDATE id_requests SET is_paid = ${is_paid} WHERE id = ${id}`;
    res.json({ message: 'Payment status updated' });
  } catch (error) {
    console.error('Update payment status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ID request count (admin only)
router.get('/count', requireAccess(['it_admin', 'sysadmin'], 'id-requests'), async (_req, res) => {
  try {
    const result = await sql`SELECT COUNT(*) as count FROM id_requests`;
    res.json({ count: parseInt(result[0].count) });
  } catch (error) {
    console.error('Get ID request count error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
