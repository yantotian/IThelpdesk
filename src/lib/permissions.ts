import type { UserRole, Role } from '@/types/types';

// Page keys — keep in sync with server/src/permissions.ts PAGE_KEYS
export const PAGE_KEYS = [
  'dashboard', 'tickets', 'kanban', 'reports',
  'id-request', 'id-requests',
  'ict-inventory', 'ict-dashboard',
  'venues', 'venue-bookings',
  'users', 'categories', 'priorities', 'config', 'audit', 'templates',
] as const;

export type PageKey = (typeof PAGE_KEYS)[number];

export const PAGE_LABELS: Record<PageKey, string> = {
  dashboard: 'Dashboard',
  tickets: 'Tickets',
  kanban: 'Kanban',
  reports: 'Reports',
  'id-request': 'ID Request (self)',
  'id-requests': 'ID Requests (admin)',
  'ict-inventory': 'ICT Inventory',
  'ict-dashboard': 'ICT Dashboard',
  venues: 'Venues',
  'venue-bookings': 'Booking Approvals',
  users: 'Users',
  categories: 'Categories',
  priorities: 'Priorities',
  config: 'System Config',
  audit: 'Audit Log',
  templates: 'Templates',
};

export const PAGE_GROUPS: Array<{ title: string; keys: PageKey[] }> = [
  { title: 'General', keys: ['dashboard', 'tickets', 'kanban', 'reports'] },
  { title: 'ID / ICT', keys: ['id-request', 'id-requests', 'ict-inventory', 'ict-dashboard'] },
  { title: 'Venues', keys: ['venues', 'venue-bookings'] },
  { title: 'Administration', keys: ['users', 'categories', 'priorities', 'config', 'audit', 'templates'] },
];

export const BUILTIN_ROLE_PAGES: Record<UserRole, PageKey[]> = {
  requester: ['dashboard', 'tickets', 'id-request', 'ict-inventory', 'venues'],
  technician: ['dashboard', 'tickets', 'kanban', 'id-request', 'ict-inventory', 'venues'],
  it_admin: [
    'dashboard', 'tickets', 'kanban', 'reports',
    'id-request', 'id-requests',
    'ict-inventory', 'ict-dashboard',
    'venues', 'venue-bookings',
    'users', 'categories', 'priorities', 'config', 'audit', 'templates',
  ],
  sysadmin: [
    'dashboard', 'tickets', 'kanban', 'reports',
    'id-request', 'id-requests',
    'ict-inventory', 'ict-dashboard',
    'venues', 'venue-bookings',
    'users', 'categories', 'priorities', 'config', 'audit', 'templates',
  ],
};

// Returns the allowed page keys for a given (role, customRoles list).
// For built-ins, it's fixed. For custom roles, look it up. Unknown custom → [].
export function getPagesForRole(role: UserRole | string | null | undefined, customRoles: Role[] = []): PageKey[] {
  if (!role) return [];
  if (role === 'requester' || role === 'technician' || role === 'it_admin' || role === 'sysadmin') {
    return BUILTIN_ROLE_PAGES[role as UserRole];
  }
  const found = customRoles.find(r => r.name === role);
  if (!found) return [];
  return found.permissions.filter(p => (PAGE_KEYS as readonly string[]).includes(p)) as PageKey[];
}

export function hasPage(role: UserRole | string | null | undefined, customRoles: Role[], page: PageKey): boolean {
  const pages = getPagesForRole(role, customRoles);
  return pages.includes(page);
}
