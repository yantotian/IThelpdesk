-- Ciodesk Helpdesk Database Schema
-- Combined from all Supabase migrations, adapted for standalone PostgreSQL

-- Enums (idempotent: CREATE TYPE has no IF NOT EXISTS in older PostgreSQL)
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('requester', 'technician', 'it_admin', 'sysadmin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_status AS ENUM ('new', 'assigned', 'in_progress', 'resolved', 'on_hold', 'verified', 'closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE ticket_priority AS ENUM ('low', 'medium', 'high', 'critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Users table (replaces auth.users + profiles)
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text UNIQUE NOT NULL,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text,
  role user_role NOT NULL DEFAULT 'requester',
  office text,
  contact text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  parent_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Priority config (SLA hours)
CREATE TABLE IF NOT EXISTS priority_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  priority ticket_priority UNIQUE NOT NULL,
  label text NOT NULL,
  sla_hours int NOT NULL,
  color text NOT NULL DEFAULT '#888888'
);

-- Tickets
CREATE TABLE IF NOT EXISTS tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_number text UNIQUE NOT NULL,
  requester_id uuid NOT NULL REFERENCES users(id),
  office text,
  contact text,
  category_id uuid REFERENCES categories(id),
  subcategory_id uuid REFERENCES categories(id),
  priority ticket_priority NOT NULL DEFAULT 'medium',
  subject text NOT NULL,
  description text,
  location text,
  assigned_to uuid REFERENCES users(id),
  status ticket_status NOT NULL DEFAULT 'new',
  resolution text,
  resolved_at timestamptz,
  sla_due_at timestamptz,
  sla_breached boolean NOT NULL DEFAULT false,
  sla_alert_sent boolean NOT NULL DEFAULT false,
  auto_close_at timestamptz,
  remarks text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Ticket activities
CREATE TABLE IF NOT EXISTS ticket_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES users(id) ON DELETE SET NULL,
  activity_type text NOT NULL,
  content text,
  old_value text,
  new_value text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Attachments
CREATE TABLE IF NOT EXISTS ticket_attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  uploader_id uuid NOT NULL REFERENCES users(id),
  file_name text NOT NULL,
  file_path text NOT NULL,
  file_size bigint,
  mime_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES users(id),
  table_name text NOT NULL,
  record_id text NOT NULL,
  action text NOT NULL,
  old_data jsonb,
  new_data jsonb,
  ip_address text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- System config
CREATE TABLE IF NOT EXISTS system_config (
  key text PRIMARY KEY,
  value text NOT NULL,
  description text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_id uuid REFERENCES tickets(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('sla_breach','assignment','comment','status_change','system')),
  title text NOT NULL,
  body text,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread ON notifications(user_id, is_read, created_at DESC);

-- Ticket templates
CREATE TABLE IF NOT EXISTS ticket_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  description text,
  category_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  subcategory_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  priority text NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','critical')),
  subject text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ID Requests
CREATE TABLE IF NOT EXISTS id_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL DEFAULT gen_random_uuid() REFERENCES users(id) ON DELETE CASCADE,
  office_name text NOT NULL,
  full_name text NOT NULL,
  nickname text,
  id_number text NOT NULL,
  position text NOT NULL,
  address text NOT NULL,
  emergency_name text NOT NULL,
  emergency_contact text NOT NULL,
  emergency_address text NOT NULL,
  photo_url text,
  signature_url text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  notes text,
  is_paid boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ICT Devices
CREATE TABLE IF NOT EXISTS ict_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_type text NOT NULL CHECK (device_type IN ('laptop','desktop','printer','router')),
  brand text NOT NULL,
  model text NOT NULL,
  serial_no text,
  asset_tag text,
  location text,
  assigned_to text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','under_repair','retired')),
  cpu text,
  gpu text,
  ram_gb integer,
  storage_gb integer,
  storage_type text CHECK (storage_type IN ('HDD','SSD','NVMe','eMMC') OR storage_type IS NULL),
  os text,
  printer_type text CHECK (printer_type IN ('inkjet','laser','dot_matrix','thermal') OR printer_type IS NULL),
  is_network_printer boolean DEFAULT false,
  router_type text CHECK (router_type IN ('wired','wireless','fiber','mesh') OR router_type IS NULL),
  wifi_standard text,
  num_ports integer,
  purchase_date date,
  warranty_until date,
  notes text,
  created_by uuid NOT NULL DEFAULT gen_random_uuid() REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ICT Internet
CREATE TABLE IF NOT EXISTS ict_internet (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location text NOT NULL,
  isp_name text NOT NULL,
  plan_name text NOT NULL,
  plan_type text NOT NULL CHECK (plan_type IN ('fiber','dsl','cable','wireless','satellite')),
  subscribed_speed_mbps integer NOT NULL,
  actual_dl_mbps numeric(6,2),
  actual_ul_mbps numeric(6,2),
  monthly_cost numeric(10,2),
  contract_start date,
  contract_end date,
  account_no text,
  contact_person text,
  contact_number text,
  router_id uuid REFERENCES ict_devices(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','suspended')),
  notes text,
  created_by uuid NOT NULL DEFAULT gen_random_uuid() REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Speed test logs
CREATE TABLE IF NOT EXISTS speed_test_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  internet_id uuid NOT NULL REFERENCES ict_internet(id) ON DELETE CASCADE,
  tested_at timestamptz NOT NULL DEFAULT now(),
  dl_mbps numeric(10,2) NOT NULL,
  ul_mbps numeric(10,2),
  latency_ms integer,
  notes text,
  tested_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_speed_test_logs_internet_id ON speed_test_logs(internet_id);
CREATE INDEX IF NOT EXISTS idx_speed_test_logs_tested_at ON speed_test_logs(tested_at DESC);

-- Device-ticket links
CREATE TABLE IF NOT EXISTS device_ticket_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id uuid NOT NULL REFERENCES ict_devices(id) ON DELETE CASCADE,
  ticket_id uuid NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  linked_by uuid REFERENCES users(id) ON DELETE SET NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(device_id, ticket_id)
);

CREATE INDEX IF NOT EXISTS idx_dtl_device_id ON device_ticket_links(device_id);
CREATE INDEX IF NOT EXISTS idx_dtl_ticket_id ON device_ticket_links(ticket_id);

-- ICT Inventory submissions
CREATE TABLE IF NOT EXISTS ict_inventory_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_type text NOT NULL CHECK (submission_type IN ('device','internet')),
  submitted_by uuid REFERENCES users(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  admin_note text,
  reviewed_by uuid REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  device_type text,
  brand text,
  model text,
  serial_no text,
  asset_tag text,
  location text,
  assigned_to text,
  cpu text,
  gpu text,
  ram_gb integer,
  storage_gb integer,
  storage_type text,
  os text,
  printer_type text,
  is_network_printer boolean,
  router_type text,
  wifi_standard text,
  num_ports integer,
  purchase_date date,
  warranty_until date,
  isp_name text,
  plan_name text,
  plan_type text,
  subscribed_speed_mbps numeric,
  monthly_cost numeric,
  contract_start date,
  contract_end date,
  account_no text,
  contact_person text,
  contact_number text,
  notes text
);

-- Ticket number sequence
CREATE SEQUENCE IF NOT EXISTS ticket_seq START 1;

-- Auto-generate ticket number
CREATE OR REPLACE FUNCTION generate_ticket_number()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  yr text;
  seq_val bigint;
BEGIN
  yr := to_char(now(), 'YYYY');
  seq_val := nextval('ticket_seq');
  NEW.ticket_number := 'TKT-' || yr || '-' || lpad(seq_val::text, 5, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ticket_number ON tickets;
CREATE TRIGGER trg_ticket_number
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION generate_ticket_number();

-- Update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_tickets_updated_at ON tickets;
CREATE TRIGGER trg_tickets_updated_at BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_ict_devices_updated_at ON ict_devices;
CREATE TRIGGER trg_ict_devices_updated_at BEFORE UPDATE ON ict_devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_ict_internet_updated_at ON ict_internet;
CREATE TRIGGER trg_ict_internet_updated_at BEFORE UPDATE ON ict_internet
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_ticket_templates_updated_at ON ticket_templates;
CREATE TRIGGER trg_ticket_templates_updated_at BEFORE UPDATE ON ticket_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-set SLA due date on ticket insert
CREATE OR REPLACE FUNCTION set_sla_due()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  sla_h int;
BEGIN
  SELECT sla_hours INTO sla_h FROM priority_config WHERE priority = NEW.priority;
  IF sla_h IS NOT NULL THEN
    NEW.sla_due_at := now() + (sla_h || ' hours')::interval;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sla_due ON tickets;
CREATE TRIGGER trg_sla_due
  BEFORE INSERT ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_sla_due();

-- Set auto-close timestamp when ticket moves to verified
CREATE OR REPLACE FUNCTION set_auto_close()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'verified' AND (OLD.status IS DISTINCT FROM 'verified') THEN
    NEW.auto_close_at := now() + interval '48 hours';
  END IF;
  IF NEW.status != 'verified' THEN
    NEW.auto_close_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_close ON tickets;
CREATE TRIGGER trg_auto_close
  BEFORE UPDATE ON tickets
  FOR EACH ROW EXECUTE FUNCTION set_auto_close();

-- Notification trigger
CREATE OR REPLACE FUNCTION on_ticket_activity_notify()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_requester uuid;
  v_assignee  uuid;
  v_ticket_number text;
  v_ticket_id uuid := NEW.ticket_id;
BEGIN
  SELECT requester_id, assigned_to, ticket_number
  INTO v_requester, v_assignee, v_ticket_number
  FROM tickets WHERE id = v_ticket_id;

  IF v_requester IS NULL THEN RETURN NEW; END IF;

  IF NEW.activity_type = 'assignment' THEN
    IF v_assignee IS NOT NULL AND (NEW.actor_id IS NULL OR NEW.actor_id <> v_assignee) THEN
      INSERT INTO notifications (user_id, ticket_id, type, title, body)
      VALUES (
        v_assignee, v_ticket_id, 'assignment',
        'Ticket assigned to you',
        'Ticket ' || v_ticket_number || ' has been assigned to you.'
      );
    END IF;

  ELSIF NEW.activity_type = 'status_change' THEN
    IF NEW.actor_id IS NULL OR NEW.actor_id <> v_requester THEN
      INSERT INTO notifications (user_id, ticket_id, type, title, body)
      VALUES (
        v_requester, v_ticket_id, 'status_change',
        'Ticket status updated',
        'Ticket ' || v_ticket_number || ' status changed to ' || COALESCE(NEW.new_value, 'unknown') || '.'
      );
    END IF;

  ELSIF NEW.activity_type = 'comment' THEN
    IF NEW.actor_id IS NULL OR NEW.actor_id <> v_requester THEN
      INSERT INTO notifications (user_id, ticket_id, type, title, body)
      VALUES (
        v_requester, v_ticket_id, 'comment',
        'New comment on your ticket',
        LEFT(COALESCE(NEW.content, ''), 500)
      );
    END IF;

    IF v_assignee IS NOT NULL AND (NEW.actor_id IS NULL OR NEW.actor_id <> v_assignee) AND v_assignee <> v_requester THEN
      INSERT INTO notifications (user_id, ticket_id, type, title, body)
      VALUES (
        v_assignee, v_ticket_id, 'comment',
        'New comment on assigned ticket',
        LEFT(COALESCE(NEW.content, ''), 500)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_ticket_activity_notify ON ticket_activities;
CREATE TRIGGER on_ticket_activity_notify
  AFTER INSERT ON ticket_activities
  FOR EACH ROW EXECUTE FUNCTION on_ticket_activity_notify();

-- Seed: top-level categories.
-- NOTE: categories has no UNIQUE constraint on (name, parent_id), so ON CONFLICT
-- DO NOTHING would silently insert duplicates on every boot. Use NOT EXISTS.
INSERT INTO categories (name, parent_id, is_active, sort_order)
SELECT v.name, NULL, true, v.sort_order
FROM (VALUES
  ('Hardware', 1), ('Software', 2), ('Network', 3), ('Email', 4),
  ('Printer', 5), ('Account', 6), ('Server', 7), ('Mobile', 8),
  ('WiFi', 9), ('Website', 10), ('IS', 11), ('Other', 12)
) AS v(name, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM categories c WHERE c.name = v.name AND c.parent_id IS NULL
);

-- Seed subcategories
DO $$
DECLARE
  hw_id uuid; sw_id uuid; net_id uuid; acc_id uuid; srv_id uuid; mob_id uuid;
BEGIN
  SELECT id INTO hw_id FROM categories WHERE name = 'Hardware' AND parent_id IS NULL;
  SELECT id INTO sw_id FROM categories WHERE name = 'Software' AND parent_id IS NULL;
  SELECT id INTO net_id FROM categories WHERE name = 'Network' AND parent_id IS NULL;
  SELECT id INTO acc_id FROM categories WHERE name = 'Account' AND parent_id IS NULL;
  SELECT id INTO srv_id FROM categories WHERE name = 'Server' AND parent_id IS NULL;
  SELECT id INTO mob_id FROM categories WHERE name = 'Mobile' AND parent_id IS NULL;

  INSERT INTO categories (name, parent_id, is_active, sort_order)
  SELECT v.name, v.parent_id, true, v.sort_order
  FROM (VALUES
    ('Desktop/Laptop', hw_id, 1), ('Keyboard/Mouse', hw_id, 2),
    ('Monitor', hw_id, 3), ('UPS/Power', hw_id, 4),
    ('Installation', sw_id, 1), ('Update/Patch', sw_id, 2),
    ('License', sw_id, 3), ('Bug/Error', sw_id, 4),
    ('LAN', net_id, 1), ('VPN', net_id, 2), ('Firewall', net_id, 3),
    ('Password Reset', acc_id, 1), ('New Account', acc_id, 2),
    ('Permissions', acc_id, 3),
    ('Windows Server', srv_id, 1), ('Linux Server', srv_id, 2),
    ('iOS', mob_id, 1), ('Android', mob_id, 2)
  ) AS v(name, parent_id, sort_order)
  WHERE NOT EXISTS (
    SELECT 1 FROM categories c WHERE c.name = v.name AND c.parent_id = v.parent_id
  );
END;
$$;

-- Seed: priority config.
-- DO NOTHING (not DO UPDATE): an admin may have customised sla_hours/label/color
-- through the admin UI, and re-running this seed on boot must not revert it.
INSERT INTO priority_config (priority, label, sla_hours, color) VALUES
  ('low', 'Low', 48, '#888888'),
  ('medium', 'Medium', 24, '#4A90D9'),
  ('high', 'High', 8, '#F5A623'),
  ('critical', 'Critical', 4, '#FF4500')
ON CONFLICT (priority) DO NOTHING;

-- Seed: system config
INSERT INTO system_config (key, value, description) VALUES
  ('auto_close_hours', '48', 'Hours after Verified status before auto-close'),
  ('sla_alert_email', 'itadmin@company.com', 'Email for SLA breach alerts'),
  ('auto_assign_enabled', 'true', 'Enable auto-assignment to least-busy technician'),
  ('rate_limit_per_minute', '60', 'API rate limit per minute per user')
ON CONFLICT (key) DO NOTHING;

-- Seed: ticket templates.
-- ticket_templates has no unique constraint, so guard with NOT EXISTS to avoid
-- inserting duplicates on every boot.
INSERT INTO ticket_templates (name, description, priority, subject, body, is_active)
SELECT v.name, v.description, v.priority, v.subject, v.body, true
FROM (VALUES
  ('Password Reset', 'Standard password reset request', 'low', 'Password Reset Request',
   'Please reset my account password. My username is: [username]' || chr(10) || 'Department: [department]'),
  ('New PC Setup', 'New employee workstation setup', 'medium', 'New Workstation Setup Required',
   'A new workstation needs to be set up for:' || chr(10) || 'Employee Name: [name]' || chr(10) || 'Department: [department]' || chr(10) || 'Required software: [list software]' || chr(10) || 'Start date: [date]'),
  ('Network Issue', 'Cannot connect to network/VPN', 'high', 'Network Connectivity Issue',
   'I am unable to connect to the network.' || chr(10) || 'Location: [office/floor]' || chr(10) || 'Device: [device name/model]' || chr(10) || 'Error message (if any): [error]' || chr(10) || 'Since when: [date/time]')
) AS v(name, description, priority, subject, body)
WHERE NOT EXISTS (
  SELECT 1 FROM ticket_templates t WHERE t.name = v.name
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_tickets_requester_id ON tickets(requester_id);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned_to ON tickets(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ticket_activities_ticket_id ON ticket_activities(ticket_id);
CREATE INDEX IF NOT EXISTS idx_ticket_attachments_ticket_id ON ticket_attachments(ticket_id);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_id_requests_requester_id ON id_requests(requester_id);
CREATE INDEX IF NOT EXISTS idx_ict_devices_device_type ON ict_devices(device_type);
CREATE INDEX IF NOT EXISTS idx_ict_internet_status ON ict_internet(status);
