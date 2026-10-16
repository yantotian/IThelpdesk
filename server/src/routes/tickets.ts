import { Router } from 'express';
import { sql } from '../db/index.js';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { autoAssignTicket } from '../jobs.js';

const router = Router();
router.use(apiLimiter, authMiddleware);

const TICKET_SELECT = `
  t.*,
  json_build_object('id', r.id, 'username', r.username, 'full_name', r.full_name, 'office', r.office, 'contact', r.contact, 'role', r.role) as requester,
  json_build_object('id', a.id, 'username', a.username, 'full_name', a.full_name, 'role', a.role) as assignee,
  json_build_object('id', c.id, 'name', c.name) as category,
  json_build_object('id', sc.id, 'name', sc.name) as subcategory
`;

// Get tickets with filters
router.get('/', async (req: AuthRequest, res) => {
  try {
    const { status, priority, category_id, assigned_to, search, date_from, date_to, office } = req.query;
    const page = parseInt(req.query.page as string) || 0;
    const limit = Math.min(parseInt(req.query.limit as string) || 25, 100);
    const offset = page * limit;

    let whereClause = 'WHERE 1=1';
    const params: string[] = [];
    let paramIndex = 1;

    if (status && status !== 'all') {
      whereClause += ` AND t.status = $${paramIndex++}`;
      params.push(status as string);
    }
    if (priority && priority !== 'all') {
      whereClause += ` AND t.priority = $${paramIndex++}`;
      params.push(priority as string);
    }
    if (category_id && category_id !== 'all') {
      whereClause += ` AND t.category_id = $${paramIndex++}`;
      params.push(category_id as string);
    }
    if (assigned_to && assigned_to !== 'all') {
      whereClause += ` AND t.assigned_to = $${paramIndex++}`;
      params.push(assigned_to as string);
    }
    if (office) {
      whereClause += ` AND t.office ILIKE $${paramIndex++}`;
      params.push(`%${office}%`);
    }
    if (date_from) {
      whereClause += ` AND t.created_at >= $${paramIndex++}`;
      params.push(date_from as string);
    }
    if (date_to) {
      whereClause += ` AND t.created_at <= $${paramIndex++}`;
      params.push(date_to as string);
    }
    if (search) {
      whereClause += ` AND (t.subject ILIKE $${paramIndex++} OR t.ticket_number ILIKE $${paramIndex++})`;
      params.push(`%${search}%`);
      params.push(`%${search}%`);
    }

    // Role-based filtering
    if (req.user!.role === 'requester') {
      whereClause += ` AND t.requester_id = $${paramIndex++}`;
      params.push(req.user!.id);
    } else if (req.user!.role === 'technician') {
      whereClause += ` AND (t.assigned_to = $${paramIndex++} OR t.requester_id = $${paramIndex++})`;
      params.push(req.user!.id);
      params.push(req.user!.id);
    }

    const query = `
      SELECT ${TICKET_SELECT}
      FROM tickets t
      LEFT JOIN users r ON t.requester_id = r.id
      LEFT JOIN users a ON t.assigned_to = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN categories sc ON t.subcategory_id = sc.id
      ${whereClause}
      ORDER BY t.created_at DESC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;
    params.push(limit.toString());
    params.push(offset.toString());

    const tickets = await sql.unsafe(query, params);
    res.json(tickets);
  } catch (error) {
    console.error('Get tickets error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single ticket
router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const tickets = await sql.unsafe(`
      SELECT ${TICKET_SELECT}
      FROM tickets t
      LEFT JOIN users r ON t.requester_id = r.id
      LEFT JOIN users a ON t.assigned_to = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN categories sc ON t.subcategory_id = sc.id
      WHERE t.id = $1
      LIMIT 1
    `, [id]);

    if (tickets.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    // Check access
    const ticket = tickets[0];
    if (req.user!.role === 'requester' && ticket.requester_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(ticket);
  } catch (error) {
    console.error('Get ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ticket by number
router.get('/number/:ticketNumber', async (req: AuthRequest, res) => {
  try {
    const { ticketNumber } = req.params;
    const tickets = await sql.unsafe(`
      SELECT ${TICKET_SELECT}
      FROM tickets t
      LEFT JOIN users r ON t.requester_id = r.id
      LEFT JOIN users a ON t.assigned_to = a.id
      LEFT JOIN categories c ON t.category_id = c.id
      LEFT JOIN categories sc ON t.subcategory_id = sc.id
      WHERE t.ticket_number = $1
      LIMIT 1
    `, [ticketNumber]);

    if (tickets.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    // Same access rule as GET /:id — ticket numbers must not let a requester
    // read other people's tickets.
    const ticket = tickets[0];
    if (req.user!.role === 'requester' && ticket.requester_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    res.json(ticket);
  } catch (error) {
    console.error('Get ticket by number error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create ticket
router.post('/', async (req: AuthRequest, res) => {
  try {
    const { office, contact, category_id, subcategory_id, priority, subject, description, location } = req.body;
    if (!subject) {
      res.status(400).json({ error: 'Subject is required' });
      return;
    }

    const tickets = await sql`
      INSERT INTO tickets (requester_id, office, contact, category_id, subcategory_id, priority, subject, description, location)
      VALUES (${req.user!.id}, ${office || null}, ${contact || null}, ${category_id || null}, ${subcategory_id || null}, ${priority || 'medium'}, ${subject}, ${description || null}, ${location || null})
      RETURNING *
    `;

    const created = tickets[0];

    // Record creation on the timeline (was done client-side via supabase.from).
    await sql`
      INSERT INTO ticket_activities (ticket_id, actor_id, activity_type, content)
      VALUES (${created.id}, ${req.user!.id}, 'system', 'Ticket created')
    `;

    // Auto-assign to the least-busy technician (replaces the `auto-assign` edge function).
    let assignedTo: string | null = null;
    try {
      assignedTo = await autoAssignTicket(created.id);
    } catch (e) {
      console.error('Auto-assign failed:', e);
    }

    res.status(201).json({ ...created, assigned_to: assignedTo });
  } catch (error) {
    console.error('Create ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update ticket
router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    // Check access
    const existing = await sql`SELECT requester_id, assigned_to FROM tickets WHERE id = ${id} LIMIT 1`;
    if (existing.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }
    if (req.user!.role === 'requester' && existing[0].requester_id !== req.user!.id) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const setClauses: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const allowedFields = ['office', 'contact', 'category_id', 'subcategory_id', 'priority', 'subject', 'description', 'location', 'resolution', 'remarks'];
    for (const field of allowedFields) {
      if (field in updates) {
        setClauses.push(`${field} = $${paramIndex++}`);
        params.push(updates[field] === '' ? null : updates[field]);
      }
    }

    if (setClauses.length === 0) {
      res.status(400).json({ error: 'No fields to update' });
      return;
    }

    params.push(id);
    await sql.unsafe(`UPDATE tickets SET ${setClauses.join(', ')} WHERE id = $${paramIndex++}`, params as any[]);
    res.json({ message: 'Ticket updated' });
  } catch (error) {
    console.error('Update ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update ticket status
router.put('/:id/status', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { status, note } = req.body;

    // Validate against the ticket_status enum before touching the database —
    // an unknown value would otherwise surface as a 500 from the cast.
    const ALLOWED_STATUSES = ['new', 'assigned', 'in_progress', 'resolved', 'on_hold', 'verified', 'closed'];
    if (!ALLOWED_STATUSES.includes(status)) {
      res.status(400).json({ error: `Invalid status: must be one of ${ALLOWED_STATUSES.join(', ')}` });
      return;
    }

    const existing = await sql`SELECT status, requester_id, assigned_to FROM tickets WHERE id = ${id} LIMIT 1`;
    if (existing.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    // Mirror the UI rules (TicketDetailPage status buttons, KanbanPage drag):
    // admins may move any ticket, technicians only tickets they requested or
    // are assigned, requesters only their own tickets.
    const { role, id: userId } = req.user!;
    const isOwnOrAssigned = existing[0].requester_id === userId || existing[0].assigned_to === userId;
    const allowed =
      role === 'it_admin' || role === 'sysadmin' ||
      (role === 'technician' && isOwnOrAssigned) ||
      (role === 'requester' && existing[0].requester_id === userId);
    if (!allowed) {
      res.status(403).json({ error: 'Access denied' });
      return;
    }

    const oldStatus = existing[0].status;
    const updates: Record<string, unknown> = { status };
    if (status === 'resolved') updates.resolved_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map((k, i) => `${k} = $${i + 1}`);
    const values = Object.values(updates).map(v => v === '' ? null : v);
    await sql.unsafe(`UPDATE tickets SET ${setClauses.join(', ')} WHERE id = $${Object.keys(updates).length + 1}`, [...values, id] as any[]);

    // Log activity
    await sql`
      INSERT INTO ticket_activities (ticket_id, actor_id, activity_type, content, old_value, new_value)
      VALUES (${id}, ${req.user!.id}, 'status_change', ${note || `Status changed to ${status.replace('_', ' ')}`}, ${oldStatus}, ${status})
    `;

    res.json({ message: 'Status updated' });
  } catch (error) {
    console.error('Update ticket status error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Assign ticket — admin-only, matching bulk-assign below and the UI's canAssign
// rule. The role check runs before the ticket lookup so a non-admin is always
// answered 403 without probing which ticket ids exist.
router.put('/:id/assign', requireRole('it_admin', 'sysadmin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { techId } = req.body;

    const isUuid = typeof techId === 'string' &&
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(techId);
    if (!isUuid) {
      res.status(400).json({ error: 'techId must be a valid UUID' });
      return;
    }

    const techs = await sql`
      SELECT id FROM users
      WHERE id = ${techId} AND role IN ('technician', 'it_admin', 'sysadmin') AND is_active = true
    `;
    if (techs.length === 0) {
      res.status(400).json({ error: 'techId must reference an active technician or admin' });
      return;
    }

    const existing = await sql`SELECT id FROM tickets WHERE id = ${id} LIMIT 1`;
    if (existing.length === 0) {
      res.status(404).json({ error: 'Ticket not found' });
      return;
    }

    await sql`UPDATE tickets SET assigned_to = ${techId}, status = 'assigned' WHERE id = ${id}`;
    await sql`
      INSERT INTO ticket_activities (ticket_id, actor_id, activity_type, content, new_value)
      VALUES (${id}, ${req.user!.id}, 'assignment', 'Ticket assigned', ${techId})
    `;
    res.json({ message: 'Ticket assigned' });
  } catch (error) {
    console.error('Assign ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Bulk assign tickets
router.post('/bulk-assign', requireRole('it_admin', 'sysadmin'), async (req: AuthRequest, res) => {
  try {
    const { ticketIds, techId } = req.body;
    await sql.unsafe(
      `UPDATE tickets SET assigned_to = $1, status = 'assigned' WHERE id = ANY($2) AND status = 'new'`,
      [techId, ticketIds]
    );

    for (const ticketId of ticketIds) {
      await sql`
        INSERT INTO ticket_activities (ticket_id, actor_id, activity_type, content, new_value)
        VALUES (${ticketId}, ${req.user!.id}, 'assignment', 'Bulk assigned by admin', ${techId})
      `;
    }
    res.json({ message: 'Tickets bulk assigned' });
  } catch (error) {
    console.error('Bulk assign error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete ticket
router.delete('/:id', requireRole('it_admin', 'sysadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    await sql`DELETE FROM ticket_activities WHERE ticket_id = ${id}`;
    await sql`DELETE FROM ticket_attachments WHERE ticket_id = ${id}`;
    await sql`DELETE FROM tickets WHERE id = ${id}`;
    res.json({ message: 'Ticket deleted' });
  } catch (error) {
    console.error('Delete ticket error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ticket activities
router.get('/:id/activities', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const activities = await sql.unsafe(`
      SELECT ta.*,
        json_build_object('id', u.id, 'username', u.username, 'full_name', u.full_name, 'role', u.role) as actor
      FROM ticket_activities ta
      LEFT JOIN users u ON ta.actor_id = u.id
      WHERE ta.ticket_id = $1
      ORDER BY ta.created_at ASC
      LIMIT 200
    `, [id]);
    res.json(activities);
  } catch (error) {
    console.error('Get activities error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add comment
router.post('/:id/comments', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { content } = req.body;
    if (!content) {
      res.status(400).json({ error: 'Content is required' });
      return;
    }

    await sql`
      INSERT INTO ticket_activities (ticket_id, actor_id, activity_type, content)
      VALUES (${id}, ${req.user!.id}, 'comment', ${content})
    `;
    res.status(201).json({ message: 'Comment added' });
  } catch (error) {
    console.error('Add comment error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ticket attachments
router.get('/:id/attachments', async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const attachments = await sql.unsafe(`
      SELECT ta.*,
        json_build_object('id', u.id, 'username', u.username, 'full_name', u.full_name) as uploader
      FROM ticket_attachments ta
      LEFT JOIN users u ON ta.uploader_id = u.id
      WHERE ta.ticket_id = $1
      ORDER BY ta.created_at DESC
      LIMIT 50
    `, [id]);
    res.json(attachments);
  } catch (error) {
    console.error('Get attachments error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
