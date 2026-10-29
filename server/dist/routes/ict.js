import { Router } from 'express';
import { sql } from '../db/index.js';
import { authMiddleware, requireAccess } from '../middleware/auth.js';
import { apiLimiter } from '../middleware/rateLimit.js';
const router = Router();
router.use(apiLimiter, authMiddleware);
const DEVICE_STATUSES = ['active', 'inactive', 'under_repair', 'retired'];
const PRINTER_TYPES = ['inkjet', 'laser', 'dot_matrix', 'thermal'];
const ROUTER_TYPES = ['wired', 'wireless', 'fiber', 'mesh'];
const PLAN_TYPES = ['fiber', 'dsl', 'cable', 'wireless', 'satellite'];
const INTERNET_STATUSES = ['active', 'inactive', 'suspended'];
const MAX_IMPORT_ROWS = 1000;
function asText(v) {
    if (v === undefined || v === null)
        return null;
    const s = String(v).trim();
    return s === '' ? null : s;
}
function asNumber(v, label, errors) {
    const s = asText(v);
    if (s === null)
        return null;
    const n = Number(s);
    if (!Number.isFinite(n)) {
        errors.push(`${label} is not a number ("${s}")`);
        return null;
    }
    return n;
}
function asInteger(v, label, errors) {
    const n = asNumber(v, label, errors);
    return n === null ? null : Math.trunc(n);
}
/** Required text field: pushes a label-specific error and still returns a string
 *  so the built record can stay fully typed. */
function requiredText(d, key, label, errors) {
    const v = asText(d[key]);
    if (!v)
        errors.push(`${label} is required`);
    return v ?? '';
}
function asBoolean(v) {
    return ['true', 'yes', 'y', '1'].includes((asText(v) ?? '').toLowerCase());
}
function asDate(v, label, errors) {
    const s = asText(v);
    if (s === null)
        return null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        errors.push(`${label} must be formatted YYYY-MM-DD ("${s}")`);
        return null;
    }
    return s;
}
async function loadOptionSets() {
    const rows = await sql `SELECT option_type, value FROM ict_inventory_options`;
    const sets = { deviceType: new Set(), storageType: new Set() };
    for (const r of rows) {
        if (r.option_type === 'device_type')
            sets.deviceType.add(r.value);
        else if (r.option_type === 'storage_type')
            sets.storageType.add(r.value);
    }
    return sets;
}
/**
 * Normalises one device record coming from the Add form or a CSV import and
 * reports every problem at once, so a bad row can be rejected with a message a
 * user can act on instead of a 500 from the database.
 */
