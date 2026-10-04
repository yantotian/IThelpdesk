export type UserRole = 'requester' | 'technician' | 'it_admin' | 'sysadmin';
export type TicketStatus = 'new' | 'assigned' | 'in_progress' | 'resolved' | 'on_hold' | 'verified' | 'closed';
export type TicketPriority = 'low' | 'medium' | 'high' | 'critical';

export interface Profile {
  id: string;
  username: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  office: string | null;
  contact: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  name: string;
  parent_id: string | null;
  is_active: boolean;
  sort_order: number;
  created_at: string;
}

export interface PriorityConfig {
  id: string;
  priority: TicketPriority;
  label: string;
  sla_hours: number;
  color: string;
}

export interface Ticket {
  id: string;
  ticket_number: string;
  requester_id: string;
  office: string | null;
  contact: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  priority: TicketPriority;
  subject: string;
  description: string | null;
  location: string | null;
  assigned_to: string | null;
  status: TicketStatus;
  resolution: string | null;
  resolved_at: string | null;
  sla_due_at: string | null;
  sla_breached: boolean;
  sla_alert_sent: boolean;
  auto_close_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  // joined
  requester?: Profile;
  assignee?: Profile;
  category?: Category;
  subcategory?: Category;
}

export interface TicketActivity {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  activity_type: 'comment' | 'status_change' | 'assignment' | 'resolution' | 'attachment' | 'system';
  content: string | null;
  old_value: string | null;
  new_value: string | null;
  created_at: string;
  actor?: Profile;
}

export interface TicketAttachment {
  id: string;
  ticket_id: string;
  uploader_id: string;
  file_name: string;
  file_path: string;
  file_size: number | null;
  mime_type: string | null;
  created_at: string;
  uploader?: Profile;
}

export interface AuditLog {
  id: string;
  actor_id: string | null;
  table_name: string;
  record_id: string;
  action: string;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
  actor?: Profile;
}

export interface SystemConfig {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
}

export interface TicketFilters {
  status?: TicketStatus | 'all';
  priority?: TicketPriority | 'all';
  category_id?: string | 'all';
  assigned_to?: string | 'all';
  search?: string;
  date_from?: string;
  date_to?: string;
  office?: string;
}

export interface DashboardStats {
  total: number;
  by_status: Record<TicketStatus, number>;
  by_priority: Record<TicketPriority, number>;
  sla_breached: number;
  open: number;
}

export interface TechnicianWorkload {
  id: string;
  full_name: string | null;
  username: string;
  active_tickets: number;
}

export interface AppNotification {
  id: string;
  user_id: string;
  ticket_id: string | null;
  type: 'sla_breach' | 'assignment' | 'comment' | 'status_change' | 'system';
  title: string;
  body: string | null;
  is_read: boolean;
  created_at: string;
  // joined
  ticket?: Pick<Ticket, 'id' | 'ticket_number' | 'subject'>;
}

export type IDRequestStatus = 'pending' | 'approved' | 'rejected';

export interface IDRequest {
  id: string;
  requester_id: string;
  office_name: string;
  full_name: string;
  nickname: string | null;
  id_number: string;
  position: string;
  address: string;
  emergency_name: string;
  emergency_contact: string;
  emergency_address: string;
  photo_url: string | null;
  signature_url: string | null;
  status: IDRequestStatus;
  notes: string | null;
  is_paid: boolean;
  created_at: string;
  updated_at: string;
  // joined
  requester?: Pick<Profile, 'id' | 'full_name' | 'username' | 'office'>;
}

// ── ICT Inventory ─────────────────────────────────────────────────────────────
export type DeviceType = 'laptop' | 'desktop' | 'printer' | 'router';
export type DeviceStatus = 'active' | 'inactive' | 'under_repair' | 'retired';
export type StorageType = 'HDD' | 'SSD' | 'NVMe' | 'eMMC';
export type PrinterType = 'inkjet' | 'laser' | 'dot_matrix' | 'thermal';
export type RouterType = 'wired' | 'wireless' | 'fiber' | 'mesh';
export type PlanType = 'fiber' | 'dsl' | 'cable' | 'wireless' | 'satellite';
export type InternetStatus = 'active' | 'inactive' | 'suspended';

