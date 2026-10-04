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
- [Data and backups](#data-and-backups)
- [Roles](#roles)
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

**4. Open the app** at **http://localhost:8080** and log in with the default
credentials below.

You do **not** need to create the database or import a schema — the app creates
its tables, seeds the reference data (categories, priorities, templates) and
creates the first administrator automatically on first boot.

### Everyday commands

| Task | Command |
| --- | --- |
| Start | `docker compose up -d` |
| Stop (keeps data) | `docker compose stop` |
| Restart | `docker compose restart` |
| View logs | `docker compose logs -f app` |
| Rebuild after a code change | `docker compose up -d --build` |
| Stop and delete containers | `docker compose down` |
| **Delete containers AND all data** | `docker compose down -v` |

### Deploying to a server

The same `docker compose` file is all you need on any Linux server with Docker
installed.

```bash
git clone <your-repo-url> ciodesk && cd ciodesk
cp .env.example .env      # then set JWT_SECRET
docker compose up -d
```

The app will be published on port 8080 of that server. To change the port, set
`APP_PORT` in `.env` (for example `APP_PORT=80`).

To serve it over HTTPS on a public domain, put it behind a TLS-terminating
reverse proxy (Caddy, Traefik, or an existing nginx) that forwards to
`127.0.0.1:8080`, or add your own certificates to `docker/nginx.conf`.

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

---

## Environment variables

### For Docker (`/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `JWT_SECRET` | *(required)* | Signs session tokens. Set a long random value. |
| `APP_PORT` | `8080` | Port the app is published on. |
| `POSTGRES_USER` | `postgres` | Database user. |
| `POSTGRES_PASSWORD` | `postgres` | Database password. |
| `POSTGRES_DB` | `helpdesk` | Database name. |
| `ADMIN_USERNAME` | `admin` | First administrator's username (created on first boot only). |
| `ADMIN_PASSWORD` | `admin123` | First administrator's password (created on first boot only). |

### For a manual run (`/server/.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | *(required)* | PostgreSQL connection string. |
| `JWT_SECRET` | *(required in production)* | Signs session tokens. |
| `PORT` | `3001` | Port the API listens on. |
| `UPLOAD_DIR` | `server/uploads` | Where uploaded files are stored. |
| `ADMIN_USERNAME` | `admin` | First administrator's username. |
| `ADMIN_PASSWORD` | `admin123` | First administrator's password. |

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
├── Dockerfile               # 3-stage build: SPA -> API -> runtime
└── docker-compose.yml       # app + postgres
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
| `requester` | Raise tickets, comment on their own, view their own ID requests. |
| `technician` | Everything a requester can, plus view assigned tickets, change status, add comments and attachments. |
| `it_admin` | Everything above, plus manage users (except roles), categories, priorities, templates, SLA policy, ICT inventory and ID request approval. |
| `sysadmin` | Full access, including assigning roles and reading the audit log. |

Only a `sysadmin` can grant or change the `sysadmin` role.

Uploaded files are never publicly reachable. Each file is served through a
signed URL that expires after one hour, and the server re-checks that the person
asking is allowed to see that specific file. ID photos and signatures are
restricted to their owner and administrators.

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
