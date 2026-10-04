import { api } from '@/lib/api-client';
import type { Ticket, TicketActivity, TicketAttachment, Profile, Category, PriorityConfig, SystemConfig, TicketFilters, TicketStatus, AppNotification, TicketTemplate, IDRequest } from '@/types/types';

// ──────────────────────────────────────────────
// Profiles
// ──────────────────────────────────────────────
export async function getProfile(id: string): Promise<Profile | null> {
  return api.get<Profile>(`/profiles/${id}`);
}

export async function updateProfile(id: string, updates: Partial<Profile>) {
  return api.put(`/profiles/${id}`, updates);
}

export async function getProfiles(role?: string) {
  const query = role ? `?role=${role}` : '';
  return api.get<Profile[]>(`/profiles${query}`);
}

export async function getAllProfiles() {
  return api.get<Profile[]>('/profiles/all');
}

export async function updateProfileRole(id: string, role: string) {
  return api.put(`/profiles/${id}/role`, { role });
}

export async function toggleProfileActive(id: string, is_active: boolean) {
  return api.put(`/profiles/${id}/active`, { is_active });
}

// ──────────────────────────────────────────────
// Categories
// ──────────────────────────────────────────────
export async function getCategories(): Promise<Category[]> {
  return api.get<Category[]>('/categories');
}

export async function upsertCategory(cat: Partial<Category>) {
  if (cat.id) {
    return api.put(`/categories/${cat.id}`, cat);
  }
  return api.post('/categories', cat);
}

export async function deactivateCategory(id: string) {
  return api.delete(`/categories/${id}`);
}

export async function deleteCategory(id: string) {
  return api.delete(`/categories/${id}`);
}

export async function updateCategorySortOrders(items: { id: string; sort_order: number }[]) {
  return api.post('/categories/sort', { items });
}

// ──────────────────────────────────────────────
// ID Requests
// ──────────────────────────────────────────────
const toHex = (s: string) =>
  Array.from(new TextEncoder().encode(s), (b) => b.toString(16).padStart(2, '0')).join('');

export function getStoragePathFromRef(bucketOrRef: string, ref?: string): string {
  const value = ref ?? bucketOrRef;
  if (!value.startsWith('http')) return value;
  const marker = `/object/`;
  const idx = value.indexOf(marker);
  if (idx === -1) return value;
  const rest = value.slice(idx + marker.length);
  const slashIdx = rest.indexOf('/');
  return slashIdx === -1 ? rest : rest.slice(slashIdx + 1);
}

/**
 * Requests a short-lived signed URL for a stored file.
 * The returned URL embeds its own credential, so it can be used directly in
 * an <img src> / <a href> where an Authorization header cannot be attached.
 * `bucket` is kept for call-site compatibility; the server derives the bucket
 * from the stored path.
 */
export async function getSignedStorageUrl(_bucket: string, ref: string): Promise<string> {
  const p = getStoragePathFromRef(_bucket, ref);
  const { url } = await api.post<{ url: string }>('/files/sign', { path: p });
  return url;
}

export async function submitIDRequest(payload: {
  office_name: string; full_name: string; nickname: string; id_number: string;
  position: string; address: string;
  emergency_name: string; emergency_contact: string; emergency_address: string;
  photoFile?: File | null; signatureDataUrl?: string | null;
  userId: string;
}): Promise<void> {
  let photo_url: string | null = null;
  let signature_url: string | null = null;

  if (payload.photoFile) {
    const formData = new FormData();
    formData.append('file', payload.photoFile);
    const result = await api.upload<{ path: string }>('/upload/id-photos', formData);
    photo_url = result.path;
  }

  if (payload.signatureDataUrl) {
    const res = await fetch(payload.signatureDataUrl);
    const blob = await res.blob();
    const sigFile = new File([blob], 'signature.png', { type: 'image/png' });
    const formData = new FormData();
    formData.append('file', sigFile);
    const result = await api.upload<{ path: string }>('/upload/id-signatures', formData);
    signature_url = result.path;
  }

  await api.post('/id-requests', {
    office_name: payload.office_name,
    full_name: payload.full_name,
    nickname: payload.nickname || null,
    id_number: payload.id_number,
    position: payload.position,
    address: payload.address,
    emergency_name: payload.emergency_name,
    emergency_contact: payload.emergency_contact,
    emergency_address: payload.emergency_address,
    photo_url,
    signature_url,
  });
}

export async function getIDRequests(page = 0, limit = 50) {
  return api.get<IDRequest[]>(`/id-requests?page=${page}&limit=${limit}`);
}

export async function getMyIDRequests() {
  return api.get<IDRequest[]>('/id-requests/my');
}

export async function updateIDRequestStatus(id: string, status: string, notes?: string) {
  return api.put(`/id-requests/${id}/status`, { status, notes });
}

export async function updateIDRequestPayment(id: string, is_paid: boolean) {
  return api.put(`/id-requests/${id}/payment`, { is_paid });
}

// ── ICT Inventory ─────────────────────────────────────────────────────────────
import type { ICTDevice, ICTInternet } from '@/types/types';

