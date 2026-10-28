import { Router } from 'express';
import { sql } from '../db/index.js';
import { authMiddleware, requireAccess } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';

const router = Router();
router.use(apiLimiter, authMiddleware);

// Get all categories
router.get('/', async (_req, res) => {
  try {
    const categories = await sql`
      SELECT * FROM categories ORDER BY sort_order LIMIT 200
    `;
    res.json(categories);
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create category (admin only)
router.post('/', requireAccess(['it_admin', 'sysadmin'], 'categories'), async (req, res) => {
  try {
    const { name, parent_id, sort_order } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const cats = await sql`
      INSERT INTO categories (name, parent_id, sort_order)
      VALUES (${name}, ${parent_id || null}, ${sort_order || 0})
      RETURNING *
    `;
    res.status(201).json(cats[0]);
  } catch (error) {
    console.error('Create category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update category (admin only)
router.put('/:id', requireAccess(['it_admin', 'sysadmin'], 'categories'), async (req, res) => {
  try {
    const { id } = req.params;
    const { name, parent_id, is_active, sort_order } = req.body;
    await sql`
      UPDATE categories SET
        name = ${name || null},
        parent_id = ${parent_id || null},
        is_active = ${is_active !== undefined ? is_active : true},
        sort_order = ${sort_order !== undefined ? sort_order : 0}
      WHERE id = ${id}
    `;
    res.json({ message: 'Category updated' });
  } catch (error) {
    console.error('Update category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Deactivate category (admin only)
router.delete('/:id', requireAccess(['it_admin', 'sysadmin'], 'categories'), async (req, res) => {
  try {
    const { id } = req.params;
    // Null out any tickets referencing this category
    await sql`UPDATE tickets SET category_id = NULL WHERE category_id = ${id}`;
    await sql`UPDATE categories SET is_active = false WHERE id = ${id}`;
    res.json({ message: 'Category deactivated' });
  } catch (error) {
    console.error('Delete category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Permanently delete category (admin only, inactive only)
router.delete('/:id/permanent', requireAccess(['it_admin', 'sysadmin'], 'categories'), async (req, res) => {
  try {
    const { id } = req.params;
    // Only allow permanent deletion of inactive categories
    const existing = await sql`SELECT id, is_active FROM categories WHERE id = ${id} LIMIT 1`;
    if (existing.length === 0) {
      res.status(404).json({ error: 'Category not found' });
      return;
    }
    if (existing[0].is_active) {
      res.status(400).json({ error: 'Only inactive categories can be permanently deleted' });
      return;
    }
    // Null out any tickets referencing this category (belt and suspenders)
    await sql`UPDATE tickets SET category_id = NULL WHERE category_id = ${id}`;
    await sql`DELETE FROM categories WHERE id = ${id}`;
    res.json({ message: 'Category permanently deleted' });
  } catch (error) {
    console.error('Permanent delete category error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update sort orders (admin only)
router.post('/sort', requireAccess(['it_admin', 'sysadmin'], 'categories'), async (req, res) => {
  try {
    const { items } = req.body;
    for (const item of items) {
      await sql`UPDATE categories SET sort_order = ${item.sort_order} WHERE id = ${item.id}`;
    }
    res.json({ message: 'Sort orders updated' });
  } catch (error) {
    console.error('Update sort orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
