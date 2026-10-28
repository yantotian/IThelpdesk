import { sql } from './db/index.js';
// Page keys a custom role can be granted. Mirrors src/lib/roles.ts PAGES —
// keep the two lists in sync.
export const PAGE_KEYS = [
    'dashboard', 'tickets', 'kanban', 'reports',
    'id-request', 'id-requests',
    'ict-inventory', 'ict-dashboard',
    'venues', 'venue-bookings',
    'users', 'categories', 'priorities', 'config', 'audit', 'templates',
];
// Built-in roles are defined in code; only the four below can never be
// created, renamed or deleted through the roles API.
const BUILTIN_ROLES = new Set(['requester', 'technician', 'it_admin', 'sysadmin']);
export function isBuiltinRole(role) {
    return BUILTIN_ROLES.has(role);
}
// Custom-role name → granted pages. Invalidated by the roles routes on every
// mutation; the app is single-instance, so an in-process cache is enough.
const cache = new Map();
export function invalidateRoleCache(...names) {
    if (names.length === 0)
        cache.clear();
    else
        for (const n of names)
            if (n)
                cache.delete(n);
}
export async function getCustomRolePages(role) {
    if (isBuiltinRole(role))
        return [];
    const hit = cache.get(role);
    if (hit)
        return hit;
    // Unknown/deleted roles resolve to [] → denied, the safe default.
    const rows = await sql `SELECT permissions FROM roles WHERE name = ${role} LIMIT 1`;
    const pages = rows[0]?.permissions ?? [];
    cache.set(role, pages);
    return pages;
}
// True when a CUSTOM role was granted the page. Built-in roles never pass
// here: their access is decided by the explicit role allowlists at each call
// site, which keeps their behaviour exactly as before.
export async function hasCustomPage(role, page) {
    return (await getCustomRolePages(role)).includes(page);
}
