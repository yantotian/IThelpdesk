/**
 * End-to-end smoke test against a running instance.
 *
 *   node scripts/smoke-test.mjs                 # tests http://localhost:8080
 *   node scripts/smoke-test.mjs http://host:80
 *
 * Exercises: auth, RBAC, tickets, auto-assign, SLA, notifications,
 * signed file URLs, and confirms protected data is NOT publicly readable.
 */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';

const BASE = (process.argv[2] || 'http://localhost:8080').replace(/\/$/, '');

let pass = 0;
let fail = 0;

function check(name, ok, detail = '') {
  if (ok) {
    pass++;
    console.log(`  \x1b[32mPASS\x1b[0m  ${name}`);
  } else {
    fail++;
    console.log(`  \x1b[31mFAIL\x1b[0m  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function req(path, { method = 'GET', token, body, raw } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body && !raw) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers,
    body: raw ? body : body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, data };
}

const uniq = () => randomUUID();

// Bootstrap-admin credentials. Defaults to the documented admin/admin123, but
// reads ADMIN_USERNAME/ADMIN_PASSWORD from server/.env (non-Docker) or the root
// .env (Docker) so the test also passes on installs seeded with a real password.
// Explicit environment variables win over both files.
function readEnvFile(relPath) {
  try {
    const text = readFileSync(new URL(relPath, import.meta.url), 'utf8');
    const out = {};
    for (const line of text.split(/\r?\n/)) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && !line.trimStart().startsWith('#')) out[m[1]] = m[2];
    }
    return out;
  } catch {
    return {};
  }
}
const fileEnv = { ...readEnvFile('../.env'), ...readEnvFile('../server/.env') };
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || fileEnv.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || fileEnv.ADMIN_PASSWORD || 'admin123';

console.log(`\nSmoke test against ${BASE}\n`);

// ── health ───────────────────────────────────────────────────────────────────
console.log('health');
const health = await req('/api/health');
check('GET /api/health returns ok', health.status === 200 && health.data?.status === 'ok');

// ── auth ─────────────────────────────────────────────────────────────────────
console.log('\nauth');
const admin = await req('/api/auth/login', {
  method: 'POST',
  body: { username: ADMIN_USERNAME, password: ADMIN_PASSWORD },
});
check('admin can log in', admin.status === 200 && !!admin.data?.token, `status ${admin.status}`);
check('admin has sysadmin role', admin.data?.user?.role === 'sysadmin');

const badLogin = await req('/api/auth/login', {
  method: 'POST',
  body: { username: 'admin', password: 'definitely-wrong' },
});
check('wrong password is rejected with 401', badLogin.status === 401);

const noAuth = await req('/api/categories');
check('protected route rejects missing token', noAuth.status === 401);

const adminToken = admin.data?.token;

// ── pre-flight: clear leftovers from previous runs ───────────────────────────
// Auto-assign picks the least-busy technician, so a stray account from an
// earlier run would steal the ticket and break these assertions. Remove any
// smoke-test users (and their tickets) first so runs are repeatable.
async function purgeSmokeData(token) {
  const all = await req('/api/profiles/all', { token });
  const stale = (all.data || []).filter(
    (u) => /^smoke(tech|req)_/.test(u.username || ''),
  );
  if (stale.length === 0) return;

  const ids = new Set(stale.map((u) => u.id));
  for (let page = 0; page < 20; page++) {
    const batch = await req(`/api/tickets?limit=100&page=${page}`, { token });
    const tickets = batch.data || [];
    if (tickets.length === 0) break;
    for (const t of tickets) {
      if (ids.has(t.requester_id) || ids.has(t.assigned_to)) {
        await req(`/api/tickets/${t.id}`, { method: 'DELETE', token });
      }
    }
    if (tickets.length < 100) break;
  }

  for (const u of stale) {
    await req(`/api/profiles/${u.id}`, { method: 'DELETE', token });
  }
  console.log(`  (cleared ${stale.length} leftover smoke-test user(s))`);
}

await purgeSmokeData(adminToken);

// ── create a technician + a requester ────────────────────────────────────────
console.log('\nusers');
const techName = `smoketech_${uniq()}`;
const reqName = `smokereq_${uniq()}`;
const PASSWORD = 'SmokeTest!2345';

const tech = await req('/api/profiles', {
  method: 'POST',
  token: adminToken,
  body: { username: techName, password: PASSWORD, full_name: 'Smoke Tech', role: 'technician' },
});
check('admin can create a technician', tech.status === 201, `status ${tech.status}`);

const requester = await req('/api/profiles', {
  method: 'POST',
  token: adminToken,
  body: { username: reqName, password: PASSWORD, full_name: 'Smoke Requester', role: 'requester' },
});
check('admin can create a requester', requester.status === 201, `status ${requester.status}`);

const techLogin = await req('/api/auth/login', {
  method: 'POST',
  body: { username: techName, password: PASSWORD },
});
check('new technician can log in', techLogin.status === 200 && !!techLogin.data?.token);
const techToken = techLogin.data?.token;

const reqLogin = await req('/api/auth/login', {
  method: 'POST',
  body: { username: reqName, password: PASSWORD },
});
const reqToken = reqLogin.data?.token;
check('new requester can log in', reqLogin.status === 200 && !!reqToken);

// A second requester with no tickets of their own, used below to prove that
// cross-user ticket access is refused server-side. Matches the purgeSmokeData
// prefix (smokereq_) so leftover runs stay repeatable.
const foreignName = `smokereq_${uniq()}`;
const foreignReg = await req('/api/profiles', {
  method: 'POST',
  token: adminToken,
  body: { username: foreignName, password: PASSWORD, full_name: 'Smoke Other Requester', role: 'requester' },
});
check('admin can create a second requester', foreignReg.status === 201, `status ${foreignReg.status}`);

const foreignLogin = await req('/api/auth/login', {
  method: 'POST',
  body: { username: foreignName, password: PASSWORD },
});
check('second requester can log in', foreignLogin.status === 200 && !!foreignLogin.data?.token);
const foreignToken = foreignLogin.data?.token;

// A technician must not be able to mint users, and must not be able to mint a sysadmin.
const techCreate = await req('/api/profiles', {
  method: 'POST',
  token: techToken,
  body: { username: `esc_${uniq()}`, password: PASSWORD, role: 'sysadmin' },
});
check('technician cannot create users (privilege escalation blocked)', techCreate.status === 403, `status ${techCreate.status}`);

// ── registration approval ────────────────────────────────────────────────────
// Self-registration must NOT hand out a session: the account stays pending
// until a System Admin approves it. Uses the smokereq_ prefix so a crashed
// run is still cleaned by purgeSmokeData on the next one.
console.log('\nregistration approval');
const pendName = `smokereq_${uniq()}`;
const pendReg = await req('/api/auth/register', {
  method: 'POST',
  body: { username: pendName, password: PASSWORD, full_name: 'Smoke Pending', office: 'HQ', contact: '555' },
});
check('register creates an account WITHOUT a token', pendReg.status === 201 && !pendReg.data?.token, `status ${pendReg.status}`);

const pendAll = await req('/api/profiles/all', { token: adminToken });
const pendUser = (pendAll.data || []).find(u => u.username === pendName);
check('admin can see the pending account', !!pendUser);
check('pending account is flagged unapproved', pendUser?.is_approved === false);

const adminNotifs = await req('/api/notifications', { token: adminToken });
check(
  'admins are notified of the pending registration',
  (adminNotifs.data || []).some(n => n.type === 'system' && (n.title || '').includes('pending approval') && n.body === pendName),
);

const pendLogin = await req('/api/auth/login', {
  method: 'POST',
  body: { username: pendName, password: PASSWORD },
});
check('pending user cannot log in (403)', pendLogin.status === 403, `status ${pendLogin.status}`);

const techApprove = await req(`/api/profiles/${pendUser?.id}/approve`, { method: 'PUT', token: techToken, body: {} });
check('technician cannot approve registrations', techApprove.status === 403, `status ${techApprove.status}`);

const approveRes = await req(`/api/profiles/${pendUser?.id}/approve`, { method: 'PUT', token: adminToken, body: {} });
check('admin can approve a registration', approveRes.status === 200, `status ${approveRes.status}`);
check('approved account reports is_approved=true', approveRes.data?.is_approved === true);

const pendApproved = await req('/api/auth/login', {
  method: 'POST',
  body: { username: pendName, password: PASSWORD },
});
check('approved user can log in', pendApproved.status === 200 && !!pendApproved.data?.token, `status ${pendApproved.status}`);

// ── seed data ────────────────────────────────────────────────────────────────
console.log('\nreference data');
const cats = await req('/api/categories', { token: adminToken });
check('categories are seeded', Array.isArray(cats.data) && cats.data.length > 0);
const topLevel = cats.data?.find((c) => !c.parent_id);

const priorities = await req('/api/priority-configs', { token: adminToken });
check('4 priority/SLA rows exist', priorities.data?.length === 4);

// ── tickets ──────────────────────────────────────────────────────────────────
console.log('\ntickets');
const created = await req('/api/tickets', {
  method: 'POST',
  token: reqToken,
  body: {
    subject: `Smoke test ticket ${uniq()}`,
    description: 'created by smoke-test.mjs',
    priority: 'high',
    category_id: topLevel?.id,
  },
});
check('requester can create a ticket', created.status === 201, `status ${created.status}`);
const ticket = created.data;
check('ticket number is auto-generated', /^TKT-\d{4}-\d{5}$/.test(ticket?.ticket_number || ''), ticket?.ticket_number);
check('SLA due date is set from priority', !!ticket?.sla_due_at);
check('ticket auto-assigned to the technician', ticket?.assigned_to === tech.data?.id, `assigned_to=${ticket?.assigned_to}`);

const detail = await req(`/api/tickets/${ticket.id}`, { token: reqToken });
check('requester can read own ticket', detail.status === 200);
check('ticket joins requester profile', !!detail.data?.requester?.username);

const foreign = await req(`/api/tickets/${ticket.id}`, { token: adminToken });
check('admin can read any ticket', foreign.status === 200);

const list = await req('/api/tickets?limit=50', { token: reqToken });
check('requester ticket list is scoped to them', list.data?.every((t) => t.requester_id === requester.data?.id));

// ── activities / comments / notifications ────────────────────────────────────
console.log('\nactivity & notifications');
const acts = await req(`/api/tickets/${ticket.id}/activities`, { token: reqToken });
check('timeline includes creation + auto-assign', acts.data?.length >= 2, `count ${acts.data?.length}`);
check('auto-assign recorded as a System event', acts.data?.some((a) => a.activity_type === 'assignment' && !a.actor_id));

const comment = await req(`/api/tickets/${ticket.id}/comments`, {
  method: 'POST',
  token: techToken,
  body: { content: 'Smoke test comment' },
});
check('technician can comment', comment.status === 201, `status ${comment.status}`);

const techNotifs = await req('/api/notifications', { token: techToken });
check('assignee was notified', techNotifs.data?.some((n) => n.type === 'assignment'));

const reqNotifs = await req('/api/notifications', { token: reqToken });
check('requester was notified of the comment', reqNotifs.data?.some((n) => n.type === 'comment'));

const unread = await req('/api/notifications/unread-count', { token: reqToken });
check('unread count endpoint works', typeof unread.data?.count === 'number');

// ── status change ────────────────────────────────────────────────────────────
console.log('\nstatus transitions');
const resolved = await req(`/api/tickets/${ticket.id}/status`, {
  method: 'PUT',
  token: techToken,
  body: { status: 'resolved', note: 'fixed' },
});
check('technician can resolve', resolved.status === 200, `status ${resolved.status}`);

const after = await req(`/api/tickets/${ticket.id}`, { token: reqToken });
check('resolved_at stamped', !!after.data?.resolved_at);

const statusNotifs = await req('/api/notifications', { token: reqToken });
check('requester notified of status change', statusNotifs.data?.some((n) => n.type === 'status_change'));

// ── RBAC ─────────────────────────────────────────────────────────────────────
console.log('\nrole-based access control');
const reqProfiles = await req('/api/profiles', { token: reqToken });
check('requester cannot list all users', reqProfiles.status === 403, `status ${reqProfiles.status}`);

const reqConfig = await req('/api/system-configs', { token: reqToken });
check('requester cannot read system config', reqConfig.status === 403, `status ${reqConfig.status}`);

const reqDelete = await req(`/api/tickets/${ticket.id}`, { method: 'DELETE', token: reqToken });
check('requester cannot delete tickets', reqDelete.status === 403, `status ${reqDelete.status}`);

const techRoleChange = await req(`/api/profiles/${requester.data?.id}/role`, {
  method: 'PUT',
  token: techToken,
  body: { role: 'it_admin' },
});
check('technician cannot change roles', techRoleChange.status === 403, `status ${techRoleChange.status}`);

// ── ticket write authorization (server-side, not just hidden in the UI) ──────
console.log('\nticket write authorization');
const foreignStatus = await req(`/api/tickets/${ticket.id}/status`, {
  method: 'PUT',
  token: foreignToken,
  body: { status: 'in_progress' },
});
check('another requester cannot change a ticket status', foreignStatus.status === 403, `status ${foreignStatus.status}`);

const foreignByNumber = await req(`/api/tickets/number/${ticket.ticket_number}`, { token: foreignToken });
check('another requester cannot read a ticket by number', foreignByNumber.status === 403, `status ${foreignByNumber.status}`);

const requesterAssign = await req(`/api/tickets/${ticket.id}/assign`, {
  method: 'PUT',
  token: reqToken,
  body: { techId: tech.data?.id },
});
check('requester cannot assign tickets', requesterAssign.status === 403, `status ${requesterAssign.status}`);

const techAssign = await req(`/api/tickets/${ticket.id}/assign`, {
  method: 'PUT',
  token: techToken,
  body: { techId: tech.data?.id },
});
check('technician cannot assign tickets', techAssign.status === 403, `status ${techAssign.status}`);

const badAssignee = await req(`/api/tickets/${ticket.id}/assign`, {
  method: 'PUT',
  token: adminToken,
  body: { techId: 'not-a-uuid' },
});
check('assign rejects an invalid assignee', badAssignee.status === 400, `status ${badAssignee.status}`);

const bogusStatus = await req(`/api/tickets/${randomUUID()}/status`, {
  method: 'PUT',
  token: adminToken,
  body: { status: 'definitely_not_a_status' },
});
check('invalid status value is rejected with 400', bogusStatus.status === 400, `status ${bogusStatus.status}`);

const adminAssign = await req(`/api/tickets/${ticket.id}/assign`, {
  method: 'PUT',
  token: adminToken,
  body: { techId: tech.data?.id },
});
check('admin can still assign tickets', adminAssign.status === 200, `status ${adminAssign.status}`);

const ownStatus = await req(`/api/tickets/${ticket.id}/status`, {
  method: 'PUT',
  token: reqToken,
  body: { status: 'in_progress', note: 'requester reopen' },
});
check('requester can still change own ticket status (UI flow)', ownStatus.status === 200, `status ${ownStatus.status}`);

const ictCreate = await req('/api/ict/devices', {
  method: 'POST',
  token: reqToken,
  body: { name: 'Smoke Unauthorized Device' },
});
check('requester cannot create ICT inventory entries', ictCreate.status === 403, `status ${ictCreate.status}`);

// ── data scoping (recent activity feed + global search) ─────────────────────
console.log('\ndata scoping');
const scopedFeed = await req('/api/recent-activity?limit=50', { token: reqToken });
check(
  'recent-activity feed is scoped to the requester',
  Array.isArray(scopedFeed.data) && scopedFeed.data.length > 0 &&
    scopedFeed.data.every((a) => a.ticket_id === ticket.id),
  `rows ${scopedFeed.data?.length ?? 0}`,
);

const searchUsers = await req(`/api/search?q=${techName}`, { token: reqToken });
check(
  'requester search does not expose the user directory',
  !searchUsers.data?.some((r) => r.type === 'user'),
  JSON.stringify(searchUsers.data?.map((r) => r.type)),
);

const searchAdmin = await req(`/api/search?q=${techName}`, { token: adminToken });
check('admin search still finds users', !!searchAdmin.data?.some((r) => r.type === 'user'));

const searchOwn = await req(`/api/search?q=${ticket.ticket_number}`, { token: reqToken });
check('requester search still finds own ticket', !!searchOwn.data?.some((r) => r.type === 'ticket'));

// ── profile self-service ─────────────────────────────────────────────────────
console.log('\nprofile & password');
const selfUpdate = await req(`/api/profiles/${requester.data?.id}`, {
  method: 'PUT',
  token: reqToken,
  body: { full_name: 'Renamed By Smoke Test', office: 'HQ' },
});
check('user can update own profile', selfUpdate.status === 200);

const otherUpdate = await req(`/api/profiles/${tech.data?.id}`, {
  method: 'PUT',
  token: reqToken,
  body: { full_name: 'Hacked' },
});
check('user cannot update someone else profile', otherUpdate.status === 403);

const wrongCurrent = await req('/api/auth/change-password', {
  method: 'POST',
  token: reqToken,
  body: { current_password: 'nope', new_password: 'AnotherPass!99' },
});
check('change-password rejects wrong current password', wrongCurrent.status === 401);

const adminReset = await req(`/api/profiles/${requester.data?.id}/password`, {
  method: 'PUT',
  token: adminToken,
  body: { password: 'ResetByAdmin!99' },
});
check('admin can reset another user password', adminReset.status === 200, `status ${adminReset.status}`);

const relogin = await req('/api/auth/login', {
  method: 'POST',
  body: { username: reqName, password: 'ResetByAdmin!99' },
});
check('user can log in with admin-reset password', relogin.status === 200);

const inactive = await req(`/api/profiles/${requester.data?.id}/active`, {
  method: 'PUT',
  token: adminToken,
  body: { is_active: false },
});
check('admin can deactivate a user', inactive.status === 200);

const blocked = await req('/api/auth/login', {
  method: 'POST',
  body: { username: reqName, password: 'ResetByAdmin!99' },
});
check('deactivated user cannot log in', blocked.status === 401);

// ── signed files ─────────────────────────────────────────────────────────────
console.log('\nfile storage & access control');
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

const form = new FormData();
form.append('file', new Blob([pngBytes], { type: 'image/png' }), 'pixel.png');
form.append('ticketId', ticket.id);

const uploadRes = await fetch(`${BASE}/api/upload/ticket-attachments`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${techToken}` },
  body: form,
});
const uploaded = await uploadRes.json().catch(() => null);
check('technician can attach a file to their ticket', uploadRes.status === 201, `status ${uploadRes.status} ${JSON.stringify(uploaded)}`);
check('attachment is stored under the ticket folder', String(uploaded?.file_path || '').startsWith(`ticket-attachments/${ticket.id}/`), uploaded?.file_path);