export async function getICTDevices(type?: string) {
  const query = type && type !== 'all' ? `?type=${type}` : '';
  return api.get<ICTDevice[]>(`/ict/devices${query}`);
}

export async function createICTDevice(payload: Partial<ICTDevice>) {
  return api.post<ICTDevice>('/ict/devices', payload);
}

export async function updateICTDevice(id: string, payload: Partial<ICTDevice>) {
  return api.put<ICTDevice>(`/ict/devices/${id}`, payload);
}

export async function deleteICTDevice(id: string) {
  return api.delete(`/ict/devices/${id}`);
}

export async function getICTInternet() {
  return api.get<ICTInternet[]>('/ict/internet');
}

export async function createICTInternet(payload: Partial<ICTInternet>) {
  return api.post<ICTInternet>('/ict/internet', payload);
}

export async function updateICTInternet(id: string, payload: Partial<ICTInternet>) {
  return api.put<ICTInternet>(`/ict/internet/${id}`, payload);
}

export async function deleteICTInternet(id: string) {
  return api.delete(`/ict/internet/${id}`);
}

// ── Speed Test Logs ──────────────────────────────────────────────────────────
import type { SpeedTestLog, DeviceTicketLink } from '@/types/types';

export async function getSpeedTestLogs(internetId: string) {
  return api.get<SpeedTestLog[]>(`/ict/speed-tests/${internetId}`);
}

export async function createSpeedTestLog(payload: {
  internet_id: string;
  dl_mbps: number;
  ul_mbps?: number | null;
  latency_ms?: number | null;
  notes?: string | null;
  tested_at?: string;
}) {
  return api.post<SpeedTestLog>('/ict/speed-tests', payload);
}

export async function deleteSpeedTestLog(id: string) {
  return api.delete(`/ict/speed-tests/${id}`);
}

export async function getAllSpeedTestLogs() {
  return api.get<SpeedTestLog[]>('/ict/speed-tests');
}

// ── Device-Ticket Links ───────────────────────────────────────────────────────
export async function getDeviceTicketLinks(deviceId: string) {
  return api.get<DeviceTicketLink[]>(`/ict/device-links/${deviceId}`);
}

export async function createDeviceTicketLink(payload: {
  device_id: string;
  ticket_id: string;
  note?: string | null;
}) {
  return api.post<DeviceTicketLink>('/ict/device-links', payload);
}

export async function deleteDeviceTicketLink(id: string) {
  return api.delete(`/ict/device-links/${id}`);
}

export async function searchTickets(query: string) {
  return api.get<Ticket[]>(`/search?q=${encodeURIComponent(query)}`);
}

// ── ICT Inventory Submissions ─────────────────────────────────────────────────
import type { ICTInventorySubmission } from '@/types/types';

export async function getMySubmissions() {
  return api.get<ICTInventorySubmission[]>('/ict/submissions');
}

export async function getAllSubmissions() {
  return api.get<ICTInventorySubmission[]>('/ict/submissions');
}

export async function createInventorySubmission(payload: Omit<ICTInventorySubmission,
  'id' | 'status' | 'admin_note' | 'reviewed_by' | 'reviewed_at' | 'created_at' | 'submitter' | 'reviewer'
>) {
  return api.post<ICTInventorySubmission>('/ict/submissions', payload);
}

export async function reviewInventorySubmission(id: string, status: 'approved' | 'rejected', admin_note?: string) {
  return api.put<ICTInventorySubmission>(`/ict/submissions/${id}/review`, { status, admin_note });
}

export async function getIDRequestCount(): Promise<number> {
  const result = await api.get<{ count: number }>('/id-requests/count');
  return result.count;
}

export async function deleteTicket(id: string) {
  return api.delete(`/tickets/${id}`);
}

// ──────────────────────────────────────────────
// Priority Config
// ──────────────────────────────────────────────
export async function getPriorityConfigs(): Promise<PriorityConfig[]> {
  return api.get<PriorityConfig[]>('/priority-configs');
}

export async function updatePriorityConfig(id: string, updates: Partial<PriorityConfig>) {
  return api.put(`/priority-configs/${id}`, updates);
}

// ──────────────────────────────────────────────
// System Config
// ──────────────────────────────────────────────
export async function getSystemConfigs(): Promise<SystemConfig[]> {
  return api.get<SystemConfig[]>('/system-configs');
}

export async function updateSystemConfig(key: string, value: string) {
  return api.put(`/system-configs/${key}`, { value });
}

// ──────────────────────────────────────────────
// Tickets
// ──────────────────────────────────────────────
export async function getTickets(filters: TicketFilters = {}, page = 0, limit = 25): Promise<Ticket[]> {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'all') params.set('status', filters.status);
  if (filters.priority && filters.priority !== 'all') params.set('priority', filters.priority);
  if (filters.category_id && filters.category_id !== 'all') params.set('category_id', filters.category_id);
  if (filters.assigned_to && filters.assigned_to !== 'all') params.set('assigned_to', filters.assigned_to);
  if (filters.office) params.set('office', filters.office);
  if (filters.date_from) params.set('date_from', filters.date_from);
  if (filters.date_to) params.set('date_to', filters.date_to);
  if (filters.search) params.set('search', filters.search);
  params.set('page', page.toString());
  params.set('limit', limit.toString());
  return api.get<Ticket[]>(`/tickets?${params.toString()}`);
}

