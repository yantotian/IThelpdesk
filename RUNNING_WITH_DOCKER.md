# Running Ciodesk Helpdesk with Docker on a Linux Server

This guide walks through deploying the Ciodesk IT Helpdesk (React SPA + Express API +
PostgreSQL) on a Linux server using Docker Compose. It assumes a fresh Linux host
(Ubuntu/Debian/RHEL or similar) with root or sudo access.

The stack is defined by:

| File | Purpose |
|------|---------|
| `Dockerfile` | 3-stage image: SPA build → API build → nginx + Node runtime |
| `docker-compose.yml` | app + PostgreSQL (+ optional Caddy TLS proxy, dev, Mailpit, pgAdmin) |
| `docker/nginx.conf` | nginx serving the SPA and proxying `/api` to Express |
| `docker/entrypoint.sh` | waits for Postgres, applies schema, starts API + nginx |
| `.env` | runtime configuration (create from `.env.example`, never commit it) |

## 1. What runs in each container

| Service | Image | Port (internal) | Notes |
|---------|-------|-----------------|-------|
| `db` | `postgres` (pinned by digest) | 5432 | Persists data in the `postgres_data` volume |
| `app` | built from `Dockerfile` | 80 (nginx) → 5577 (API) | SPA + API in one container; publishes to `127.0.0.1` by default |
| `caddy` | `caddy:2-alpine` | 80 / 443 | Optional public TLS reverse proxy in front of `app` |
| `dev` | build target `api` | 5173 / 5577 | Source-mounted hot-reload stack (development only) |
| `mailhog` / `pgadmin` | third-party | 8025/1025 / 8081 | Optional debugging tools |

## 2. Prerequisites on the Linux server

You need:

- Docker Engine **and** the Compose plugin (`docker compose` — note the space, not the hyphen).
- A non-root `sudo` user to run the stack (do not run Compose as root where avoidable).
- Outbound internet access on first start (to pull images and build).

### Install Docker (Ubuntu/Debian example)

```bash
# 1. Install prerequisites
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg

# 2. Add Docker's official GPG key and repository
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/ubuntu \
  $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# 3. Install Docker Engine + Compose plugin
sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io \
                        docker-buildx-plugin docker-compose-plugin

# 4. Let your user run docker without sudo (optional but convenient)
sudo usermod -aG docker $USER
newgrp docker        # applies group membership in this shell
```

For RHEL/Alma/Rocky, substitute `dnf install docker-ce ...` and enable the Docker CE repo.  
Verify: `docker --version` and `docker compose version`.

### Open ports in the firewall

Choose your exposure model first (section 5), then open exactly what you need:

| Mode | Ports to open |
|------|---------------|
| Caddy public TLS (recommended) | 80 (HTTP→HTTPS redirect) and 443 (HTTPS) |
| Direct / existing reverse proxy | only the `APP_PORT` (default 8880), bound to `127.0.0.1` |

Ubuntu (`ufw`):

```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
# or, for direct exposure:
# sudo ufw allow 8880/tcp
sudo ufw enable
```

On cloud providers (AWS, Hetzner, DigitalOcean, etc.), also open the same ports in
the instance's security group / network firewall.

## 3. Get the code onto the server

```bash
# Pick a location for the stack
sudo mkdir -p /opt/ciodesk
sudo chown $USER:$USER /opt/ciodesk
cd /opt/ciodesk

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

# Public domain served by Caddy with Let's Encrypt, or "localhost" for internal TLS
SITE_ADDRESS=helpdesk.yourcompany.com
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

### Model A — Caddy handles public HTTPS (default compose)
`docker-compose.yml` already includes a `caddy` service. It listens on public
ports 80 and 443, terminates TLS (Let's Encrypt for a real domain, internal
self-signed TLS for `localhost`), and reverse-proxies to `app:80` over the
private Compose network. `app` itself is published only to `127.0.0.1`, so it is
not directly reachable from the internet.

Use this when you have a domain whose DNS points at this server.

### Model B — App exposed directly / behind your own reverse proxy
If you already have a reverse proxy (nginx, Caddy, Traefik, Cloudflare Tunnel)
or want to expose the app directly:

1. Remove (or comment out) the `caddy` service from `docker-compose.yml`, or
   simply `docker compose up -d app db` without caddy.
2. Change the `app` publish binding from `127.0.0.1` to `0.0.0.0` so the proxy
   can reach it, e.g. in `docker-compose.yml`:

   ```yaml
   ports:
     - "0.0.0.0:${APP_PORT:-8880}:80"
   ```

3. Point your external proxy at `http://127.0.0.1:${APP_PORT}` (localhost) or the
   container's published port, and terminate TLS there.

## 6. Build and start the stack

From `/opt/ciodesk`:

```bash
docker compose up -d --build
```

- The first start takes several minutes: it builds the Vite SPA, compiles the
  TypeScript API, pulls PostgreSQL/Caddy images, and applies the database schema.
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
# Model A (Caddy): https://helpdesk.yourcompany.com   (or http:// for internal TLS)
# Model B (direct): http://<server-ip>:8880
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
cd /opt/ciodesk

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
cd /opt/ciodesk
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
WorkingDirectory=/opt/ciodesk
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
cd /opt/ciodesk

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
| Can't reach the app from outside | `app` publishes only to `127.0.0.1` | Use Caddy (Model A), or bind to `0.0.0.0` (Model B) and open the firewall port |
| `curl` not found in healthcheck | `curl` missing from runtime image | The Dockerfile installs `curl` via `apk`; rebuild with `--build` |
| Forgotten admin password | Hash stored in DB | Run the reset snippet in section 9 |

### Check container status

```bash
docker compose ps
docker compose logs -f db        # database
docker compose logs -f app       # app (API + nginx)
docker compose logs -f caddy     # TLS proxy (if used)
```

## 14. Security checklist for production

- [ ] `JWT_SECRET` is a long random value (`openssl rand -base64 48`), not the example.
- [ ] `ADMIN_PASSWORD` is ≥ 12 characters and changed after first login.
- [ ] `POSTGRES_PASSWORD` differs from the example.
- [ ] `.env` is **not** committed to Git (it is gitignored).
- [ ] App is not exposed directly to the internet unless you intend it — prefer Caddy or an existing reverse proxy with TLS.
- [ ] Database port 5432 is **not** published to the host (it is not in `ports:` — only reachable via the Compose network).
- [ ] Keep the host and Docker updated (`apt-get upgrade`, security patches).
- [ ] Consider fail2ban or rate limiting at the reverse-proxy level for the login endpoint.
- [ ] Back up `postgres_data` and `uploads` regularly and test a restore.

## 15. Quick reference (copy-paste)

```bash
cd /opt/ciodesk
cp .env.example .env
# edit .env: JWT_SECRET, ADMIN_PASSWORD (>=12 chars), POSTGRES_PASSWORD, SITE_ADDRESS

docker compose up -d --build
docker compose logs -f app
# open https://helpdesk.yourcompany.com  (or http://localhost:8880 locally)

# everyday
docker compose ps
docker compose restart
docker compose down -v            # WARNING: deletes all data
```