function buildDevice(d, opts) {
    const errors = [];
    const device_type = requiredText(d, 'device_type', 'Device type', errors);
    if (device_type && !opts.deviceType.has(device_type)) {
        errors.push(`Unknown device type "${device_type}" — add it under Manage Choices first`);
    }
    const brand = requiredText(d, 'brand', 'Brand', errors);
    const model = requiredText(d, 'model', 'Model', errors);
    const status = asText(d.status) ?? 'active';
    if (!DEVICE_STATUSES.includes(status))
        errors.push(`Unknown status "${status}"`);
    const storage_type = asText(d.storage_type);
    if (storage_type && !opts.storageType.has(storage_type)) {
        errors.push(`Unknown storage type "${storage_type}" — add it under Manage Choices first`);
    }
    const printer_type = asText(d.printer_type);
    if (printer_type && !PRINTER_TYPES.includes(printer_type))
        errors.push(`Unknown printer type "${printer_type}"`);
    const router_type = asText(d.router_type);
    if (router_type && !ROUTER_TYPES.includes(router_type))
        errors.push(`Unknown router type "${router_type}"`);
    const ram_gb = asInteger(d.ram_gb, 'RAM (GB)', errors);
    const storage_gb = asInteger(d.storage_gb, 'Storage (GB)', errors);
    const num_ports = asInteger(d.num_ports, 'Ports', errors);
    const purchase_date = asDate(d.purchase_date, 'Purchase date', errors);
    const warranty_until = asDate(d.warranty_until, 'Warranty until', errors);
    if (errors.length > 0)
        return { error: errors.join('; ') };
    return {
        data: {
            device_type, brand, model,
            serial_no: asText(d.serial_no), asset_tag: asText(d.asset_tag),
            location: asText(d.location), office: asText(d.office),
            assigned_to: asText(d.assigned_to), status,
            cpu: asText(d.cpu), gpu: asText(d.gpu),
            ram_gb, storage_gb, storage_type, os: asText(d.os),
            printer_type,
            is_network_printer: d.is_network_printer === undefined || d.is_network_printer === null
                ? false
                : asBoolean(d.is_network_printer),
            router_type, wifi_standard: asText(d.wifi_standard), num_ports,
            purchase_date, warranty_until, notes: asText(d.notes),
        },
    };
}
async function insertDevice(data, createdBy) {
    const rows = await sql `
    INSERT INTO ict_devices (device_type, brand, model, serial_no, asset_tag, location, office, assigned_to, status, cpu, gpu, ram_gb, storage_gb, storage_type, os, printer_type, is_network_printer, router_type, wifi_standard, num_ports, purchase_date, warranty_until, notes, created_by)
    VALUES (${data.device_type}, ${data.brand}, ${data.model}, ${data.serial_no}, ${data.asset_tag}, ${data.location}, ${data.office}, ${data.assigned_to}, ${data.status}, ${data.cpu}, ${data.gpu}, ${data.ram_gb}, ${data.storage_gb}, ${data.storage_type}, ${data.os}, ${data.printer_type}, ${data.is_network_printer}, ${data.router_type}, ${data.wifi_standard}, ${data.num_ports}, ${data.purchase_date}, ${data.warranty_until}, ${data.notes}, ${createdBy})
    RETURNING *
  `;
    return rows[0];
}
/**
 * Any authenticated role may add inventory now, but the admins who used to
 * review submissions are still told when a requester or technician records
 * something.
 */
