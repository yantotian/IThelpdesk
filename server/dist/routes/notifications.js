import { Router } from 'express';
import { sql } from '../db/index.js';
import { authMiddleware } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
const router = Router();
router.use(apiLimiter, authMiddleware);
// Get notifications for current user
router.get('/', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 30;
        const notifications = await sql `
      SELECT n.*, t.ticket_number, t.subject as ticket_subject
      FROM notifications n
      LEFT JOIN tickets t ON n.ticket_id = t.id
      WHERE n.user_id = ${req.user.id}
      ORDER BY n.created_at DESC
      LIMIT ${limit}
    `;
        res.json(notifications);
    }
    catch (error) {
        console.error('Get notifications error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Get unread count
router.get('/unread-count', async (req, res) => {
    try {
        const result = await sql `
      SELECT COUNT(*) as count FROM notifications
      WHERE user_id = ${req.user.id} AND is_read = false
    `;
        res.json({ count: parseInt(result[0].count) });
    }
    catch (error) {
        console.error('Get unread count error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Mark notification as read
router.put('/:id/read', async (req, res) => {
    try {
        const { id } = req.params;
        await sql `UPDATE notifications SET is_read = true WHERE id = ${id} AND user_id = ${req.user.id}`;
        res.json({ message: 'Notification marked as read' });
    }
    catch (error) {
        console.error('Mark notification read error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Mark all notifications as read
router.put('/read-all', async (req, res) => {
    try {
        await sql `UPDATE notifications SET is_read = true WHERE user_id = ${req.user.id} AND is_read = false`;
        res.json({ message: 'All notifications marked as read' });
    }
    catch (error) {
        console.error('Mark all notifications read error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
