# Ciodesk Helpdesk

A self-hosted IT helpdesk: employees raise tickets, technicians resolve them, and
IT/system admins manage users, categories, SLA policy, ICT inventory and ID requests.

This project runs entirely on your own infrastructure. There is no dependency on
any hosted backend service — the API, database, authentication and file storage
are all contained in this repository.

---

## Contents

- [Architecture](#architecture)
- [Quick start with Docker](#quick-start-with-docker) — **start here**
- [Running without Docker](#running-without-docker)
- [Default login](#default-login)
- [Environment variables](#environment-variables)
- [Verifying the install](#verifying-the-install)
- [Project layout](#project-layout)
- [Database schema](#database-schema)
- [Data and backups](#data-and-backups)
- [Roles](#roles)
- [Adding a form](#adding-a-form)
- [Reference folder](#reference-folder)
- [Known limitations](#known-limitations)

---

## Architecture

| Layer | Technology | Notes |
| --- | --- | --- |
| Frontend | React 18 + Vite + TypeScript | SPA, client-side routing |
| API | Node.js + Express + TypeScript | JWT auth, role-based access control |
| Database | PostgreSQL 16 | Schema is applied automatically on boot |
| File storage | Local disk | Accessed only through short-lived signed URLs |
| Scheduled jobs | `node-cron` | SLA breach checks, auto-close of verified tickets |
| Reverse proxy | Nginx | Serves the SPA, proxies `/api` to Express |

There is exactly one API process and one database, so the scheduled jobs run in a
single place and do not duplicate.

---

## Quick start with Docker

Requirements: [Docker Desktop](https://www.docker.com/products/docker-desktop/)
(Windows/macOS) or Docker Engine + the Compose plugin (Linux).

**1. Create your config file.** In the project folder:

```bash
cp .env.example .env
```

On Windows PowerShell: `Copy-Item .env.example .env`

**2. Set a real secret.** Open `.env` and replace the placeholder `JWT_SECRET`
with a long random string. This secret signs login sessions, so a weak or known
value lets anyone impersonate an administrator.

Generate one with either:

```bash
openssl rand -base64 48
```

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

**3. Start it:**

```bash
docker compose up -d
```

The first start takes a few minutes because it builds the frontend and API
images. Watch it happen with `docker compose logs -f app`.

**4. Open the app** at **http://localhost:8880** and log in with the default
credentials below.

You do **not** need to create the database or import a schema — the app creates
its tables, seeds the reference data (categories, priorities, templates) and
creates the first administrator automatically on first boot.

### Everyday commands

| Task | Command |
| --- | --- |
| Start | `docker compose up -d` |
| Start with hot-reload dev server | `docker compose up -d dev` |
| Stop (keeps data) | `docker compose stop` |
| Restart | `docker compose restart` |
| View logs | `docker compose logs -f app` |
| Rebuild after a code change | `docker compose up -d --build` |
| Stop and delete containers | `docker compose down` |
| **Delete containers AND all data** | `docker compose down -v` |

### Development with hot reload

`docker compose up -d dev` starts the API (with `tsx watch`) and the Vite dev
server together inside one container. Open **http://localhost:5173** — edits to
`src/` and `server/src/` are picked up automatically. The API is also reachable
on `http://localhost:3001`.

### Deploying to a server

The same `docker compose` file is all you need on any Linux server with Docker
installed.

```bash
docker compose up -d
```

The app will be published on port 8880 of that server (or set `APP_PORT` in `.env`,
for example `APP_PORT=80`). Port 8880 is the default; change it if you need a
different host port. The internal container port is always 80 (nginx).

To serve it over HTTPS on a public domain, put it behind a TLS-terminating
reverse proxy (Caddy, Traefik, or an existing nginx) that forwards to
`127.0.0.1:${APP_PORT:-8880}`, or add your own certificates to
`docker/nginx.conf`.

---

## Running without Docker

You need **Node.js 20+** and a **PostgreSQL 14+** server.

**1. Create the database:**

```bash
createdb helpdesk
```

**2. Configure the API.** In the `server` folder:

```bash
cd server
cp .env.example .env
```

Set `DATABASE_URL` to your connection string, for example:

```
DATABASE_URL=postgres://postgres:yourpassword@localhost:5432/helpdesk
```

**3. Install and start the API:**

```bash
npm install
npm run dev
```

The API starts on **http://localhost:3001** and creates its own schema and seed
data on boot. No separate migration step is required.

**4. Start the frontend** in a second terminal, from the project root:

```bash
npm install
npm run dev
```

Vite serves the app on **http://localhost:5173** and proxies `/api` to port 3001.

To run the built app from a single process instead, build both and start the API,
which serves the frontend files itself:

```bash
npm run build          # from the project root — builds the SPA into dist/
cd server && npm run build
cd .. && npm run server:start
```

Then open **http://localhost:3001**.

---

## Default login

| Field | Value |
| --- | --- |
| Username | `admin` |
| Password | `admin123` |

**Change this immediately** after your first sign-in (Profile → Change password),
or set a different password before the first boot with `ADMIN_PASSWORD` in `.env`.

> In production (`NODE_ENV=production`) the server refuses to boot with a missing
> or placeholder `JWT_SECRET`, with no `DATABASE_URL`, or — when seeding the
> first admin — with a weak/missing `ADMIN_PASSWORD` (must be ≥ 12 characters).
> This is deliberate: it fails closed instead of running with known secrets.
> Development keeps the convenient defaults above.

---

## Environment variables

### For Docker (`/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | *(required)* | Signs session tokens. Set a long random value. |
| `APP_PORT` | `8880` | Port the app is published on. |
| `POSTGRES_USER` | `postgres` | Database user. |
| `POSTGRES_PASSWORD` | `postgres` | Database password. |
| `POSTGRES_DB` | `helpdesk` | Database name. |
| `ADMIN_USERNAME` | `admin` | First administrator's username (created on first boot only). |
| `ADMIN_PASSWORD` | `admin123` | First administrator's password (created on first boot only). **Production requires ≥ 12 characters.** |

### For a manual run (`/server/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | *(required)* | PostgreSQL connection string. |
| `JWT_SECRET` | *(required in production)* | Signs session tokens. |
| `PORT` | `3001` | Port the API listens on. |
| `UPLOAD_DIR` | `server/uploads` | Where uploaded files are stored. |
| `ADMIN_USERNAME` | `admin` | First administrator's username. |
| `ADMIN_PASSWORD` | `admin123` | First administrator's password. **Production requires ≥ 12 characters.** |

### Optional frontend variable

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_API_URL` | `/api` | Set only if the API lives on a different origin than the frontend. |

---

## Verifying the install

A smoke test is included. It exercises authentication, role permissions, ticket
creation, auto-assignment, SLA calculation, notifications, file upload and the
signed-URL access rules, then cleans up after itself.

With Docker running:

```bash
node scripts/smoke-test.mjs
```

To test a different address:

```bash
node scripts/smoke-test.mjs https://helpdesk.yourcompany.com
```

A healthy install reports `52 passed, 0 failed`.

Type-check both halves of the project:

```bash
npm run lint                        # frontend
cd server && npx tsc --noEmit       # API
```

---

## Project layout

```
.
├── docker/
│   ├── entrypoint.sh        # waits for the DB, applies schema, starts API + nginx
│   └── nginx.conf           # serves the SPA, proxies /api, blocks /uploads
├── scripts/
│   └── smoke-test.mjs       # end-to-end verification (52 checks)
├── server/                  # Express API
│   └── src/
│       ├── db/
│       │   ├── schema.sql   # full database schema + reference data
│       │   ├── migrate.ts   # applies the schema (idempotent, runs on boot)
│       │   └── init.ts      # one-off manual initialisation
│       ├── lib/files.ts     # signed-URL tokens (HMAC, 1 hour expiry)
│       ├── routes/          # one module per resource
│       ├── jobs.ts          # SLA breach check, auto-close, auto-assign
│       └── index.ts         # entry point
├── src/                     # React frontend
│   ├── components/          # shared UI
│   ├── contexts/            # auth, theme
│   ├── hooks/
│   ├── lib/                 # api-client (fetch wrapper) and api (data functions)
│   ├── pages/               # screens
│   └── types/               # shared TypeScript types
├── reference/               # scratch space for form/mockup references (not shipped)
├── Dockerfile               # 3-stage build: SPA -> API -> runtime
└── docker-compose.yml       # app + postgres (+ dev, mailhog, pgadmin)
```

---

## Database schema

The schema lives in `server/src/db/schema.sql` and is applied automatically on
boot (it is idempotent, so re-running it is safe). It creates **16 tables** in
the `public` schema.

### Enums

| Type | Values |
| --- | --- |
| `user_role` | `requester`, `technician`, `it_admin`, `sysadmin` |
| `ticket_status` | `new`, `assigned`, `in_progress`, `resolved`, `on_hold`, `verified`, `closed` |
| `ticket_priority` | `low`, `medium`, `high`, `critical` |

### Tables

All primary keys are `uuid` (default `gen_random_uuid()`).

| Table | Purpose | Key columns |
| --- | --- | --- |
| `users` | Accounts (replaces auth + profiles) | `username`, `email`, `password_hash`, `full_name`, `role`, `office`, `contact`, `is_active` |
| `categories` | Ticket categories with optional nesting | `name`, `parent_id` → `categories`, `is_active`, `sort_order` |
| `priority_config` | SLA hours per priority | `priority` (unique), `label`, `sla_hours`, `color` |
| `tickets` | Helpdesk tickets | `ticket_number` (unique), `requester_id` → `users`, `assigned_to` → `users`, `category_id`, `priority`, `subject`, `description`, `status`, `resolution`, `sla_due_at`, `sla_breached`, `auto_close_at` |
| `ticket_activities` | Timeline / comments | `ticket_id` → `tickets` (cascade), `actor_id` → `users`, `activity_type`, `content`, `old_value`, `new_value` |
| `ticket_attachments` | Uploaded files | `ticket_id` → `tickets` (cascade), `uploader_id` → `users`, `file_name`, `file_path`, `file_size`, `mime_type` |
| `ticket_templates` | Prefilled ticket forms | `name`, `description`, `category_id`, `subcategory_id`, `priority`, `subject`, `body`, `is_active`, `created_by` |
| `notifications` | In-app notifications | `user_id` → `users` (cascade), `ticket_id` → `tickets`, `type`, `title`, `body`, `is_read` |
| `system_config` | Runtime settings | `key` (text PK), `value`, `description` |
| `audit_log` | Admin action history | `actor_id` → `users`, `table_name`, `record_id`, `action`, `old_data` (jsonb), `new_data` (jsonb), `ip_address` |
| `ict_devices` | ICT inventory (laptops, desktops, printers, routers) | `device_type`, `brand`, `model`, `serial_no`, `asset_tag`, `location`, `office`, `assigned_to`, `status`, `cpu`, `gpu`, `ram_gb`, `storage_gb`, `storage_type`, `os`, `purchase_date`, `warranty_until` |
| `ict_internet` | Internet/ISP subscriptions | `location`, `isp_name`, `plan_name`, `plan_type`, `subscribed_speed_mbps`, `actual_dl_mbps`, `actual_ul_mbps`, `monthly_cost`, `contract_start`, `contract_end`, `router_id` → `ict_devices`, `status` |
| `speed_test_logs` | Bandwidth test history | `internet_id` → `ict_internet` (cascade), `tested_at`, `dl_mbps`, `ul_mbps`, `latency_ms`, `tested_by` |
| `device_ticket_links` | Links devices to tickets | `device_id` → `ict_devices`, `ticket_id` → `tickets`, `linked_by`, `note`, `UNIQUE(device_id, ticket_id)` |
| `ict_inventory_options` | Admin-editable Device Type / Storage Type choices | `option_type` (`device_type` \| `storage_type`), `value`, `UNIQUE(option_type, value)` — seeded once on an empty table, so added/deleted choices persist across restarts |
| `id_requests` | Employee ID card requests | `requester_id` → `users`, `office_name`, `full_name`, `id_number`, `position`, `address`, `emergency_name`, `emergency_contact`, `photo_url`, `signature_url`, `status`, `is_paid` |

`ict_inventory_submissions` is **retired**: the Submit Inventory page and its
API are gone, and every role now writes straight to `ict_devices`/`ict_internet`.
The table is still declared in `schema.sql` so historical rows are not dropped.

### Triggers & functions

| Object | Effect |
| --- | --- |
| `generate_ticket_number()` | Assigns `TKT-<year>-00001` style numbers on ticket insert |
| `set_sla_due()` | Sets `sla_due_at` from `priority_config.sla_hours` on insert |
| `set_auto_close()` | Sets `auto_close_at` (+48h) when a ticket becomes `verified` |
| `on_ticket_activity_notify()` | Creates notifications on assignment, status change and comment |
| `update_updated_at()` | Maintains `updated_at` on tickets, users, ict_devices, ict_internet and ticket_templates |

Reference data (categories, priorities, templates, system config) is seeded on
boot; the seed statements are written so that admin customisations are not
overwritten. To inspect the schema directly:

```bash
docker compose exec -T db psql -U postgres -d helpdesk -c "\dt"
docker compose exec -T db psql -U postgres -d helpdesk -c "\d+ tickets"
```

---

## Data and backups

Two Docker volumes hold all persistent state:

| Volume | Contents |
| --- | --- |
| `postgres_data` | The database. |
| `uploads` | Ticket attachments, ID photos, signatures. |

**Backing up** — dump the database and the uploads directory together:

```bash
docker compose exec -T db pg_dump -U postgres helpdesk | gzip > backup.sql.gz
docker run --rm -v ciodesk_uploads:/u -v "$PWD":/out alpine tar czf /out/uploads.tar.gz -C /u .
```

**Restoring** — put the files back and load the dump:

```bash
docker compose down
docker volume create ciodesk_uploads
docker run --rm -v ciodesk_uploads:/u -v "$PWD":/in alpine sh -c "cd /in && tar xzf uploads.tar.gz -C /u"
docker compose up -d
gunzip -c backup.sql.gz | docker compose exec -T db psql -U postgres helpdesk
```

Because the schema is applied on every boot, restoring into an empty volume also
works: start the stack first, then load the dump.

---

## Roles

Permissions are enforced on the server, not just hidden in the interface.

| Role | Can do |
| --- | --- |
| `requester` | Raise tickets, comment on their own, view their own ID requests, and request venue bookings for a single day or a multi-day period. |
| `technician` | Everything a requester can, plus view assigned tickets, change status, add comments and attachments, and request venue bookings. |
| `it_admin` | Everything above, plus manage users (except roles), categories, priorities, templates, SLA policy, ICT inventory and ID request approval, approve venue bookings and manage venues. |
| `sysadmin` | Full access, including assigning roles and reading the audit log, and managing venues and bookings. |

Only a `sysadmin` can grant or change the `sysadmin` role.

Uploaded files are never publicly reachable. Each file is served through a
signed URL that expires after one hour, and the server re-checks that the person
asking is allowed to see that specific file. ID photos and signatures are
restricted to their owner and administrators.

---

## Adding a form

Forms in this app are deliberately simple. There is no form library in use:
`react-hook-form` and `zod` are installed but not referenced anywhere, and there
is no `Form`/`FormField` wrapper. Every form is a plain React component that:

- keeps its fields in a single `useState` object with a `set(key, value)` helper,
- renders controlled inputs from `src/components/ui/` (`Input`, `Select`,
  `Textarea`, `Label`, `Button`),
- validates inline and reports problems with `toast.error(...)` (sonner), and
- calls a hand-written function in `src/lib/api.ts` that wraps `api.post(...)`.

`src/pages/CreateTicketPage.tsx` is the reference implementation to copy.

### The ICT Inventory feature

The best end-to-end example of a table shared by several layers of the app is
the ICT Inventory module (the old Submit Inventory page was folded into it).
Replicate its layout when adding a feature:

| Layer | File |
| --- | --- |
| Tables | `server/src/db/schema.sql` (`ict_devices`, `ict_internet`, `ict_inventory_options`) |
| API routes | `server/src/routes/ict.ts` (devices, internet, CSV import, options) |
| Route mounting | `server/src/index.ts` (`app.use('/api/ict', ...)`) |
| Frontend API | `src/lib/api.ts` (`getICTDevices`, `importICTDevices`, `createICTOption`, ...) |
| CSV helpers | `src/lib/csv.ts` (`buildCsv`/`parseCsv` — export and import share the same columns) |
| Types | `src/types/types.ts` (`ICTDevice`, `ICTInternet`, `ICTInventoryOption`) |
| Page | `src/pages/admin/ICTInventoryPage.tsx` (tabs, form, CSV import/export, Manage Choices) |
| Routing | `src/routes.tsx` |
| Navigation | `src/components/layouts/MainLayout.tsx` (`NAV_GROUPS`, visible to all four roles) |

Anyone may add or import records; only `it_admin` and `sysadmin` may edit or
delete them, and only `sysadmin` may add/remove Device Type and Storage Type
choices (server-enforced by `requireRole` on `POST`/`DELETE /options`).

### Step by step

1. **Database.** Add `CREATE TABLE IF NOT EXISTS your_table (...)` to
   `server/src/db/schema.sql`. The schema is applied on every boot by
   `runMigrations()` (`server/src/db/migrate.ts`), so it must remain idempotent.
   Use `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` when adding columns to a table
   that already exists, `CREATE INDEX IF NOT EXISTS` for indexes, and the
   `DROP TRIGGER IF EXISTS` + `CREATE TRIGGER` pattern for triggers.
2. **Types.** Add an interface to `src/types/types.ts`, mirroring the table.
   Mark columns populated by joins (e.g. submitter name) as optional.
3. **Server route.** Create `server/src/routes/yourFeature.ts`. Start it with
   `router.use(apiLimiter, authMiddleware)`, guard privileged routes with
   `requireRole(...)`, validate the body and return `400` on bad input, and
   insert using a parameterised tagged template:
   ```ts
   const rows = await sql`
     INSERT INTO your_table (field_a, submitted_by)
     VALUES (${body.field_a}, ${req.user!.id})
     RETURNING *
   `;
   res.status(201).json(rows[0]);
   ```
   Register it in `server/src/index.ts` with
   `app.use('/api/your-feature', yourFeatureRoutes)`. Note that ESM imports use
   the `.js` extension.
4. **Frontend API.** Add `get...`/`create...` functions to `src/lib/api.ts` that
   call `api.get`/`api.post`.
5. **Page.** Create `src/pages/YourFormPage.tsx` following
   `CreateTicketPage.tsx`: wrap it in `MainLayout`, hold fields in one
   `useState` object, validate on submit, show `toast.success` on success and
   `toast.error(e.message)` on failure.
6. **Route + navigation.** Import the page and add a `RouteConfig` entry in
   `src/routes.tsx`, then add a `NAV_GROUPS` item in
   `src/components/layouts/MainLayout.tsx` with the `roles` allowed to see it.
7. **(Optional) Admin review.** For an approval workflow, add an admin page
   under `src/pages/admin/` modelled on `ICTInventoryPage.tsx` (list + form +
   guarded mutations).

File uploads (photos, signatures) go through a separate multipart endpoint:
`src/lib/api.ts` `submitIDRequest` shows the flow (`api.upload('/upload/<bucket>', formData)`
returns a path that is then sent with the JSON payload), and the server side is
`server/src/routes/upload.ts` (multer, mime allow-list, 10 MB limit).

---

## Reference folder

The `reference/` folder at the project root is a scratch space for design inputs
— example forms, mockups, or documents you want to model a new form on. Nothing
in it is imported by the application, built into the image, or required at
runtime, so you can add or delete files freely without affecting the app.

**To add a reference**, drop the file(s) into `reference/`:

```bash
# from the project root
reference/
```

You can place any common format there (`.pdf`, `.png`, `.jpg`, `.html`, `.txt`,
`.docx`, `.xlsx`, `.csv`, ...). To move a file in from elsewhere:

```bash
# example: copy a downloaded mockup into the folder
cp ~/Downloads/new-form.png reference/
```

On Windows PowerShell:

```powershell
Copy-Item "$HOME\Downloads\new-form.png" reference\
```

To list what is currently in the folder:

```bash
ls reference            # macOS/Linux
```

```powershell
Get-ChildItem reference  # Windows PowerShell
```

The folder is not imported by the app, so it is safe to keep design scratch
files here during development. It is not excluded from the Docker build context
yet, so if you add large files and want to keep the build lean, add
`reference` to `.dockerignore`. If you want to version reference files with Git,
commit the folder; otherwise treat it as local-only working space.

---

## Known limitations

Worth knowing before you rely on this in production:

- **No email is sent.** SLA breaches and ticket activity generate in-app
  notifications only. The `sla_alert_email` setting in System Config is retained
  for future use but nothing reads it yet. To add email, wire an SMTP or
  transactional-email provider into `server/src/jobs.ts`.
- **Password reset is administrator-assisted.** Users cannot self-serve a reset
  by email; an admin resets it from the Users page.
- **Single API instance.** Scheduled jobs run in-process, so run exactly one
  copy of the `app` service. To scale out, move the cron jobs to a single
  dedicated worker.
- **No HTTPS by default.** The included nginx listens on plain HTTP. Put it
  behind a TLS terminator before exposing it to the internet.
- **Single sign-on is not implemented.** Authentication is local
  username/password with bcrypt-hashed passwords.
