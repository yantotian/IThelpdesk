import { Router } from 'express';
import { sql } from '../db/index.js';
import { authMiddleware, requireAccess } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
const router = Router();
router.use(apiLimiter, authMiddleware);
// Get ticket templates
router.get('/', async (req, res) => {
    try {
        const activeOnly = req.query.active !== 'false';
        const templates = await sql.unsafe(`
      SELECT tt.*,
        json_build_object('id', c.id, 'name', c.name) as category,
        json_build_object('id', sc.id, 'name', sc.name) as subcategory
      FROM ticket_templates tt
      LEFT JOIN categories c ON tt.category_id = c.id
      LEFT JOIN categories sc ON tt.subcategory_id = sc.id
      ${activeOnly ? 'WHERE tt.is_active = true' : ''}
      ORDER BY tt.name
    `);
        res.json(templates);
    }
    catch (error) {
        console.error('Get templates error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Create/update template (admin only)
router.post('/', requireAccess(['it_admin', 'sysadmin'], 'templates'), async (req, res) => {
    try {
        const t = req.body;
        if (t.id) {
            await sql `
        UPDATE ticket_templates SET
          name = ${t.name}, description = ${t.description || null},
          category_id = ${t.category_id || null}, subcategory_id = ${t.subcategory_id || null},
          priority = ${t.priority || 'medium'}, subject = ${t.subject || ''},
          body = ${t.body || ''}, is_active = ${t.is_active !== undefined ? t.is_active : true},
          updated_at = now()
        WHERE id = ${t.id}
      `;
            res.json({ message: 'Template updated' });
        }
        else {
            await sql `
        INSERT INTO ticket_templates (name, description, category_id, subcategory_id, priority, subject, body, created_by)
        VALUES (${t.name}, ${t.description || null}, ${t.category_id || null}, ${t.subcategory_id || null}, ${t.priority || 'medium'}, ${t.subject || ''}, ${t.body || ''}, ${req.user.id})
      `;
            res.status(201).json({ message: 'Template created' });
        }
    }
    catch (error) {
        console.error('Upsert template error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Delete template (soft delete)
router.delete('/:id', requireAccess(['it_admin', 'sysadmin'], 'templates'), async (req, res) => {
    try {
        const { id } = req.params;
        await sql `UPDATE ticket_templates SET is_active = false WHERE id = ${id}`;
        res.json({ message: 'Template deleted' });
    }
    catch (error) {
        console.error('Delete template error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