const attachments = await req(`/api/tickets/${ticket.id}/attachments`, { token: techToken });
check('attachment appears in the ticket', attachments.data?.some((a) => a.id === uploaded?.id));

const sign = await req('/api/files/sign', {
  method: 'POST',
  token: techToken,
  body: { path: uploaded?.file_path },
});
check('participant can get a signed URL', sign.status === 200 && !!sign.data?.url, `status ${sign.status}`);

if (sign.data?.url) {
  const fileRes = await fetch(`${BASE}${sign.data.url}`);
  check('signed URL serves the file', fileRes.status === 200);
  const buf = Buffer.from(await fileRes.arrayBuffer());
  check('file bytes are intact', buf.equals(pngBytes), `${buf.length} vs ${pngBytes.length} bytes`);
}

const signDenied = await req('/api/files/sign', {
  method: 'POST',
  token: adminToken,
  body: { path: 'id-photos/../../server/package.json' },
});
check('path traversal is rejected', signDenied.status === 403 || signDenied.status === 404, `status ${signDenied.status}`);

// The file must not be reachable from any unauthenticated path.
const publicGuess = await fetch(`${BASE}/uploads/${uploaded?.file_path}`);
const publicBody = publicGuess.status === 200 ? Buffer.from(await publicGuess.arrayBuffer()) : Buffer.alloc(0);
check(
  'uploads are NOT readable from the public path',
  !publicBody.equals(pngBytes),
  `status ${publicGuess.status}`,
);

