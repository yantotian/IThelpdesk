# Running Ciodesk Helpdesk with Docker on Fedora Server 44

This guide walks through deploying the Ciodesk IT Helpdesk (React SPA + Express API +
PostgreSQL) on **Fedora Server 44** using Docker Compose. It assumes a fresh Fedora host
with root or sudo access, SELinux in enforcing mode (default), and `firewalld` enabled.

The stack is defined by:

| File | Purpose |
|------|---------|
| `Dockerfile` | 3-stage image: SPA build → API build → nginx + Node runtime |
| `docker-compose.yml` | app + PostgreSQL (+ optional dev, Mailpit, pgAdmin profiles) |
| `docker/nginx.conf` | nginx serving the SPA and proxying `/api` to Express |
| `docker/entrypoint.sh` | waits for Postgres, applies schema, starts API + nginx |
| `.env` | runtime configuration (create from `.env.example`, never commit it) |

## 1. What runs in each container

| Service | Image | Port (internal) | Notes |
|---------|-------|-----------------|-------|
| `db` | `postgres` (pinned by digest) | 5432 | Persists data in the `postgres_data` volume |
| `app` | built from `Dockerfile` | 80 (nginx) → 5577 (API) | SPA + API in one container; published to `127.0.0.1:${APP_PORT:-8880}` by default |
| `dev` | build target `api` | 5173 / 5577 | Source-mounted hot-reload stack (development only, `--profile dev`) |
| `mailhog` / `pgadmin` | third-party | 8025/1025 / 8081 | Optional debugging tools (`--profile tools`) |

## 2. Prerequisites (Fedora Server 44)

You need:

- Docker Engine **and** the Compose plugin (`docker compose` — note the space, not the hyphen).
- A non-root `sudo` user to run the stack (do not run Compose as root where avoidable).
- Outbound internet access on first start (to pull images and build).
- `git` and basic utilities (`curl`, `openssl`) for setup.

### Install Docker Engine (official Docker repo)

Fedora Server 44 uses `dnf5`. Install Docker CE from Docker's official repository (recommended for current Engine/Compose/Buildx):

```bash
# 1. Update base system and install utilities
sudo dnf -y upgrade --refresh
sudo dnf -y install git curl openssl

# 2. Remove conflicting/legacy packages if present (safe to ignore "no match" errors)
sudo dnf -y remove docker docker-client docker-client-latest docker-common \
  docker-latest docker-latest-logrotate docker-logrotate docker-engine \
  podman-docker containerd runc || true

# 3. Add Docker's official repository (dnf5 syntax)
sudo dnf -y install dnf-plugins-core
sudo dnf config-manager addrepo --from-repofile=https://download.docker.com/linux/fedora/docker-ce.repo

# 4. Install Docker Engine + Compose plugin + Buildx
sudo dnf -y install docker-ce docker-ce-cli containerd.io \
  docker-buildx-plugin docker-compose-plugin

# 5. Enable and start Docker
sudo systemctl enable --now docker

# 6. (Optional) Run docker without sudo
sudo usermod -aG docker $USER
newgrp docker        # applies group membership in this shell
```

Verify:

```bash
docker --version
docker compose version
sudo systemctl status docker --no-pager
```

> **SELinux:** Fedora enforces SELinux by default. The production stack primarily uses named volumes. If you add bind mounts or hit permission denials on host paths, relabel the app directory: `sudo chcon -Rt svirt_sandbox_file_t /etc/srv/ciodesk` (or add `:z` to specific bind mounts).

### Open ports in the firewall (`firewalld`)

The app is published to `127.0.0.1:${APP_PORT:-8880}` by default (not public). Only open ports that you intentionally expose:

| Mode | Ports to open |
|------|---------------|
| Host-local / SSH tunnel only (default) | none |
| Reverse proxy on same host | none (proxy to `127.0.0.1:${APP_PORT}`) |
| Direct external access | `APP_PORT` (default 8880) |

```bash
# Direct external access (adjust port if changed)
# sudo firewall-cmd --permanent --add-port=8880/tcp
sudo firewall-cmd --reload
sudo firewall-cmd --list-all
```

On cloud providers (AWS, Hetzner, DigitalOcean, etc.), also open the same ports in
the instance's security group / network firewall.

## 3. Get the code onto the server

```bash
# Pick a location for the stack
sudo mkdir -p /etc/srv/ciodesk
sudo chown $USER:$USER /etc/srv/ciodesk
cd /etc/srv/ciodesk

# Clone the repository
git clone https://github.com/yantotian/IThelpdesk.git .
# (Or copy the folder over if you already have it locally.)
```

## 4. Configure `.env` (do this before the first start)

```bash
cp .env.example .env
```

Edit `.env` and set at least these values:

