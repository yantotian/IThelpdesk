/**
 * End-to-end smoke test against a running instance.
 *
 *   node scripts/smoke-test.mjs                 # tests http://localhost:8080
 *   node scripts/smoke-test.mjs http://host:80
 *
 * Exercises: auth, RBAC, tickets, auto-assign, SLA, notifications,
 * signed file URLs, and confirms protected data is NOT publicly readable.
 */
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

const uniq = () => Math.random().toString(36).slice(2, 10);

console.log(`\nSmoke test against ${BASE}\n`);

// ── health ───────────────────────────────────────────────────────────────────
console.log('health');
const health = await req('/api/health');
check('GET /api/health returns ok', health.status === 200 && health.data?.status === 'ok');

// ── auth ─────────────────────────────────────────────────────────────────────
console.log('\nauth');
const admin = await req('/api/auth/login', {
  method: 'POST',
  body: { username: 'admin', password: 'admin123' },
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

// A technician must not be able to mint users, and must not be able to mint a sysadmin.
const techCreate = await req('/api/profiles', {
  method: 'POST',
  token: techToken,
  body: { username: `esc_${uniq()}`, password: PASSWORD, role: 'sysadmin' },
});
check('technician cannot create users (privilege escalation blocked)', techCreate.status === 403, `status ${techCreate.status}`);

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

for (const id of [requester.data?.id, tech.data?.id]) {
  if (id) await req(`/api/profiles/${id}`, { method: 'DELETE', token: adminToken });
}
const verifyGone = await req(`/api/profiles/${tech.data?.id}`, { token: adminToken });
check('user is really gone after cleanup', verifyGone.status === 404, `status ${verifyGone.status}`);

// ── result ───────────────────────────────────────────────────────────────────
console.log(`\n${'─'.repeat(52)}`);
console.log(`  ${pass} passed, ${fail} failed`);
console.log(`${'─'.repeat(52)}\n`);
process.exit(fail === 0 ? 0 : 1);
