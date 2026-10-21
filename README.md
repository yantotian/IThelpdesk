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
- [Updating the application](#updating-the-application)
- [Restoring from a backup](#restoring-from-a-backup)
- [Migrating to another server](#migrating-to-another-server)
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

**Windows shortcut:** `scripts/dev.ps1` starts both processes in one terminal
and stops them together on Ctrl+C:

```powershell
.\scripts\dev.ps1
```

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

**Locked out?** `ADMIN_PASSWORD` is applied only when the admin account is
first created — editing `.env` afterwards does nothing, so the stored hash can
drift away from the config. To force the stored password back in sync:

```bash
# reads ADMIN_USERNAME / ADMIN_PASSWORD from server/.env
npm --prefix server run admin:reset-password
```

### Registration approval

Self-registration (the REGISTER tab on the login page) creates the account in
a **pending** state: no session is issued and sign-in returns `403` until a
System Admin approves it in **Admin → User Management** (amber *Pending*
badge → ✓ button). Active System Admins get an in-app notification for each
pending registration. Admin-created users and CSV imports are approved
automatically.

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
boot (it is idempotent, so re-running it is safe). It creates **20 tables** in
the `public` schema.

### Enums

| Type | Values |
| --- | --- |
| `ticket_status` | `new`, `assigned`, `in_progress`, `resolved`, `on_hold`, `verified`, `closed` |
| `ticket_priority` | `low`, `medium`, `high`, `critical` |

`users.role` is plain text: it holds one of the four built-in role names or the
name of a custom role from the `roles` table.

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

## Updating the application

Updates are designed to be **non-destructive**: `schema.sql` is re-applied
idempotently on every boot (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT
EXISTS`, guarded seeds with `ON CONFLICT DO NOTHING`), so pulling new code and
restarting never drops tables, rows, admin customisations, or the admin account.
Your data lives in PostgreSQL and `server/uploads/`, physically separate from
the code.

### Recommended: one command

```powershell
.\scripts\update.ps1          # dev stack (Vite + API, hot reload)
.\scripts\update.ps1 -Prod    # built single-process app on :3001
```

The script refuses to run on a dirty working tree, then in order:

1. **Backup first** — `scripts\backup.ps1` (database dump + uploads archive,
   verified with `pg_restore --list`, oldest pairs pruned to 7).
2. **Schema gate** — diffs `server/src/db/schema.sql` against the incoming
   commit and **aborts** if the new version adds `DROP TABLE`, `TRUNCATE`,
   `DELETE FROM`, `DROP COLUMN`, `DROP SCHEMA` or `DROP DATABASE`. Review the
   diff; if it is a deliberate migration, re-run with `-SkipSchemaGate`.
3. `git pull --ff-only`, `npm ci` (root + server), build both halves.
4. Restarts the stack, waits for `/api/health`, runs the smoke test and
   requires `0 failed`.

If the smoke test fails, the script prints the backup path and restore steps —
it never auto-restores, because that would discard any data created after the
update.

### Manual fallback

```powershell
.\scripts\backup.ps1           # 1. always back up first
git pull                       # 2. get the code
npm ci                         # 3. dependencies (root)
npm --prefix server ci         #    dependencies (API)
npm run build                  # 4. frontend
npm run server:build           #    API
# 5. restart: .\scripts\dev.ps1   (or npm run server:start)
node scripts/smoke-test.mjs http://localhost:3001
```

Before accepting any update that touches `server/src/db/schema.sql`, inspect it:

```bash
git diff HEAD@{1} -- server/src/db/schema.sql
```

### Backing up without Docker

```powershell
.\scripts\backup.ps1           # -> backups\helpdesk-<timestamp>.dump + uploads-<timestamp>.zip
.\scripts\backup.ps1 -Keep 14  # keep 14 pairs instead of the default 7
```

`backups\` is gitignored — the dumps contain the entire user database.

---

## Restoring from a backup

**One command** (stops the app, safety-dumps the current database first,
restores the newest backup pair, then prints the next steps):

```powershell
.\scripts\restore.ps1                                           # newest dump in backups\
.\scripts\restore.ps1 -Dump backups\helpdesk-<timestamp>.dump   # a specific one
```

To go back to the state the restore replaced, restore its safety dump:
`.\scripts\restore.ps1 -Dump backups\helpdesk-<timestamp>-prerestore.dump`.

**Manual fallback.** Stop the application first (close the dev window, or kill
the processes on ports 3001/5173).

**Database** — pick the dump to restore (list them with `Get-ChildItem backups`):

```powershell
$env:PGPASSWORD = '<password from server\.env DATABASE_URL>'
& 'C:\Program Files\PostgreSQL\16\bin\pg_restore.exe' `
    -U postgres -h localhost -d helpdesk --clean --if-exists --no-owner `
    'backups\helpdesk-<timestamp>.dump'
```

`--clean --if-exists` drops and recreates objects from the dump; `--no-owner`
avoids ownership errors when restoring as a different user.

**Uploaded files** (attachments, ID photos, signatures):

```powershell
Expand-Archive 'backups\uploads-<timestamp>.zip' -DestinationPath 'server\uploads' -Force
```

Then restart (`.\scripts\dev.ps1`) and verify:

```powershell
node scripts/smoke-test.mjs http://localhost:3001
```

**Docker restores:** the original volume-based procedure above still applies
unchanged if you go back to running with Docker.

---

## Migrating to another server

The database and `server/uploads` are the only state — the code on the new
server is just a fresh clone. The move is dump → copy → restore.

**1. Export on the old server.** Stop the API first (close the dev window, or
kill the processes on ports 3001/5173) so nothing is written between the
database dump and the file archive:

```powershell
.\scripts\backup.ps1           # -> backups\helpdesk-<timestamp>.dump + uploads-<timestamp>.zip
```

**2. Copy both files** into the new server's `backups\` folder (`scp`, USB,
whatever is convenient). Never commit them — `backups\` is gitignored because
the dump contains every user, password hash and audit row.

**3. Prepare the new server** as described in
[Running without Docker](#running-without-docker):

```bash
npm ci && npm --prefix server ci
createdb helpdesk              # Windows: createdb -U postgres helpdesk
```

Copy `server/.env` across and adjust `DATABASE_URL` (plus `JWT_SECRET` and a
production `ADMIN_PASSWORD` if the environment changes). The admin account
travels inside the dump, so no reseeding happens — existing passwords keep
working.

**4. Restore** — on Windows, `.\scripts\restore.ps1 -Dump backups\helpdesk-<timestamp>.dump`
does both steps below; or run the same two commands as
[Restoring from a backup](#restoring-from-a-backup), with their Linux
equivalents:

```powershell
# Windows
$env:PGPASSWORD = '<password from server\.env DATABASE_URL>'
& 'C:\Program Files\PostgreSQL\16\bin\pg_restore.exe' -U postgres -h localhost `
    -d helpdesk --clean --if-exists --no-owner 'backups\helpdesk-<timestamp>.dump'
Expand-Archive 'backups\uploads-<timestamp>.zip' -DestinationPath 'server\uploads' -Force
```

```bash
# Linux
PGPASSWORD='<password>' pg_restore -h localhost -U postgres -d helpdesk \
    --clean --if-exists --no-owner backups/helpdesk-<timestamp>.dump
unzip -o backups/uploads-<timestamp>.zip -d server/uploads
```

> **Windows → Linux:** a zip made by `Compress-Archive` can carry `\` entry
> separators, which `unzip` on Linux writes out as garbled file names. Use tar
> instead: `tar -czf uploads.tar.gz -C server\uploads .` on Windows, then
> `tar -xzf uploads.tar.gz -C server/uploads` on Linux.

**5. Start and verify:**

```powershell
npm run server:start           # or .\scripts\dev.ps1
node scripts/smoke-test.mjs http://localhost:3001
```

Then sign in as an existing user and open a ticket attachment — that proves
the database *and* the files arrived.

Existing sessions are invalidated (users just sign in again), and because the
schema is re-applied idempotently on every boot, the restore works into an
empty database or an already-started one. Keep the old server running until
the smoke test passes, so you can re-dump if anything is missing.

**Docker target:** use the volume-based commands under
[Data and backups](#data-and-backups) instead of `pg_restore`/`Expand-Archive`.

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

The System Admin can also define **custom roles** on the User Management page:
a role name plus a set of pages (checkboxes for Dashboard, Tickets, Kanban, and
so on). A custom role sees only its granted pages in the sidebar, and the server
returns 403 for every other page's API. Renaming a role updates every user
assigned to it; a role with users assigned cannot be deleted. Only a
`sysadmin` can create, edit or delete custom roles (`/api/roles`).

Uploaded files are never publicly reachable. Each file is served through a
signed URL that expires after one hour, and the server re-checks that the person
asking is allowed to see that specific file. ID photos and signatures are
restricted to their owner and administrators.

---

## Adding a form

Forms in this app are deliberately simple. There is no form library in use —
no `react-hook-form`, no `zod`, no `Form`/`FormField` wrapper. Every form is a
plain React component that:

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

Anyone may view the inventory; only `it_admin` and `sysadmin` may add, import,
edit or delete records (server-enforced by `requireRole` on the `POST`, `PUT`
and `DELETE` routes), and only `sysadmin` may add/remove Device Type and
Storage Type choices (`requireRole` on `POST`/`DELETE /options`).

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