```text
# REQUIRED — signs JWTs and file-access tokens. Generate a strong value:
#   openssl rand -base64 48
JWT_SECRET=<long-random-string>

# Port the app is published on (change if 8880 is taken)
APP_PORT=8880

# Database (change the defaults in production)
POSTGRES_USER=helpdesk
POSTGRES_PASSWORD=<strong-db-password>
POSTGRES_DB=helpdesk

# Bootstrap admin (created on FIRST BOOT only). Production requires >= 12 chars.
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong-password-at-least-12-chars>

# (Optional) If you place this behind an external reverse proxy/TLS terminator,
# configure its site/domain there (Caddy is not included in this Compose stack).
```

### Critical rules

- **`JWT_SECRET`**: must be long and random. `docker compose` will refuse to start
  (`JWT_SECRET: ?set JWT_SECRET in .env before starting`) if it is missing.
- **`ADMIN_PASSWORD`**: the app runs with `NODE_ENV=production`, and the server
  **refuses to boot** with a weak or missing bootstrap password (< 12 characters,
  or `admin123`). You **must** set a real password before the first start.
- `.env` is listed in `.gitignore` and `.dockerignore` — **never commit real
  secrets** to Git.
- `ADMIN_PASSWORD` only seeds the admin on first boot. Changing `.env` later does
  not change the stored password. To reset it afterwards, see section 9.

## 5. Choose an exposure model

The Compose stack publishes `app` on `127.0.0.1:${APP_PORT:-8880}` by default.

### Model A — Behind an existing reverse proxy (recommended)
Use nginx/Caddy/Traefik/Cloudflare Tunnel on the host or another host to terminate
TLS and proxy to `http://127.0.0.1:${APP_PORT:-8880}`. Keep the app bound to
`127.0.0.1` and do not expose port 8880 publicly.

### Model B — Direct access (no reverse proxy)
If you need direct access to the app port, change the `app` publish binding in
`docker-compose.yml`:

```yaml
ports:
  - "0.0.0.0:${APP_PORT:-8880}:80"
```

Then open `APP_PORT` in `firewalld`/cloud firewall. For production/public use,
prefer terminating TLS in front of the app.

## 6. Build and start the stack

From `/etc/srv/ciodesk`:

```bash
docker compose up -d --build
```

- The first start takes several minutes: it builds the Vite SPA, compiles the
  TypeScript API, pulls the PostgreSQL image, and applies the database schema.
- Watch progress: `docker compose logs -f app --tail=50`
- `docker compose up -d` (without `--build`) on later starts reuses the image.

The app creates its tables, seeds categories/priorities/templates, and creates
the bootstrap admin automatically on first boot — no manual database setup is
needed.

## 7. Verify it works

```bash
# 1. Containers healthy
docker compose ps

# 2. App health endpoint (runs inside the app container through nginx)
docker compose exec -T app curl -fsS http://localhost/api/health
# -> {"status":"ok","timestamp":"..."}

# 3. Open the app in a browser
# Model A (reverse proxy): https://helpdesk.yourcompany.com (or your proxy URL)
# Model B (direct): http://<server-ip>:8880 (or http://localhost:8880 on the host)
```

Default login (change immediately after first sign-in):

| Field | Value |
|-------|-------|
| Username | `admin` |
| Password | whatever you set as `ADMIN_PASSWORD` in `.env` |

If you cannot reach the app, see the troubleshooting section (11).

## 8. Day-to-day operations

| Task | Command |
|------|---------|
| Start stack | `docker compose up -d` |
| Rebuild + restart (after code change) | `docker compose up -d --build app` |
| Stop (keeps data) | `docker compose stop` |
| Restart | `docker compose restart` |
| View app logs | `docker compose logs -f app` |
| View all logs | `docker compose logs -f` |
| Stop + remove containers (keeps volumes) | `docker compose down` |
| Stop + delete **all data** (DB + uploads) | `docker compose down -v` |
| Execute a shell in the app container | `docker compose exec app sh` |
| Execute a shell in the db container | `docker compose exec db sh` |
| Run psql directly | `docker compose exec -T db psql -U postgres -d helpdesk` |

## 9. Database access & admin password reset

Open a psql session inside the database container:

```bash
docker compose exec -T db psql -U postgres -d helpdesk
```

If you are locked out of the admin account or want to change the stored password:

```bash
# reads ADMIN_USERNAME / ADMIN_PASSWORD from .env (host side)
docker compose exec -T app sh -c "cd /app/api && node dist/db/resetAdminPassword.js"
```

Note: the reset script is compiled from `server/src/db/resetAdminPassword.ts` into
`dist/db/resetAdminPassword.js` at build time. It re-seeds the admin password from
the current `ADMIN_USERNAME`/`ADMIN_PASSWORD` environment values.

## 10. Backups and restore

Two Docker volumes hold all persistent state:

| Volume | Contents |
|--------|----------|
| `postgres_data` | PostgreSQL database |
| `uploads` | Ticket attachments, ID photos, signatures |

### Backup

