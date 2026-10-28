import { Router } from 'express';
import { sql } from '../db/index.js';
import { authMiddleware, requireRole, requireAccess } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { hasCustomPage, isBuiltinRole } from '../permissions.js';
const router = Router();
router.use(apiLimiter, authMiddleware);
// ── Priority Config ──────────────────────────────────────────────────────────
router.get('/priority-configs', async (_req, res) => {
    try {
        const configs = await sql `SELECT * FROM priority_config ORDER BY sla_hours`;
        res.json(configs);
    }
    catch (error) {
        console.error('Get priority configs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/priority-configs/:id', requireAccess(['it_admin', 'sysadmin'], 'priorities'), async (req, res) => {
    try {
        const { id } = req.params;
        const { label, sla_hours, color } = req.body;
        await sql `UPDATE priority_config SET label = ${label}, sla_hours = ${sla_hours}, color = ${color} WHERE id = ${id}`;
        res.json({ message: 'Priority config updated' });
    }
    catch (error) {
        console.error('Update priority config error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ── System Config ────────────────────────────────────────────────────────────
router.get('/system-configs', requireAccess(['it_admin', 'sysadmin'], 'config'), async (_req, res) => {
    try {
        const configs = await sql `SELECT * FROM system_config ORDER BY key`;
        res.json(configs);
    }
    catch (error) {
        console.error('Get system configs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/system-configs/:key', requireRole('sysadmin'), async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;
        await sql `UPDATE system_config SET value = ${value}, updated_at = now() WHERE key = ${key}`;
        res.json({ message: 'System config updated' });
    }
    catch (error) {
        console.error('Update system config error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ── Dashboard Stats ──────────────────────────────────────────────────────────
router.get('/dashboard-stats', async (req, res) => {
    try {
        let tickets;
        if (req.user.role === 'requester') {
            tickets = await sql `SELECT status, priority, sla_breached, assigned_to, requester_id FROM tickets WHERE requester_id = ${req.user.id} LIMIT 5000`;
        }
        else if (req.user.role === 'technician') {
            tickets = await sql `SELECT status, priority, sla_breached, assigned_to, requester_id FROM tickets WHERE assigned_to = ${req.user.id} LIMIT 5000`;
        }
        else if (!isBuiltinRole(req.user.role) && !(await hasCustomPage(req.user.role, 'tickets'))) {
            // Custom role without the Tickets page: dashboard counts own tickets only.
            tickets = await sql `SELECT status, priority, sla_breached, assigned_to, requester_id FROM tickets WHERE requester_id = ${req.user.id} LIMIT 5000`;
        }
        else {
            tickets = await sql `SELECT status, priority, sla_breached, assigned_to, requester_id FROM tickets LIMIT 5000`;
        }
        const by_status = {};
        const by_priority = {};
        let sla_breached = 0;
        let open = 0;
        for (const t of tickets) {
            by_status[t.status] = (by_status[t.status] || 0) + 1;
            by_priority[t.priority] = (by_priority[t.priority] || 0) + 1;
            if (t.sla_breached)
                sla_breached++;
            if (!['closed', 'verified'].includes(t.status))
                open++;
        }
        res.json({ total: tickets.length, by_status, by_priority, sla_breached, open });
    }
    catch (error) {
        console.error('Get dashboard stats error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ── Technician Workload ──────────────────────────────────────────────────────
router.get('/technician-workload', async (_req, res) => {
    try {
        const techs = await sql `SELECT id, full_name, username FROM users WHERE role = 'technician' AND is_active = true`;
        const active = await sql `SELECT assigned_to FROM tickets WHERE status NOT IN ('closed', 'verified')`;
        const countMap = {};
        for (const t of active) {
            if (t.assigned_to)
                countMap[t.assigned_to] = (countMap[t.assigned_to] || 0) + 1;
        }
        const result = techs.map((t) => ({
            ...t,
            active_tickets: countMap[t.id] || 0,
        }));
        res.json(result);
    }
    catch (error) {
        console.error('Get technician workload error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ── Recent Activity ──────────────────────────────────────────────────────────
router.get('/recent-activity', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        // Scope the feed the same way GET /api/tickets is scoped: requesters only
        // see activity on their own tickets, technicians on tickets they requested
        // or are assigned, admins see everything.
        const { role, id } = req.user;
        let scope = '';
        const params = [limit];
        if (role === 'requester') {
            scope = 'WHERE t.requester_id = $2';
            params.push(id);
        }
        else if (role === 'technician') {
            scope = 'WHERE (t.assigned_to = $2 OR t.requester_id = $2)';
            params.push(id);
        }
        else if (!isBuiltinRole(role) && !(await hasCustomPage(role, 'tickets'))) {
            scope = 'WHERE t.requester_id = $2';
            params.push(id);
        }
        const activities = await sql.unsafe(`SELECT ta.*,
        json_build_object('username', u.username, 'full_name', u.full_name) as actor
      FROM ticket_activities ta
      LEFT JOIN users u ON ta.actor_id = u.id
      JOIN tickets t ON t.id = ta.ticket_id
      ${scope}
      ORDER BY ta.created_at DESC
      LIMIT $1`, params);
        res.json(activities);
    }
    catch (error) {
        console.error('Get recent activity error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ── Global Search ────────────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
    try {
        const q = req.query.q;
        if (!q || q.trim().length < 2) {
            res.json([]);
            return;
        }
        const term = q.trim();
        const like = `%${term}%`;
        // Same role scoping as GET /api/tickets: a requester or technician must
        // not discover other people's tickets through global search.
        const { role, id } = req.user;
        let ticketScope = '';
        const ticketParams = [like];
        if (role === 'requester') {
            ticketScope = 'AND requester_id = $2';
            ticketParams.push(id);
        }
        else if (role === 'technician') {
            ticketScope = 'AND (assigned_to = $2 OR requester_id = $2)';
            ticketParams.push(id);
        }
        else if (!isBuiltinRole(role) && !(await hasCustomPage(role, 'tickets'))) {
            ticketScope = 'AND requester_id = $2';
            ticketParams.push(id);
        }
        // User results link to /admin/users, which only admins may open — the user
        // directory stays out of everyone else's results.
        const canSeeUsers = role === 'it_admin' || role === 'sysadmin' || await hasCustomPage(role, 'users');
        const [tickets, categories] = await Promise.all([
            sql.unsafe(`
        SELECT id, ticket_number, subject, status, priority FROM tickets
        WHERE (ticket_number ILIKE $1 OR subject ILIKE $1) ${ticketScope}
        LIMIT 8
      `, ticketParams),
            sql.unsafe(`
        SELECT id, name, parent_id FROM categories
        WHERE name ILIKE $1 AND is_active = true
        LIMIT 5
      `, [like]),
        ]);
        const users = canSeeUsers
            ? await sql.unsafe(`
          SELECT id, username, full_name, role FROM users
          WHERE username ILIKE $1 OR full_name ILIKE $1
          LIMIT 5
        `, [like])
            : [];
        const results = [];
        for (const t of tickets) {
            results.push({ type: 'ticket', id: t.id, label: t.ticket_number, sub: t.subject, path: `/tickets/${t.id}` });
        }
        for (const u of users) {
            results.push({ type: 'user', id: u.id, label: u.full_name || u.username, sub: `@${u.username} · ${u.role}`, path: `/admin/users` });
        }
        for (const c of categories) {
            results.push({ type: 'category', id: c.id, label: c.name, sub: c.parent_id ? 'Subcategory' : 'Category', path: `/admin/categories` });
        }
        res.json(results);
    }
    catch (error) {
        console.error('Global search error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ── Audit Log ────────────────────────────────────────────────────────────────
router.get('/audit-log', requireAccess(['sysadmin'], 'audit'), async (_req, res) => {
    try {
        const logs = await sql `
      SELECT al.*,
        json_build_object('id', u.id, 'username', u.username, 'full_name', u.full_name) as actor
      FROM audit_log al
      LEFT JOIN users u ON al.actor_id = u.id
      ORDER BY al.created_at DESC
      LIMIT 200
    `;
        res.json(logs);
    }
    catch (error) {
        console.error('Get audit log error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