async function notifyInventoryAdd(user, body) {
    if (user.role === 'it_admin' || user.role === 'sysadmin')
        return;
    const admins = await sql `SELECT id FROM users WHERE role IN ('it_admin','sysadmin') AND is_active = true`;
    const title = `Inventory added by ${user.full_name || user.username}`;
    for (const admin of admins) {
        await sql `
      INSERT INTO notifications (user_id, ticket_id, type, title, body)
      VALUES (${admin.id}, NULL, 'inventory_submission', ${title}, ${body})
    `;
    }
}
function badImportLength(rows, res) {
    if (!Array.isArray(rows)) {
        res.status(400).json({ error: 'Expected an array of rows' });
        return true;
    }
    if (rows.length === 0) {
        res.status(400).json({ error: 'The file has a header row but no data rows' });
        return true;
    }
    if (rows.length > MAX_IMPORT_ROWS) {
        res.status(400).json({ error: `Too many rows — the limit is ${MAX_IMPORT_ROWS} per import` });
        return true;
    }
    return false;
}
// ── ICT Devices ─────────────────────────────────────────────────────────────
router.get('/devices', async (req, res) => {
    try {
        const { type } = req.query;
        let devices;
        if (type && type !== 'all') {
            devices = await sql `SELECT * FROM ict_devices WHERE device_type = ${String(type)} ORDER BY created_at DESC`;
        }
        else {
            devices = await sql `SELECT * FROM ict_devices ORDER BY created_at DESC`;
        }
        res.json(devices);
    }
    catch (error) {
        console.error('Get ICT devices error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Every role may add — this is what replaced the Submit Inventory page.
router.post('/devices', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const opts = await loadOptionSets();
        const { data, error } = buildDevice(req.body ?? {}, opts);
        if (!data || error) {
            res.status(400).json({ error: error || 'Invalid device' });
            return;
        }
        const device = await insertDevice(data, req.user.id);
        await notifyInventoryAdd(req.user, `New ${data.device_type}: ${data.brand} ${data.model}`);
        res.status(201).json(device);
    }
    catch (error) {
        console.error('Create ICT device error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// Bulk create from a CSV produced by the Export CSV button on the same page.
router.post('/devices/import', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const rows = req.body?.rows;
        if (badImportLength(rows, res))
            return;
        const opts = await loadOptionSets();
        const errors = [];
        let created = 0;
        // Clamp the loop bound so it can never exceed MAX_IMPORT_ROWS even if the
        // length guard above is bypassed or refactored away.
        for (let i = 0; i < Math.min(rows.length, MAX_IMPORT_ROWS); i++) {
            const { data, error } = buildDevice((rows[i] ?? {}), opts);
            if (!data || error) {
                errors.push({ row: i + 1, message: error || 'Invalid row' });
                continue;
            }
            try {
                await insertDevice(data, req.user.id);
                created++;
            }
            catch (e) {
                errors.push({ row: i + 1, message: e.message || 'Could not save this row' });
            }
        }
        if (created > 0) {
            await notifyInventoryAdd(req.user, `Imported ${created} device${created === 1 ? '' : 's'} from a CSV file`);
        }
        res.json({ created, failed: errors.length, errors });
    }
    catch (error) {
        console.error('Import ICT devices error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// All profiles with ICT Inventory access may add, edit and delete records.
router.put('/devices/:id', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        const d = req.body;
        await sql `
      UPDATE ict_devices SET
        device_type = ${d.device_type}, brand = ${d.brand}, model = ${d.model},
        serial_no = ${d.serial_no || null}, asset_tag = ${d.asset_tag || null},
        location = ${d.location || null}, office = ${d.office || null},
        assigned_to = ${d.assigned_to || null},
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
    }
    catch (error) {
        console.error('Update ICT device error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/devices/:id', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        await sql `DELETE FROM ict_devices WHERE id = ${id}`;
        res.json({ message: 'Device deleted' });
    }
    catch (error) {
        console.error('Delete ICT device error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ── Inventory choices (Device Type / Storage Type) ──────────────────────────
router.get('/options', async (_req, res) => {
    try {
        const options = await sql `
      SELECT * FROM ict_inventory_options
      ORDER BY option_type, sort_order, created_at
    `;
        res.json(options);
    }
    catch (error) {
        console.error('Get inventory options error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/options', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const option_type = asText(req.body?.option_type);
        const value = asText(req.body?.value);
        if (option_type !== 'device_type' && option_type !== 'storage_type') {
            res.status(400).json({ error: 'option_type must be device_type or storage_type' });
            return;
        }
        if (!value) {
            res.status(400).json({ error: 'The choice cannot be empty' });
            return;
        }
        if (value.length > 40) {
            res.status(400).json({ error: 'The choice is too long (40 characters max)' });
            return;
        }
        if (/[\r\n\t]/.test(value)) {
            res.status(400).json({ error: 'The choice must be a single line of text' });
            return;
        }
        if (option_type === 'device_type' && value.toLowerCase() === 'internet') {
            res.status(400).json({ error: '"internet" is reserved for the Internet tab' });
            return;
        }
        const existing = await sql `
      SELECT id FROM ict_inventory_options
      WHERE option_type = ${option_type} AND lower(value) = lower(${value})
    `;
        if (existing.length > 0) {
            res.status(409).json({ error: `"${value}" is already one of the choices` });
            return;
        }
        const next = await sql `
      SELECT COALESCE(MAX(sort_order), 0) + 1 AS next
      FROM ict_inventory_options WHERE option_type = ${option_type}
    `;
        const options = await sql `
      INSERT INTO ict_inventory_options (option_type, value, label, sort_order)
      VALUES (${option_type}, ${value}, ${value}, ${next[0].next})
      RETURNING *
    `;
        res.status(201).json(options[0]);
    }
    catch (error) {
        console.error('Create inventory option error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/options/:id', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        const removed = await sql `DELETE FROM ict_inventory_options WHERE id = ${id} RETURNING *`;
        if (removed.length === 0) {
            res.status(404).json({ error: 'Choice not found' });
            return;
        }
        res.json({ message: `"${removed[0].value}" removed`, option: removed[0] });
    }
    catch (error) {
        console.error('Delete inventory option error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ── ICT Internet ────────────────────────────────────────────────────────────
router.get('/internet', async (_req, res) => {
    try {
        const connections = await sql `
      SELECT ii.*,
        json_build_object('id', d.id, 'brand', d.brand, 'model', d.model) as router
      FROM ict_internet ii
      LEFT JOIN ict_devices d ON ii.router_id = d.id
      ORDER BY ii.created_at DESC
    `;
        res.json(connections);
    }
    catch (error) {
        console.error('Get ICT internet error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
function buildInternet(d, routers) {
    const errors = [];
    const location = requiredText(d, 'location', 'Location', errors);
    const isp_name = requiredText(d, 'isp_name', 'ISP Name', errors);
    const plan_name = requiredText(d, 'plan_name', 'Plan Name', errors);
    const plan_type = asText(d.plan_type) ?? 'fiber';
    if (!PLAN_TYPES.includes(plan_type))
        errors.push(`Unknown plan type "${plan_type}"`);
    const status = asText(d.status) ?? 'active';
    if (!INTERNET_STATUSES.includes(status))
        errors.push(`Unknown status "${status}"`);
    if (asText(d.subscribed_speed_mbps) === null)
        errors.push('Subscribed speed is required');
    const subscribed_speed_mbps = asInteger(d.subscribed_speed_mbps, 'Subscribed speed', errors);
    const actual_dl_mbps = asNumber(d.actual_dl_mbps, 'DL speed', errors);
    const actual_ul_mbps = asNumber(d.actual_ul_mbps, 'UL speed', errors);
    const monthly_cost = asNumber(d.monthly_cost, 'Monthly cost', errors);
    const contract_start = asDate(d.contract_start, 'Contract start', errors);
    const contract_end = asDate(d.contract_end, 'Contract end', errors);
    if (contract_start && contract_end && contract_end < contract_start) {
        errors.push('Contract end cannot be before contract start');
    }
    if (errors.length > 0)
        return { error: errors.join('; ') };
    // The export writes "Brand Model"; fall back to the asset tag / serial so a
    // re-import of the same file restores the link rather than dropping it.
    const routerText = asText(d.router);
    const router_id = routerText ? routers.get(routerText.toLowerCase()) ?? null : null;
    return {
        data: {
            location, isp_name, plan_name, plan_type, subscribed_speed_mbps: subscribed_speed_mbps ?? 0,
            actual_dl_mbps, actual_ul_mbps, monthly_cost,
            contract_start, contract_end,
            account_no: asText(d.account_no),
            contact_person: asText(d.contact_person),
            contact_number: asText(d.contact_number),
            router_id, status, notes: asText(d.notes),
        },
    };
}
async function loadRouterKeys() {
    const devices = await sql `SELECT id, brand, model, asset_tag, serial_no FROM ict_devices`;
    const map = new Map();
    for (const d of devices) {
        const keys = [
            `${d.brand ?? ''} ${d.model ?? ''}`.trim(),
            d.asset_tag ?? '',
            d.serial_no ?? '',
        ].filter(Boolean).map(k => k.toLowerCase());
        for (const key of keys)
            if (!map.has(key))
                map.set(key, d.id);
    }
    return map;
}
async function insertInternet(data, createdBy) {
    const rows = await sql `
    INSERT INTO ict_internet (location, isp_name, plan_name, plan_type, subscribed_speed_mbps, actual_dl_mbps, actual_ul_mbps, monthly_cost, contract_start, contract_end, account_no, contact_person, contact_number, router_id, status, notes, created_by)
    VALUES (${data.location}, ${data.isp_name}, ${data.plan_name}, ${data.plan_type}, ${data.subscribed_speed_mbps}, ${data.actual_dl_mbps}, ${data.actual_ul_mbps}, ${data.monthly_cost}, ${data.contract_start}, ${data.contract_end}, ${data.account_no}, ${data.contact_person}, ${data.contact_number}, ${data.router_id}, ${data.status}, ${data.notes}, ${createdBy})
    RETURNING *
  `;
    return rows[0];
}
router.post('/internet', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const routers = await loadRouterKeys();
        const { data, error } = buildInternet(req.body ?? {}, routers);
        if (!data || error) {
            res.status(400).json({ error: error || 'Invalid connection' });
            return;
        }
        const connection = await insertInternet(data, req.user.id);
        await notifyInventoryAdd(req.user, `New internet connection: ${data.isp_name} — ${data.plan_name}`);
        res.status(201).json(connection);
    }
    catch (error) {
        console.error('Create ICT internet error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/internet/import', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const rows = req.body?.rows;
        if (badImportLength(rows, res))
            return;
        const routers = await loadRouterKeys();
        const errors = [];
        let created = 0;
        // Clamp the loop bound so it can never exceed MAX_IMPORT_ROWS even if the
        // length guard above is bypassed or refactored away.
        for (let i = 0; i < Math.min(rows.length, MAX_IMPORT_ROWS); i++) {
            const { data, error } = buildInternet((rows[i] ?? {}), routers);
            if (!data || error) {
                errors.push({ row: i + 1, message: error || 'Invalid row' });
                continue;
            }
            try {
                await insertInternet(data, req.user.id);
                created++;
            }
            catch (e) {
                errors.push({ row: i + 1, message: e.message || 'Could not save this row' });
            }
        }
        if (created > 0) {
            await notifyInventoryAdd(req.user, `Imported ${created} internet connection${created === 1 ? '' : 's'} from a CSV file`);
        }
        res.json({ created, failed: errors.length, errors });
    }
    catch (error) {
        console.error('Import ICT internet error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.put('/internet/:id', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        const d = req.body;
        await sql `
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
    }
    catch (error) {
        console.error('Update ICT internet error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/internet/:id', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        await sql `DELETE FROM ict_internet WHERE id = ${id}`;
        res.json({ message: 'Internet connection deleted' });
    }
    catch (error) {
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
    }
    catch (error) {
        console.error('Get speed test logs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/speed-tests', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const { internet_id, dl_mbps, ul_mbps, latency_ms, notes, tested_at } = req.body;
        const logs = await sql `
      INSERT INTO speed_test_logs (internet_id, dl_mbps, ul_mbps, latency_ms, notes, tested_by, tested_at)
      VALUES (${internet_id}, ${dl_mbps}, ${ul_mbps || null}, ${latency_ms || null}, ${notes || null}, ${req.user.id}, ${tested_at || new Date().toISOString()})
      RETURNING *
    `;
        res.status(201).json(logs[0]);
    }
    catch (error) {
        console.error('Create speed test log error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/speed-tests/:id', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        await sql `DELETE FROM speed_test_logs WHERE id = ${id}`;
        res.json({ message: 'Speed test log deleted' });
    }
    catch (error) {
        console.error('Delete speed test log error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.get('/speed-tests', async (_req, res) => {
    try {
        const logs = await sql `
      SELECT stl.*,
        json_build_object('id', ii.id, 'location', ii.location, 'isp_name', ii.isp_name) as internet
      FROM speed_test_logs stl
      LEFT JOIN ict_internet ii ON stl.internet_id = ii.id
      ORDER BY stl.tested_at DESC
      LIMIT 200
    `;
        res.json(logs);
    }
    catch (error) {
        console.error('Get all speed test logs error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
// ── Device-Ticket Links ─────────────────────────────────────────────────────
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
    }
    catch (error) {
        console.error('Get device ticket links error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.post('/device-links', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const { device_id, ticket_id, note } = req.body;
        const links = await sql `
      INSERT INTO device_ticket_links (device_id, ticket_id, linked_by, note)
      VALUES (${device_id}, ${ticket_id}, ${req.user.id}, ${note || null})
      RETURNING *
    `;
        res.status(201).json(links[0]);
    }
    catch (error) {
        console.error('Create device ticket link error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.delete('/device-links/:id', requireAccess(['requester', 'technician', 'it_admin', 'sysadmin'], 'ict-inventory'), async (req, res) => {
    try {
        const { id } = req.params;
        await sql `DELETE FROM device_ticket_links WHERE id = ${id}`;
        res.json({ message: 'Device ticket link deleted' });
    }
    catch (error) {
        console.error('Delete device ticket link error:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});
export default router;
