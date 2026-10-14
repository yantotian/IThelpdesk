import { Router } from 'express';
import { sql } from '../db/index.js';
import { authMiddleware, requireRole, type AuthRequest } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';

const router = Router();
router.use(apiLimiter, authMiddleware);

// ── ICT Devices ──────────────────────────────────────────────────────────────

router.get('/devices', async (req, res) => {
  try {
    const { type } = req.query;
    let devices;
    if (type && type !== 'all') {
      devices = await sql`SELECT * FROM ict_devices WHERE device_type = ${String(type)} ORDER BY created_at DESC`;
    } else {
      devices = await sql`SELECT * FROM ict_devices ORDER BY created_at DESC`;
    }
    res.json(devices);
  } catch (error) {
    console.error('Get ICT devices error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/devices', requireRole('it_admin', 'sysadmin'), async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const devices = await sql`
      INSERT INTO ict_devices (device_type, brand, model, serial_no, asset_tag, location, assigned_to, status, cpu, gpu, ram_gb, storage_gb, storage_type, os, printer_type, is_network_printer, router_type, wifi_standard, num_ports, purchase_date, warranty_until, notes, created_by)
      VALUES (${d.device_type}, ${d.brand}, ${d.model}, ${d.serial_no || null}, ${d.asset_tag || null}, ${d.location || null}, ${d.assigned_to || null}, ${d.status || 'active'}, ${d.cpu || null}, ${d.gpu || null}, ${d.ram_gb || null}, ${d.storage_gb || null}, ${d.storage_type || null}, ${d.os || null}, ${d.printer_type || null}, ${d.is_network_printer || false}, ${d.router_type || null}, ${d.wifi_standard || null}, ${d.num_ports || null}, ${d.purchase_date || null}, ${d.warranty_until || null}, ${d.notes || null}, ${req.user!.id})
      RETURNING *
    `;
    res.status(201).json(devices[0]);
  } catch (error) {
    console.error('Create ICT device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/devices/:id', requireRole('it_admin', 'sysadmin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    await sql`
      UPDATE ict_devices SET
        device_type = ${d.device_type}, brand = ${d.brand}, model = ${d.model},
        serial_no = ${d.serial_no || null}, asset_tag = ${d.asset_tag || null},
        location = ${d.location || null}, assigned_to = ${d.assigned_to || null},
        status = ${d.status}, cpu = ${d.cpu || null}, gpu = ${d.gpu || null},
        ram_gb = ${d.ram_gb || null}, storage_gb = ${d.storage_gb || null},
        storage_type = ${d.storage_type || null}, os = ${d.os || null},
        printer_type = ${d.printer_type || null}, is_network_printer = ${d.is_network_printer || false},
        router_type = ${d.router_type || null}, wifi_standard = ${d.wifi_standard || null},
        num_ports = ${d.num_ports || null}, purchase_date = ${d.purchase_date || null},
        warranty_until = ${d.warranty_until || null}, notes = ${d.notes || null}
      WHERE id = ${id}
    `;
    res.json({ message: 'Device updated' });
  } catch (error) {
    console.error('Update ICT device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/devices/:id', requireRole('it_admin', 'sysadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    await sql`DELETE FROM ict_devices WHERE id = ${id}`;
    res.json({ message: 'Device deleted' });
  } catch (error) {
    console.error('Delete ICT device error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── ICT Internet ─────────────────────────────────────────────────────────────

router.get('/internet', async (_req, res) => {
  try {
    const connections = await sql`
      SELECT ii.*,
        json_build_object('id', d.id, 'brand', d.brand, 'model', d.model) as router
      FROM ict_internet ii
      LEFT JOIN ict_devices d ON ii.router_id = d.id
      ORDER BY ii.created_at DESC
    `;
    res.json(connections);
  } catch (error) {
    console.error('Get ICT internet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/internet', requireRole('it_admin', 'sysadmin'), async (req: AuthRequest, res) => {
  try {
    const d = req.body;
    const connections = await sql`
      INSERT INTO ict_internet (location, isp_name, plan_name, plan_type, subscribed_speed_mbps, actual_dl_mbps, actual_ul_mbps, monthly_cost, contract_start, contract_end, account_no, contact_person, contact_number, router_id, status, notes, created_by)
      VALUES (${d.location}, ${d.isp_name}, ${d.plan_name}, ${d.plan_type}, ${d.subscribed_speed_mbps}, ${d.actual_dl_mbps || null}, ${d.actual_ul_mbps || null}, ${d.monthly_cost || null}, ${d.contract_start || null}, ${d.contract_end || null}, ${d.account_no || null}, ${d.contact_person || null}, ${d.contact_number || null}, ${d.router_id || null}, ${d.status || 'active'}, ${d.notes || null}, ${req.user!.id})
      RETURNING *
    `;
    res.status(201).json(connections[0]);
  } catch (error) {
    console.error('Create ICT internet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.put('/internet/:id', requireRole('it_admin', 'sysadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    const d = req.body;
    await sql`
      UPDATE ict_internet SET
        location = ${d.location}, isp_name = ${d.isp_name}, plan_name = ${d.plan_name},
        plan_type = ${d.plan_type}, subscribed_speed_mbps = ${d.subscribed_speed_mbps},
        actual_dl_mbps = ${d.actual_dl_mbps || null}, actual_ul_mbps = ${d.actual_ul_mbps || null},
        monthly_cost = ${d.monthly_cost || null}, contract_start = ${d.contract_start || null},
        contract_end = ${d.contract_end || null}, account_no = ${d.account_no || null},
        contact_person = ${d.contact_person || null}, contact_number = ${d.contact_number || null},
        router_id = ${d.router_id || null}, status = ${d.status}, notes = ${d.notes || null}
      WHERE id = ${id}
    `;
    res.json({ message: 'Internet connection updated' });
  } catch (error) {
    console.error('Update ICT internet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/internet/:id', requireRole('it_admin', 'sysadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    await sql`DELETE FROM ict_internet WHERE id = ${id}`;
    res.json({ message: 'Internet connection deleted' });
  } catch (error) {
    console.error('Delete ICT internet error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/speed-tests/:internetId', async (req, res) => {
  try {
    const { internetId } = req.params;
    const logs = await sql.unsafe(`
      SELECT stl.*,
        json_build_object('id', u.id, 'full_name', u.full_name, 'username', u.username) as tester
      FROM speed_test_logs stl
      LEFT JOIN users u ON stl.tested_by = u.id
      WHERE stl.internet_id = $1
      ORDER BY stl.tested_at ASC
    `, [internetId]);
    res.json(logs);
  } catch (error) {
    console.error('Get speed test logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/speed-tests', requireRole('it_admin', 'sysadmin'), async (req: AuthRequest, res) => {
  try {
    const { internet_id, dl_mbps, ul_mbps, latency_ms, notes, tested_at } = req.body;
    const logs = await sql`
      INSERT INTO speed_test_logs (internet_id, dl_mbps, ul_mbps, latency_ms, notes, tested_by, tested_at)
      VALUES (${internet_id}, ${dl_mbps}, ${ul_mbps || null}, ${latency_ms || null}, ${notes || null}, ${req.user!.id}, ${tested_at || new Date().toISOString()})
      RETURNING *
    `;
    res.status(201).json(logs[0]);
  } catch (error) {
    console.error('Create speed test log error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/speed-tests/:id', requireRole('it_admin', 'sysadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    await sql`DELETE FROM speed_test_logs WHERE id = ${id}`;
    res.json({ message: 'Speed test log deleted' });
  } catch (error) {
    console.error('Delete speed test log error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.get('/speed-tests', async (_req, res) => {
  try {
    const logs = await sql`
      SELECT stl.*,
        json_build_object('id', ii.id, 'location', ii.location, 'isp_name', ii.isp_name) as internet
      FROM speed_test_logs stl
      LEFT JOIN ict_internet ii ON stl.internet_id = ii.id
      ORDER BY stl.tested_at DESC
      LIMIT 200
    `;
    res.json(logs);
  } catch (error) {
    console.error('Get all speed test logs error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Device-Ticket Links ───────────────────────────────────────────────────────

router.get('/device-links/:deviceId', async (req, res) => {
  try {
    const { deviceId } = req.params;
    const links = await sql.unsafe(`
      SELECT dtl.*,
        json_build_object('id', t.id, 'ticket_number', t.ticket_number, 'subject', t.subject, 'status', t.status, 'priority', t.priority) as ticket,
        json_build_object('id', u.id, 'full_name', u.full_name, 'username', u.username) as linker
      FROM device_ticket_links dtl
      LEFT JOIN tickets t ON dtl.ticket_id = t.id
      LEFT JOIN users u ON dtl.linked_by = u.id
      WHERE dtl.device_id = $1
      ORDER BY dtl.created_at DESC
    `, [deviceId]);
    res.json(links);
  } catch (error) {
    console.error('Get device ticket links error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/device-links', requireRole('it_admin', 'sysadmin'), async (req: AuthRequest, res) => {
  try {
    const { device_id, ticket_id, note } = req.body;
    const links = await sql`
      INSERT INTO device_ticket_links (device_id, ticket_id, linked_by, note)
      VALUES (${device_id}, ${ticket_id}, ${req.user!.id}, ${note || null})
      RETURNING *
    `;
    res.status(201).json(links[0]);
  } catch (error) {
    console.error('Create device ticket link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.delete('/device-links/:id', requireRole('it_admin', 'sysadmin'), async (req, res) => {
  try {
    const { id } = req.params;
    await sql`DELETE FROM device_ticket_links WHERE id = ${id}`;
    res.json({ message: 'Device ticket link deleted' });
  } catch (error) {
    console.error('Delete device ticket link error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── ICT Inventory Submissions ────────────────────────────────────────────────

router.get('/submissions', async (req: AuthRequest, res) => {
  try {
    let submissions;
    if (['it_admin', 'sysadmin'].includes(req.user!.role)) {
      submissions = await sql`
        SELECT s.*,
          json_build_object('id', p.id, 'full_name', p.full_name, 'username', p.username, 'role', p.role) as submitter,
          json_build_object('id', r.id, 'full_name', r.full_name, 'username', r.username) as reviewer
        FROM ict_inventory_submissions s
        LEFT JOIN users p ON s.submitted_by = p.id
        LEFT JOIN users r ON s.reviewed_by = r.id
        ORDER BY s.created_at DESC
      `;
    } else {
      submissions = await sql`
        SELECT s.*,
          json_build_object('id', p.id, 'full_name', p.full_name, 'username', p.username, 'role', p.role) as submitter,
          json_build_object('id', r.id, 'full_name', r.full_name, 'username', r.username) as reviewer
        FROM ict_inventory_submissions s
        LEFT JOIN users p ON s.submitted_by = p.id
        LEFT JOIN users r ON s.reviewed_by = r.id
        WHERE s.submitted_by = ${req.user!.id}
        ORDER BY s.created_at DESC
      `;
    }
    res.json(submissions);
  } catch (error) {
    console.error('Get submissions error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

router.post('/submissions', async (req: AuthRequest, res) => {
  try {
    const s = req.body;
    const submissions = await sql`
      INSERT INTO ict_inventory_submissions (submission_type, submitted_by, device_type, brand, model, serial_no, asset_tag, location, assigned_to, cpu, gpu, ram_gb, storage_gb, storage_type, os, printer_type, is_network_printer, router_type, wifi_standard, num_ports, purchase_date, warranty_until, isp_name, plan_name, plan_type, subscribed_speed_mbps, monthly_cost, contract_start, contract_end, account_no, contact_person, contact_number, notes)
      VALUES (${s.submission_type}, ${req.user!.id}, ${s.device_type || null}, ${s.brand || null}, ${s.model || null}, ${s.serial_no || null}, ${s.asset_tag || null}, ${s.location || null}, ${s.assigned_to || null}, ${s.cpu || null}, ${s.gpu || null}, ${s.ram_gb || null}, ${s.storage_gb || null}, ${s.storage_type || null}, ${s.os || null}, ${s.printer_type || null}, ${s.is_network_printer || false}, ${s.router_type || null}, ${s.wifi_standard || null}, ${s.num_ports || null}, ${s.purchase_date || null}, ${s.warranty_until || null}, ${s.isp_name || null}, ${s.plan_name || null}, ${s.plan_type || null}, ${s.subscribed_speed_mbps || null}, ${s.monthly_cost || null}, ${s.contract_start || null}, ${s.contract_end || null}, ${s.account_no || null}, ${s.contact_person || null}, ${s.contact_number || null}, ${s.notes || null})
      RETURNING *
    `;

    // Get submitter info for the notification body
    const submitter = await sql`SELECT full_name, username FROM users WHERE id = ${req.user!.id}`;
    const submitterName = submitter[0]?.full_name || submitter[0]?.username || 'Unknown';

    // Get all IT admins and system admins to notify
    const admins = await sql`
      SELECT id FROM users
      WHERE role IN ('it_admin', 'sysadmin') AND is_active = true
    `;

    // Create notification for each admin (monitoring copy)
    const title = `Inventory submission from ${submitterName}`;
    const body = s.submission_type === 'device'
      ? `New device submission: ${s.brand ?? ''} ${s.model ?? ''}`
      : `New internet submission: ${s.isp_name ?? ''} — ${s.plan_name ?? ''}`;

    for (const admin of admins) {
      await sql`
        INSERT INTO notifications (user_id, ticket_id, type, title, body)
        VALUES (${admin.id}, NULL, 'inventory_submission', ${title}, ${body})
      `;
    }

    res.status(201).json(submissions[0]);
  } catch (error) {
    console.error('Create submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ── Review endpoint: monitoring-only, no approve/reject ───────────────────────
router.put('/submissions/:id/review', requireRole('it_admin', 'sysadmin'), async (req: AuthRequest, res) => {
  try {
    const { id } = req.params;
    const { admin_note } = req.body;
    // Monitoring-only: only update admin note; status/approval flow removed
    const submissions = await sql`
      UPDATE ict_inventory_submissions
      SET admin_note = ${admin_note || null}, reviewed_by = ${req.user!.id}, reviewed_at = now()
      WHERE id = ${id}
      RETURNING *
    `;
    res.json(submissions[0]);
  } catch (error) {
    console.error('Review submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;