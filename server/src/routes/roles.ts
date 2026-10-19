import { Router } from 'express';
import { sql } from '../db/index.js';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
import { PAGE_KEYS, isBuiltinRole, invalidateRoleCache } from '../permissions.js';

const router = Router();
router.use(apiLimiter, authMiddleware);

// Validate the permissions array from a request body against the known page
// keys. Returns null when anything is wrong (trust boundary).
function sanitizePermissions(input: unknown): string[] | null {
  if (!Array.isArray(input)) return null;
  const perms = [...new Set(input.map(String))];
  if (!perms.every(p => (PAGE_KEYS as readonly string[]).includes(p))) return null;
  return perms;
}

// List custom roles. Open to every signed-in user: the frontend needs the
// list to resolve page access for the signed-in role and to offer roles in
// the user forms. Names and page keys only — no sensitive data.
router.get('/', async (_req, res) => {
  try {
    const roles = await sql`SELECT id, name, permissions, created_at, updated_at FROM roles ORDER BY name`;
    res.json(roles);
  } catch (error) {
    console.error('Get roles error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create a custom role (System Admin only)
router.post('/', requireRole('sysadmin'), async (req: AuthRequest, res) => {
  try {
    const name = String(req.body.name ?? '').trim();
    const permissions = sanitizePermissions(req.body.permissions);
    if (!name || name.length > 50) {
      res.status(400).json({ error: 'Role name is required (max 50 characters)' });
      return;
    }
    if (permissions === null) {
      res.status(400).json({ error: `permissions must be a list of: ${PAGE_KEYS.join(', ')}` });
      return;
    }
    // A custom role must never shadow a built-in role name — users.role
    // stores the name, so a duplicate would be ambiguous.
    if (isBuiltinRole(name.toLowerCase())) {
      res.status(400).json({ error: 'That role name is reserved for a built-in role' });
      return;
    }
    const existing = await sql`SELECT id FROM roles WHERE lower(name) = ${name.toLowerCase()} LIMIT 1`;
    if (existing.length > 0) {
      res.status(409).json({ error: 'A role with that name already exists' });
      return;
    }

    const roles = await sql`
      INSERT INTO roles (name, permissions) VALUES (${name}, ${permissions})
      RETURNING id, name, permissions, created_at, updated_at
    `;
    await sql`
      INSERT INTO audit_log (actor_id, table_name, record_id, action, new_data)
      VALUES (${req.user!.id}, 'roles', ${roles[0].id}, 'create', ${JSON.stringify({ name, permissions })})
    `;
    invalidateRoleCache();
    res.status(201).json(roles[0]);
  } catch (error) {
    console.error('Create role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update a custom role (System Admin only): rename and/or change pages.
// Renaming follows users.role so nobody silently loses their access.
router.put('/:id', requireRole('sysadmin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const name = String(req.body.name ?? '').trim();
    const permissions = sanitizePermissions(req.body.permissions);
    if (!name || name.length > 50) {
      res.status(400).json({ error: 'Role name is required (max 50 characters)' });
      return;
    }
    if (permissions === null) {
      res.status(400).json({ error: `permissions must be a list of: ${PAGE_KEYS.join(', ')}` });
      return;
    }
    if (isBuiltinRole(name.toLowerCase())) {
      res.status(400).json({ error: 'That role name is reserved for a built-in role' });
      return;
    }

    const before = await sql`SELECT id, name FROM roles WHERE id = ${id} LIMIT 1`;
    if (before.length === 0) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }
    const clash = await sql`SELECT id FROM roles WHERE lower(name) = ${name.toLowerCase()} AND id != ${id} LIMIT 1`;
    if (clash.length > 0) {
      res.status(409).json({ error: 'A role with that name already exists' });
      return;
    }

    const oldName = before[0].name;
    // Update the role row first: if it fails, users stay on the old name
    // untouched; if it succeeds, follow with the users so nobody is stranded.
    const roles = await sql`
      UPDATE roles SET name = ${name}, permissions = ${permissions}, updated_at = now()
      WHERE id = ${id}
      RETURNING id, name, permissions, created_at, updated_at
    `;
    if (oldName !== name) {
      await sql`UPDATE users SET role = ${name}, updated_at = now() WHERE role = ${oldName}`;
    }
    await sql`
      INSERT INTO audit_log (actor_id, table_name, record_id, action, new_data)
      VALUES (${req.user!.id}, 'roles', ${id}, 'update', ${JSON.stringify({ name: { from: oldName, to: name }, permissions })})
    `;
    invalidateRoleCache(oldName, name);
    res.json(roles[0]);
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Delete a custom role (System Admin only). Refuse while users still have it.
router.delete('/:id', requireRole('sysadmin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const roles = await sql`SELECT id, name FROM roles WHERE id = ${id} LIMIT 1`;
    if (roles.length === 0) {
      res.status(404).json({ error: 'Role not found' });
      return;
    }

    const users = await sql`SELECT count(*) AS count FROM users WHERE role = ${roles[0].name}`;
    const count = Number(users[0].count);
    if (count > 0) {
      res.status(409).json({
        error: `This role is assigned to ${count} user(s). Reassign them first, then delete the role.`,
        details: { users: count },
      });
      return;
    }

    await sql`DELETE FROM roles WHERE id = ${id}`;
    await sql`
      INSERT INTO audit_log (actor_id, table_name, record_id, action, new_data)
      VALUES (${req.user!.id}, 'roles', ${id}, 'delete', ${JSON.stringify({ name: roles[0].name })})
    `;
    invalidateRoleCache(roles[0].name);
    res.json({ message: 'Role deleted' });
  } catch (error) {
    console.error('Delete role error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
