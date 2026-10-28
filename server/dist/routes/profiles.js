import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { sql } from '../db/index.js';
import { authMiddleware, requireRole, requireAccess } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { hasCustomPage, isBuiltinRole } from '../permissions.js';
const router = Router();
router.use(apiLimiter, authMiddleware);
// A role string is valid when it is one of the four built-in roles or an
// existing custom role (routes/roles.ts). Anything else would leave the user
// with a role that resolves to no access at all.
async function roleExists(role) {
    if (typeof role !== 'string' || !role)
        return false;
    if (isBuiltinRole(role))
        return true;
    const rows = await sql `SELECT 1 FROM roles WHERE name = ${role} LIMIT 1`;
    return rows.length > 0;
}
// Get all profiles (admin only)
router.get('/', requireAccess(['it_admin', 'sysadmin'], 'users'), async (req, res) => {
    try {
        const { role } = req.query;
        let users;
        if (role) {
            users = await sql `
        SELECT id, username, email, full_name, role, office, contact, is_active, is_approved, created_at, updated_at
        FROM users WHERE is_active = true AND is_approved = true AND role = ${String(role)} ORDER BY full_name
      `;
        }
        else {
            users = await sql `
        SELECT id, username, email, full_name, role, office, contact, is_active, is_approved, created_at, updated_at
        FROM users WHERE is_active = true AND is_approved = true ORDER BY full_name
      `;
        }
        res.json(users);
    }
    catch (error) {
        console.error('Get profiles error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get all profiles including inactive (admin only)
router.get('/all', requireAccess(['it_admin', 'sysadmin'], 'users'), async (req, res) => {
    try {
        const users = await sql `
      SELECT id, username, email, full_name, role, office, contact, is_active, is_approved, created_at, updated_at
      FROM users ORDER BY created_at DESC LIMIT 500
    `;
        res.json(users);
    }
    catch (error) {
        console.error('Get all profiles error:', error);
        res.status(500).json({ error: 'Internal server error' });
        // (generic /:id route removed here and will be added later after specific routes)
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Update profile
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { full_name, office, contact, email } = req.body;
        // Users can update their own profile, admins (or a custom role granted
        // the Users page) can update anyone
        if (req.user.id !== id && !['it_admin', 'sysadmin'].includes(req.user.role) &&
            !(await hasCustomPage(req.user.role, 'users'))) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }
        // Build the SET clause from only the fields actually sent. Writing
        // `email = NULL` for an omitted field violates the NOT NULL constraint,
        // and blanking fields the client never mentioned loses data.
        const updates = {};
        if (full_name !== undefined)
            updates.full_name = full_name || null;
        if (office !== undefined)
            updates.office = office || null;
        if (contact !== undefined)
            updates.contact = contact || null;
        if (email)
            updates.email = email; // users.email is NOT NULL — never blank it
        if (Object.keys(updates).length === 0) {
            res.json({ message: 'Nothing to update' });
            return;
        }
        const values = Object.values(updates);
        await sql.unsafe(`UPDATE users SET ${Object.keys(updates).map((k, i) => `${k} = $${i + 1}`).join(', ')} WHERE id = $${values.length + 1}`, [...values, id]);
        const updated = await sql `SELECT id, username, email, full_name, role, office, contact, is_active, is_approved, created_at, updated_at FROM users WHERE id = ${id} LIMIT 1`;
        res.json(updated[0] ?? { message: 'Profile updated' });
    }
    catch (error) {
        console.error('Update profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Update password
router.post('/:id/password', requireAccess(['it_admin', 'sysadmin'], 'users'), async (req, res) => {
    try {
        const { id } = req.params;
        const { role } = req.body;
        if (!(await roleExists(role))) {
            res.status(400).json({ error: 'Invalid role' });
            return;
        }
        // Prevent demoting the last sysadmin
        if (id === req.user.id) {
            const sysadmins = await sql `
        SELECT COUNT(*) as count FROM users WHERE role = 'sysadmin' AND is_active = true
      `;
            if (sysadmins[0].count <= 1) {
                res.status(400).json({ error: 'Cannot demote the last active System Admin' });
                return;
            }
        }
        await sql `UPDATE users SET role = ${role} WHERE id = ${id}`;
        res.json({ message: 'Role updated' });
    }
    catch (error) {
        console.error('Update role error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get profile by ID (generic route – must come after all specific routes)
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const users = await sql `
      SELECT id, username, email, full_name, role, office, contact, is_active, is_approved, created_at, updated_at
      FROM users WHERE id = ${id} LIMIT 1
    `;
        if (users.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        res.json(users[0]);
    }
    catch (error) {
        console.error('Get profile error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Approve a pending self-registration (System Admin only)
router.put('/:id/approve', requireRole('sysadmin'), async (req, res) => {
    try {
        const { id } = req.params;
        const users = await sql `SELECT id, is_approved FROM users WHERE id = ${id} LIMIT 1`;
        if (users.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        await sql `UPDATE users SET is_approved = true, updated_at = now() WHERE id = ${id}`;
        await sql `
      INSERT INTO audit_log (actor_id, table_name, record_id, action)
      VALUES (${req.user.id}, 'users', ${id}, 'approve')
    `;
        const updated = await sql `SELECT id, username, email, full_name, role, office, contact, is_active, is_approved, created_at, updated_at FROM users WHERE id = ${id} LIMIT 1`;
        res.json(updated[0]);
    }
    catch (error) {
        console.error('Approve user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Toggle active status (admin only)
router.put('/:id/active', requireAccess(['it_admin', 'sysadmin'], 'users'), async (req, res) => {
    try {
        const { id } = req.params;
        const { is_active } = req.body;
        await sql `UPDATE users SET is_active = ${is_active} WHERE id = ${id}`;
        res.json({ message: 'Status updated' });
    }
    catch (error) {
        console.error('Toggle active error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Admin resets another user's password (admin only).
// Replaces the `update` action of the admin-user-manage edge function, which
// previously could not be ported 1:1 because the UI silently dropped the field.
router.put('/:id/password', requireAccess(['it_admin', 'sysadmin'], 'users'), async (req, res) => {
    try {
        const { id } = req.params;
        const { password } = req.body;
        if (!password || String(password).length < 8) {
            res.status(400).json({ error: 'Password must be at least 8 characters' });
            return;
        }
        const target = await sql `SELECT id FROM users WHERE id = ${id} LIMIT 1`;
        if (target.length === 0) {
            res.status(404).json({ error: 'User not found' });
            return;
        }
        const hash = await bcrypt.hash(String(password), 10);
        await sql `UPDATE users SET password_hash = ${hash} WHERE id = ${id}`;
        await sql `
      INSERT INTO audit_log (actor_id, table_name, record_id, action, new_data)
      VALUES (${req.user.id}, 'users', ${id}, 'password_reset', ${JSON.stringify({ by: req.user.username })})
    `;
        res.json({ message: 'Password updated' });
    }
    catch (error) {
        console.error('Admin password reset error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Create user (admin only)
router.post('/', requireAccess(['it_admin', 'sysadmin'], 'users'), async (req, res) => {
    try {
        const { username, password, full_name, role, office, contact } = req.body;
        if (!username || !password) {
            res.status(400).json({ error: 'Username and password are required' });
            return;
        }
        // Mirrors migration 00012: role assignment is System Admin only, so an
        // IT Admin must not be able to mint a sysadmin.
        const requestedRole = role || 'requester';
        if (requestedRole === 'sysadmin' && req.user.role !== 'sysadmin') {
            res.status(403).json({ error: 'Only a System Admin can create another System Admin' });
            return;
        }
        if (!(await roleExists(requestedRole))) {
            res.status(400).json({ error: 'Invalid role' });
            return;
        }
        const existing = await sql `SELECT id FROM users WHERE username = ${username.toLowerCase()} LIMIT 1`;
        if (existing.length > 0) {
            res.status(409).json({ error: 'Username already exists' });
            return;
        }
        const passwordHash = await bcrypt.hash(password, 10);
        const email = `${username.toLowerCase()}@ciodesk.com`;
        const users = await sql `
      INSERT INTO users (username, email, password_hash, full_name, role, office, contact)
      VALUES (${username.toLowerCase()}, ${email}, ${passwordHash}, ${full_name || username.toLowerCase()}, ${requestedRole}, ${office || null}, ${contact || null})
      RETURNING id, username, email, full_name, role, office, contact, is_active, is_approved
    `;
        res.status(201).json(users[0]);
    }
    catch (error) {
        console.error('Create user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete user (admin only)
router.delete('/:id', requireAccess(['it_admin', 'sysadmin'], 'users'), async (req, res) => {
    try {
        const { id } = req.params;
        // Prevent deleting self
        if (id === req.user.id) {
            res.status(400).json({ error: 'Cannot delete your own account' });
            return;
        }
        // Users are referenced by tickets, activities, attachments, ID requests, etc.
        // Deleting one of those rows would destroy the audit trail, so refuse and
        // point the admin at deactivation instead of surfacing a raw FK error.
        const refs = await sql.unsafe(`SELECT
         (SELECT count(*) FROM tickets      WHERE requester_id = $1 OR assigned_to = $1) AS tickets,
         (SELECT count(*) FROM id_requests  WHERE requester_id = $1)                      AS id_requests,
         (SELECT count(*) FROM ict_devices WHERE created_by  = $1)                      AS devices`, [id]);
        const r = refs[0];
        if (Number(r.tickets) > 0 || Number(r.id_requests) > 0 || Number(r.devices) > 0) {
            res.status(409).json({
                error: 'This user has related records and cannot be deleted. ' +
                    'Deactivate the account instead to preserve the audit trail.',
                details: {
                    tickets: Number(r.tickets),
                    id_requests: Number(r.id_requests),
                    ict_devices: Number(r.devices),
                },
            });
            return;
        }
        // postgres.js uses the extended query protocol when parameters are bound,
        // which does not accept multiple statements — so delete one table at a time.
        await sql `DELETE FROM ticket_activities  WHERE actor_id = ${id}`;
        await sql `DELETE FROM ticket_attachments WHERE uploader_id = ${id}`;
        await sql `DELETE FROM notifications       WHERE user_id = ${id}`;
        await sql `DELETE FROM ticket_templates    WHERE created_by = ${id}`;
        await sql `DELETE FROM device_ticket_links WHERE linked_by = ${id}`;
        await sql `DELETE FROM users               WHERE id = ${id}`;
        await sql `
      INSERT INTO audit_log (actor_id, table_name, record_id, action)
      VALUES (${req.user.id}, 'users', ${id}, 'delete')
    `;
        res.json({ message: 'User deleted' });
    }
    catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
