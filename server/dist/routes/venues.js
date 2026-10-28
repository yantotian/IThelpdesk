import { Router } from 'express';
import { sql } from '../db/index.js';
import { authMiddleware, requireAccess } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
const router = Router();
router.use(apiLimiter, authMiddleware);
const ADMIN_ROLES = ['it_admin', 'sysadmin'];
// Every signed-in role may request a venue booking (single day or multi-day
// period); admins additionally review and manage bookings.
const REQUEST_ROLES = ['requester', 'technician', 'it_admin', 'sysadmin'];
// ── Venues (managed by it_admin / sysadmin) ──────────────────────────────────
router.get('/', async (req, res) => {
    try {
        const isAdmin = ADMIN_ROLES.includes(req.user.role);
        if (isAdmin) {
            const venues = await sql `
        SELECT v.*,
          (SELECT COUNT(*)::int FROM venue_bookings b
             WHERE b.venue_id = v.id AND b.status IN ('pending','approved')) AS active_bookings
        FROM venues v
        ORDER BY v.is_active DESC, v.name ASC
      `;
            res.json(venues);
        }
        else {
            const venues = await sql `SELECT * FROM venues WHERE is_active = true ORDER BY name ASC`;
            res.json(venues);
        }
    }
    catch (error) {
        console.error('Get venues error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/', requireAccess(ADMIN_ROLES, 'venues'), async (req, res) => {
    try {
        const v = req.body;
        if (!v.name || !String(v.name).trim()) {
            res.status(400).json({ error: 'Venue name is required' });
            return;
        }
        const rows = await sql `
      INSERT INTO venues (name, location, capacity, description, is_active)
      VALUES (${String(v.name).trim()}, ${v.location || null}, ${v.capacity || null},
              ${v.description || null}, ${v.is_active ?? true})
      RETURNING *
    `;
        res.status(201).json(rows[0]);
    }
    catch (error) {
        console.error('Create venue error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/:id', requireAccess(ADMIN_ROLES, 'venues'), async (req, res) => {
    try {
        const { id } = req.params;
        const v = req.body;
        if (!v.name || !String(v.name).trim()) {
            res.status(400).json({ error: 'Venue name is required' });
            return;
        }
        const rows = await sql `
      UPDATE venues SET
        name = ${String(v.name).trim()},
        location = ${v.location || null},
        capacity = ${v.capacity || null},
        description = ${v.description || null},
        is_active = ${v.is_active ?? true}
      WHERE id = ${id}
      RETURNING *
    `;
        if (rows.length === 0) {
            res.status(404).json({ error: 'Venue not found' });
            return;
        }
        res.json(rows[0]);
    }
    catch (error) {
        console.error('Update venue error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/:id', requireAccess(ADMIN_ROLES, 'venues'), async (req, res) => {
    try {
        const { id } = req.params;
        // Refuse to delete a venue that still has bookings — deactivate instead.
        const bookings = await sql `SELECT COUNT(*)::int AS count FROM venue_bookings WHERE venue_id = ${id}`;
        if (bookings[0].count > 0) {
            res.status(409).json({ error: 'This venue has bookings. Deactivate it instead of deleting.' });
            return;
        }
        const rows = await sql `DELETE FROM venues WHERE id = ${id} RETURNING id`;
        if (rows.length === 0) {
            res.status(404).json({ error: 'Venue not found' });
            return;
        }
        res.json({ message: 'Venue deleted' });
    }
    catch (error) {
        console.error('Delete venue error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ── Venue bookings ────────────────────────────────────────────────────────────
// List bookings, optionally scoped by venue and a date window.
router.get('/bookings', async (req, res) => {
    try {
        const { venue_id, from, to, status } = req.query;
        const isAdmin = ADMIN_ROLES.includes(req.user.role);
        const conditions = [];
        const params = [];
        if (venue_id) {
            params.push(String(venue_id));
            conditions.push(`b.venue_id = $${params.length}::uuid`);
        }
        if (from) {
            // Overlap test: the booking's period must reach on/after `from`.
            params.push(String(from));
            conditions.push(`b.end_date >= $${params.length}::date`);
        }
        if (to) {
            // Overlap test: the booking's period must start on/before `to`.
            params.push(String(to));
            conditions.push(`b.booking_date <= $${params.length}::date`);
        }
        if (status) {
            params.push(String(status));
            conditions.push(`b.status = $${params.length}`);
        }
        if (!isAdmin) {
            params.push(req.user.id);
            conditions.push(`(b.status = 'approved' OR b.booked_by = $${params.length}::uuid)`);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
        const bookings = await sql.unsafe(`
      SELECT b.*,
        json_build_object('id', v.id, 'name', v.name, 'location', v.location) as venue,
        json_build_object('id', u.id, 'full_name', u.full_name, 'username', u.username) as booker,
        json_build_object('id', r.id, 'full_name', r.full_name, 'username', r.username) as reviewer
      FROM venue_bookings b
      LEFT JOIN venues v ON b.venue_id = v.id
      LEFT JOIN users u ON b.booked_by = u.id
      LEFT JOIN users r ON b.reviewed_by = r.id
      ${where}
      ORDER BY b.booking_date ASC, b.is_all_day DESC, b.start_time ASC NULLS FIRST
      LIMIT 500
      `, params);
        res.json(bookings);
    }
    catch (error) {
        console.error('Get venue bookings error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Create a booking. Open to every signed-in role (requester, technician, admin).
// Serialised per venue so two concurrent requests cannot both claim the same
// slot: the transaction locks the venue row, re-checks overlap, then inserts.
router.post('/bookings', requireAccess(REQUEST_ROLES, 'venues'), async (req, res) => {
    const b = req.body;
    if (!b.venue_id ||
        !b.booking_date ||
        !b.end_date ||
        !b.title ||
        !String(b.title).trim()) {
        res.status(400).json({ error: 'Venue, start date, end date and title are required' });
        return;
    }
    if (String(b.end_date) < String(b.booking_date)) {
        res.status(400).json({ error: 'End date cannot be before start date' });
        return;
    }
    // A booking that spans more than one day occupies whole days; start/end times
    // only apply to a single-day booking.
    const is_multi_day = String(b.end_date) !== String(b.booking_date);
    const is_all_day = !!b.is_all_day || is_multi_day;
    let start_time = null;
    let end_time = null;
    if (!is_all_day) {
        if (!b.start_time || !b.end_time) {
            res.status(400).json({ error: 'Start and end time are required for a partial-day booking' });
            return;
        }
        if (String(b.end_time) <= String(b.start_time)) {
            res.status(400).json({ error: 'End time must be after start time' });
            return;
        }
        start_time = b.start_time;
        end_time = b.end_time;
    }
    try {
        const outcome = await sql.begin(async (tx) => {
            const venues = await tx `
        SELECT id, name, is_active FROM venues WHERE id = ${b.venue_id}::uuid FOR UPDATE
      `;
            if (venues.length === 0)
                return { error: 'not_found' };
            if (!venues[0].is_active)
                return { error: 'inactive' };
            const conflicts = await tx `
        SELECT id FROM venue_bookings
        WHERE venue_id = ${b.venue_id}::uuid
          AND status IN ('pending','approved')
          AND booking_date <= ${b.end_date}::date
          AND end_date >= ${b.booking_date}::date
          AND (
            is_all_day = true
            OR ${is_all_day}::boolean = true
            OR (
              start_time IS NOT NULL AND end_time IS NOT NULL
              AND start_time < ${end_time}::time
              AND end_time > ${start_time}::time
            )
          )
        LIMIT 1
      `;
            if (conflicts.length > 0)
                return { error: 'conflict' };
            const rows = await tx `
        INSERT INTO venue_bookings
          (venue_id, booked_by, title, purpose, booking_date, end_date, is_all_day, start_time, end_time)
        VALUES
          (${b.venue_id}::uuid, ${req.user.id}::uuid, ${String(b.title).trim()},
           ${b.purpose || null}, ${b.booking_date}::date, ${b.end_date}::date,
           ${is_all_day}, ${start_time}::time, ${end_time}::time)
        RETURNING *
      `;
            return { booking: rows[0], venue: venues[0] };
        });
        if ('error' in outcome) {
            switch (outcome.error) {
                case 'not_found':
                    res.status(404).json({ error: 'Venue not found' });
                    return;
                case 'inactive':
                    res.status(400).json({ error: 'This venue is not available for booking' });
                    return;
                case 'conflict':
                    res.status(409).json({ error: 'That date and time is already booked or awaiting approval' });
                    return;
            }
        }
        const { booking, venue } = outcome;
        const bookerName = req.user.full_name || req.user.username;
        const dateLabel = is_multi_day ? `${b.booking_date} to ${b.end_date}` : `${b.booking_date}`;
        const label = is_all_day ? 'all day' : `${start_time}–${end_time}`;
        await sql `
      INSERT INTO notifications (user_id, ticket_id, type, title, body)
      SELECT u.id, NULL, 'booking', 'New venue booking request',
        ${`${bookerName} requested ${venue.name} for ${dateLabel} (${label})`}
      FROM users u
      WHERE u.role IN ('it_admin','sysadmin') AND u.is_active = true AND u.id <> ${req.user.id}::uuid
    `;
        res.status(201).json(booking);
    }
    catch (error) {
        console.error('Create venue booking error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Cancel a booking (its owner or an administrator).
router.delete('/bookings/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const rows = await sql `SELECT id, booked_by, status FROM venue_bookings WHERE id = ${id} LIMIT 1`;
        if (rows.length === 0) {
            res.status(404).json({ error: 'Booking not found' });
            return;
        }
        const booking = rows[0];
        const isAdmin = ADMIN_ROLES.includes(req.user.role);
        if (!isAdmin && booking.booked_by !== req.user.id) {
            res.status(403).json({ error: 'Insufficient permissions' });
            return;
        }
        if (!['pending', 'approved'].includes(booking.status)) {
            res.status(400).json({ error: 'Only pending or approved bookings can be cancelled' });
            return;
        }
        const updated = await sql `
      UPDATE venue_bookings SET status = 'cancelled' WHERE id = ${id} RETURNING *
    `;
        res.json(updated[0]);
    }
    catch (error) {
        console.error('Cancel venue booking error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Approve or reject a pending booking.
router.put('/bookings/:id/review', requireAccess(ADMIN_ROLES, 'venue-bookings'), async (req, res) => {
    try {
        const { id } = req.params;
        const { status, admin_note } = req.body;
        if (!['approved', 'rejected'].includes(status)) {
            res.status(400).json({ error: 'Invalid status' });
            return;
        }
        const rows = await sql `
      SELECT b.*, v.name AS venue_name
      FROM venue_bookings b
      LEFT JOIN venues v ON b.venue_id = v.id
      WHERE b.id = ${id}
      LIMIT 1
    `;
        if (rows.length === 0) {
            res.status(404).json({ error: 'Booking not found' });
            return;
        }
        const booking = rows[0];
        if (booking.status !== 'pending') {
            res.status(400).json({ error: 'Only pending bookings can be reviewed' });
            return;
        }
        // Approving must not collide with an already-approved booking; two pending
        // requests for the same slot could both reach review.
        if (status === 'approved') {
            const conflicts = await sql `
        SELECT id FROM venue_bookings
        WHERE venue_id = ${booking.venue_id}::uuid
          AND status = 'approved'
          AND id <> ${id}::uuid
          AND booking_date <= ${booking.end_date}::date
          AND end_date >= ${booking.booking_date}::date
          AND (
            is_all_day = true
            OR ${booking.is_all_day}::boolean = true
            OR (
              start_time IS NOT NULL AND end_time IS NOT NULL
              AND start_time < ${booking.end_time}::time
              AND end_time > ${booking.start_time}::time
            )
          )
        LIMIT 1
      `;
            if (conflicts.length > 0) {
                res.status(409).json({ error: 'Another approved booking already occupies that slot' });
                return;
            }
        }
        const updated = await sql `
      UPDATE venue_bookings
      SET status = ${status}, admin_note = ${admin_note || null},
          reviewed_by = ${req.user.id}::uuid, reviewed_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
        if (booking.booked_by) {
            const label = booking.is_all_day
                ? 'all day'
                : `${String(booking.start_time ?? '').slice(0, 5)}–${String(booking.end_time ?? '').slice(0, 5)}`;
            const bookingStart = String(booking.booking_date).slice(0, 10);
            const bookingEnd = String(booking.end_date).slice(0, 10);
            const dateLabel = bookingStart === bookingEnd ? bookingStart : `${bookingStart} to ${bookingEnd}`;
            const title = status === 'approved' ? 'Venue booking approved' : 'Venue booking rejected';
            const base = `${booking.venue_name} for ${dateLabel} (${label})`;
            const body = status === 'approved'
                ? `Your booking for ${base} was approved.`
                : `Your booking for ${base} was rejected.${admin_note ? ` Note: ${admin_note}` : ''}`;
            await sql `
        INSERT INTO notifications (user_id, ticket_id, type, title, body)
        VALUES (${booking.booked_by}::uuid, NULL, 'booking', ${title}, ${body})
      `;
        }
        res.json(updated[0]);
    }
    catch (error) {
        console.error('Review venue booking error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
