import type { UserRole } from '@/types/types';

export const ROLES: UserRole[] = ['requester', 'technician', 'it_admin', 'sysadmin'];

export const ROLE_LABELS: Record<UserRole, string> = {
  requester: 'Requester',
  technician: 'Technician',
  it_admin: 'IT Admin',
  sysadmin: 'System Admin',
};

export interface RoleDescription {
  label: string;
  summary: string;
  capabilities: string[];
}

export const ROLE_DESCRIPTIONS: Record<UserRole, RoleDescription> = {
  requester: {
    label: 'Requester',
    summary: 'Default role for registered users who submit requests.',
    capabilities: [
      'Create and track own tickets',
      'Confirm resolution / reopen tickets',
      'Submit ID requests and ICT inventory information',
    ],
  },
  technician: {
    label: 'Technician',
    summary: 'Handles and resolves assigned tickets.',
    capabilities: [
      'View all tickets and the Kanban board',
      'Work assigned tickets and update status',
      'Review inventory submissions',
    ],
  },
  it_admin: {
    label: 'IT Admin',
    summary: 'Manages system catalogs and day-to-day administrative functions.',
    capabilities: [
      'Everything a Technician can do',
      'View reports and inventory dashboards',
      'Manage categories, priorities, templates, and ID/ICT requests',
      'Read system configuration and audit log',
    ],
  },
  sysadmin: {
    label: 'System Admin',
    summary: 'Highest access. Owns user and role management.',
    capabilities: [
      'Everything an IT Admin can do',
      'Manage registered users and assign roles',
      'Deactivate or delete user accounts',
      'Edit system configuration and delete tickets',
    ],
  },
};

// Higher value = higher privilege.
export const ROLE_LEVEL: Record<UserRole, number> = {
  requester: 0,
  technician: 1,
  it_admin: 2,
  sysadmin: 3,
};

export function isAtLeastRole(role: UserRole | null | undefined, min: UserRole): boolean {
  return !!role && ROLE_LEVEL[role] >= ROLE_LEVEL[min];
}

export function isSysAdmin(role: UserRole | null | undefined): boolean {
  return role === 'sysadmin';
}