export interface ICTDevice {
  id: string;
  device_type: DeviceType;
  brand: string;
  model: string;
  serial_no: string | null;
  asset_tag: string | null;
  location: string | null;
  assigned_to: string | null;
  status: DeviceStatus;
  // compute
  cpu: string | null;
  gpu: string | null;
  ram_gb: number | null;
  storage_gb: number | null;
  storage_type: StorageType | null;
  os: string | null;
  // printer
  printer_type: PrinterType | null;
  is_network_printer: boolean;
  // router
  router_type: RouterType | null;
  wifi_standard: string | null;
  num_ports: number | null;
  // shared
  purchase_date: string | null;
  warranty_until: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface ICTInternet {
  id: string;
  location: string;
  isp_name: string;
  plan_name: string;
  plan_type: PlanType;
  subscribed_speed_mbps: number;
  actual_dl_mbps: number | null;
  actual_ul_mbps: number | null;
  monthly_cost: number | null;
  contract_start: string | null;
  contract_end: string | null;
  account_no: string | null;
  contact_person: string | null;
  contact_number: string | null;
  router_id: string | null;
  status: InternetStatus;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  // joined
  router?: Pick<ICTDevice, 'id' | 'brand' | 'model'>;
}

export interface SpeedTestLog {
  id: string;
  internet_id: string;
  tested_at: string;
  dl_mbps: number;
  ul_mbps: number | null;
  latency_ms: number | null;
  notes: string | null;
  tested_by: string | null;
  created_at: string;
  // joined
  tester?: Pick<Profile, 'id' | 'full_name' | 'username'>;
}

export interface DeviceTicketLink {
  id: string;
  device_id: string;
  ticket_id: string;
  linked_by: string | null;
  note: string | null;
  created_at: string;
  // joined
  ticket?: Pick<Ticket, 'id' | 'ticket_number' | 'subject' | 'status' | 'priority'>;
  linker?: Pick<Profile, 'id' | 'full_name' | 'username'>;
}

export type SubmissionStatus = 'pending' | 'approved' | 'rejected';

export interface ICTInventorySubmission {
  id: string;
  submission_type: 'device' | 'internet';
  submitted_by: string | null;
  status: SubmissionStatus;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  // device fields
  device_type?: string | null;
  brand?: string | null;
  model?: string | null;
  serial_no?: string | null;
  asset_tag?: string | null;
  location?: string | null;
  assigned_to?: string | null;
  cpu?: string | null;
  gpu?: string | null;
  ram_gb?: number | null;
  storage_gb?: number | null;
  storage_type?: string | null;
  os?: string | null;
  printer_type?: string | null;
  is_network_printer?: boolean | null;
  router_type?: string | null;
  wifi_standard?: string | null;
  num_ports?: number | null;
  purchase_date?: string | null;
  warranty_until?: string | null;
  // internet fields
  isp_name?: string | null;
  plan_name?: string | null;
  plan_type?: string | null;
  subscribed_speed_mbps?: number | null;
  monthly_cost?: number | null;
  contract_start?: string | null;
  contract_end?: string | null;
  account_no?: string | null;
  contact_person?: string | null;
  contact_number?: string | null;
  // shared
  notes?: string | null;
  // joined
  submitter?: Pick<Profile, 'id' | 'full_name' | 'username'>;
  reviewer?: Pick<Profile, 'id' | 'full_name' | 'username'>;
}

export interface TicketTemplate {  id: string;
  name: string;
  description: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  priority: TicketPriority;
  subject: string;
  body: string;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joined
  category?: Category;
  subcategory?: Category;
}