const forged = `${BASE}/api/files/eyJwIjoiaWQtYXNzZXQifQ.ZmFrZXNzaWduYXR1cmU`;
const forgedRes = await fetch(forged);
check('forged file token is rejected', forgedRes.status === 403, `status ${forgedRes.status}`);

// ── cleanup ──────────────────────────────────────────────────────────────────
console.log('\ncleanup');
// A user with tickets cannot be hard-deleted (audit trail); the API must
// refuse with a clear 409 and point at deactivation.
const blockedDelete = await req(`/api/profiles/${tech.data?.id}`, { method: 'DELETE', token: adminToken });
check(
  'deleting a user with tickets is refused with guidance',
  blockedDelete.status === 409 && /deactivat/i.test(blockedDelete.data?.error || ''),
  `status ${blockedDelete.status}`,
);

// The ticket must be removed first, then the user becomes deletable.
const delTicket = await req(`/api/tickets/${ticket.id}`, { method: 'DELETE', token: adminToken });
check('admin can delete a ticket', delTicket.status === 200, `status ${delTicket.status}`);

for (const id of [requester.data?.id, foreignReg.data?.id, tech.data?.id, pendUser?.id]) {
  if (id) await req(`/api/profiles/${id}`, { method: 'DELETE', token: adminToken });
}
const verifyGone = await req(`/api/profiles/${tech.data?.id}`, { token: adminToken });
check('user is really gone after cleanup', verifyGone.status === 404, `status ${verifyGone.status}`);

// ── result ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail === 0 ? 0 : 1);