```bash
cd /etc/srv/ciodesk

# Database dump
docker compose exec -T db pg_dump -U postgres helpdesk | gzip > helpdesk-$(date +%F).sql.gz

# Uploads archive
docker run --rm \
  -v ciodesk_uploads:/u:ro \
  -v "$(pwd)":/out \
  alpine tar czf /out/uploads-$(date +%F).tar.gz -C /u .
```

### Restore

```bash
cd /etc/srv/ciodesk
docker compose down

# Recreate the uploads volume and extract files
docker volume create ciodesk_uploads
docker run --rm \
  -v ciodesk_uploads:/u \
  -v "$(pwd)":/in \
  alpine sh -c "tar xzf /in/uploads-<date>.tar.gz -C /u"

# Start the stack so the schema is initialised, then load the dump
docker compose up -d
gunzip -c helpdesk-<date>.sql.gz | docker compose exec -T db psql -U postgres helpdesk
```

Because `schema.sql` is re-applied idempotently on every boot, restoring into an
empty volume works: start the stack first, then load the dump.

## 11. Keep the stack running after reboot (systemd)

Create `/etc/systemd/system/ciodesk.service`:

```ini
[Unit]
Description=Ciodesk Helpdesk (Docker Compose)
Requires=docker.service
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=/etc/srv/ciodesk
ExecStart=/usr/bin/docker compose up -d
ExecStop=/usr/bin/docker compose down
ExecReload=/usr/bin/docker compose up -d
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
```

Then:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now ciodesk.service
```

If you run Compose as your user (docker group), adjust `WorkingDirectory`,
`User=`, and use the user's `docker compose` path accordingly.

## 12. Updating the application

```bash
cd /etc/srv/ciodesk

# 1. Always back up first (section 10)
# 2. Pull the new code
git pull --ff-only

# 3. Rebuild and restart
docker compose up -d --build app

# 4. Verify
docker compose logs -f app --tail=30
docker compose exec -T app curl -fsS http://localhost/api/health
```

Schema changes are applied automatically and idempotently (`CREATE TABLE IF NOT
EXISTS`, `ADD COLUMN IF NOT EXISTS`, guarded seeds) — existing data and admin
customisations are preserved. Never run `docker compose down -v` just to apply an
update; it destroys the database.

## 13. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `app` container keeps restarting / exits quickly | Weak `ADMIN_PASSWORD` in production (< 12 chars) or missing `JWT_SECRET` | Edit `.env` (strong password ≥ 12 chars, real JWT_SECRET), then `docker compose up -d --build app` |
| `app` unhealthy on `/api/health` | Postgres not ready yet, or `DATABASE_URL` wrong | `docker compose logs -f db`; check `POSTGRES_*` values; wait for `db` to become healthy |
| Build OOM / BuildKit killed | Frontend + API builds spiking memory on small hosts | The Dockerfile already caps Node heap and sequences the stages; on very small VMs (1–2 GB) add swap |
| `npm ci` fails on `braces` (ENOENT) | `vendor/` missing from build context | Ensure `vendor/braces` is present (it is committed in the repo) |
| Can't reach the app from outside | `app` publishes only to `127.0.0.1` | Place an external reverse proxy on the host targeting `127.0.0.1:${APP_PORT}`, or bind app to `0.0.0.0` (Model B) and open the firewall port |
| `curl` not found in healthcheck | `curl` missing from runtime image | The Dockerfile installs `curl` via `apk`; rebuild with `--build` |
| Forgotten admin password | Hash stored in DB | Run the reset snippet in section 9 |

### Check container status

```bash
docker compose ps
docker compose logs -f db        # database
docker compose logs -f app       # app (API + nginx)
# (Caddy service removed; use your external reverse proxy logs if applicable)
```

## 14. Security checklist for production

- [ ] `JWT_SECRET` is a long random value (`openssl rand -base64 48`), not the example.
- [ ] `ADMIN_PASSWORD` is ≥ 12 characters and changed after first login.
- [ ] `POSTGRES_PASSWORD` differs from the example.
- [ ] `.env` is **not** committed to Git (it is gitignored).
- [ ] App is not exposed directly to the internet unless you intend it — prefer an external reverse proxy with TLS in front of `127.0.0.1:${APP_PORT}`.
- [ ] Database port 5432 is **not** published to the host (the default Compose config keeps it internal; only reachable via the Compose network). Uncomment the `db.ports` mapping only if you need direct host access.
- [ ] Keep the host and Docker updated (`sudo dnf -y upgrade --refresh`, security patches).
- [ ] Consider fail2ban or rate limiting at the reverse-proxy level for the login endpoint.
- [ ] Back up `postgres_data` and `uploads` regularly and test a restore.

## 15. Quick reference (copy-paste)

```bash
cd /etc/srv/ciodesk
cp .env.example .env
# edit .env: JWT_SECRET, ADMIN_PASSWORD (>=12 chars), POSTGRES_PASSWORD

docker compose up -d --build
docker compose logs -f app
# open http://localhost:8880 on the host (or via your reverse proxy URL)

# everyday
docker compose ps
docker compose restart
docker compose down -v            # WARNING: deletes all data
```