export async function getMyTickets(userId: string, filters: TicketFilters = {}, page = 0): Promise<Ticket[]> {
  const tickets = await getTickets({ ...filters, assigned_to: undefined }, page, 25);
  return tickets.filter(t => t.requester_id === userId);
}

export async function getAssignedTickets(userId: string, filters: TicketFilters = {}, page = 0): Promise<Ticket[]> {
  return getTickets({ ...filters, assigned_to: userId }, page, 25);
}

export async function getTicket(id: string): Promise<Ticket | null> {
  return api.get<Ticket>(`/tickets/${id}`);
}

export async function getTicketByNumber(ticketNumber: string): Promise<Ticket | null> {
  return api.get<Ticket>(`/tickets/number/${ticketNumber}`);
}

export async function createTicket(payload: Partial<Ticket>): Promise<string> {
  const result = await api.post<{ id: string }>('/tickets', payload);
  return result.id;
}

export async function updateTicket(id: string, updates: Partial<Ticket>) {
  return api.put(`/tickets/${id}`, updates);
}

export async function updateTicketStatus(
  ticketId: string,
  newStatus: TicketStatus,
  actorId: string,
  oldStatus: TicketStatus,
  note?: string
) {
  return api.put(`/tickets/${ticketId}/status`, { status: newStatus, note });
}

export async function assignTicket(ticketId: string, techId: string, actorId: string) {
  return api.put(`/tickets/${ticketId}/assign`, { techId });
}

export async function bulkAssignTickets(ticketIds: string[], techId: string, actorId: string) {
  return api.post('/tickets/bulk-assign', { ticketIds, techId });
}

// ──────────────────────────────────────────────
// Activities
// ──────────────────────────────────────────────
export async function getActivities(ticketId: string): Promise<TicketActivity[]> {
  return api.get<TicketActivity[]>(`/tickets/${ticketId}/activities`);
}

export async function addComment(ticketId: string, actorId: string, content: string) {
  return api.post(`/tickets/${ticketId}/comments`, { content });
}

// ──────────────────────────────────────────────
// Attachments
// ──────────────────────────────────────────────
export async function getAttachments(ticketId: string): Promise<TicketAttachment[]> {
  return api.get<TicketAttachment[]>(`/tickets/${ticketId}/attachments`);
}

export async function uploadAttachment(ticketId: string, uploaderId: string, file: File) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('ticketId', ticketId);
  return api.upload<TicketAttachment>('/upload/ticket-attachments', formData);
}

export async function getAttachmentUrl(path: string): Promise<string> {
  return getSignedStorageUrl('ticket-attachments', path);
}

// ──────────────────────────────────────────────
// Dashboard / Reports
// ──────────────────────────────────────────────
export interface DashboardStats {
  [key: string]: unknown;
  total_tickets?: number;
  open_tickets?: number;
  in_progress_tickets?: number;
  resolved_tickets?: number;
  closed_tickets?: number;
  sla_breached?: number;
}

export interface TechnicianWorkload {
  id: string;
  username: string;
  full_name: string | null;
  active_tickets: number;
}

export async function getDashboardStats(userId?: string, role?: string) {
  return api.get<DashboardStats>('/dashboard-stats');
}

export async function getTechnicianWorkload() {
  return api.get<TechnicianWorkload[]>('/technician-workload');
}

export async function getRecentActivity(limit = 20) {
  return api.get<TicketActivity[]>(`/recent-activity?limit=${limit}`);
}

// ──────────────────────────────────────────────
// Notifications
// ──────────────────────────────────────────────
export async function getNotifications(userId: string, limit = 30): Promise<AppNotification[]> {
  return api.get<AppNotification[]>(`/notifications?limit=${limit}`);
}

export async function getUnreadCount(userId: string): Promise<number> {
  const result = await api.get<{ count: number }>('/notifications/unread-count');
  return result.count;
}

export async function markNotificationRead(id: string) {
  return api.put(`/notifications/${id}/read`, {});
}

export async function markAllNotificationsRead(userId: string) {
  return api.put('/notifications/read-all', {});
}

// ──────────────────────────────────────────────
// Ticket Templates
// ──────────────────────────────────────────────
export async function getTicketTemplates(activeOnly = true): Promise<TicketTemplate[]> {
  const query = activeOnly ? '' : '?active=false';
  return api.get<TicketTemplate[]>(`/templates${query}`);
}

export async function upsertTicketTemplate(t: Partial<TicketTemplate>): Promise<void> {
  return api.post('/templates', t);
}

export async function deleteTicketTemplate(id: string) {
  return api.delete(`/templates/${id}`);
}

// ──────────────────────────────────────────────
// Global Search
// ──────────────────────────────────────────────
export interface SearchResult {
  type: 'ticket' | 'user' | 'category';
  id: string;
  label: string;
  sub: string;
  path: string;
}

export async function globalSearch(q: string): Promise<SearchResult[]> {
  return api.get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`);
}
