#!/usr/bin/env bash
#
# One-shot installer for Ciodesk on a Fedora 44 (or newer) server.
# Run as root from a checkout of this repository:
#
#   sudo bash scripts/install-fedora.sh
#
# It installs Node 22 + PostgreSQL, creates the database and account, builds
# the application, installs the systemd unit ciodeks.service and starts it.
#
set -euo pipefail

APP_USER="cioadmin"
APP_HOME="/home/${APP_USER}/IThelpdesk"
PG_DATA="/var/lib/pgsql/data"

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this installer as root (sudo)." >&2
  exit 1
fi

# Source tree this script lives in
SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")"/.. && pwd)"

echo "==> Installing Fedora packages"
dnf install -y \
  git nodejs22 nodejs22-npm nodejs22-bin \
  postgresql postgresql-server

echo "==> Preparing PostgreSQL"
if [[ ! -s "${PG_DATA}/PG_VERSION" ]]; then
  postgresql-setup --initdb
fi
chown -R postgres:postgres "${PG_DATA}"
systemctl enable --now postgresql.service

DB_PASSWORD="$(openssl rand -hex 24)"
runuser -u postgres -- sh -c "psql -c \"ALTER USER postgres PASSWORD '${DB_PASSWORD}';\" >/dev/null 2>&1 || true"
if ! runuser -u postgres -- psql -tAc "SELECT 1 FROM pg_database WHERE datname='helpdesk'" | grep -q 1; then
  runuser -u postgres -- createdb -O postgres helpdesk
fi

echo "==> Creating application user"
if ! id -u "${APP_USER}" >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash "${APP_USER}"
fi

echo "==> Copying application to ${APP_HOME}"
mkdir -p "${APP_HOME}"
# Copy everything except runtime/dependency directories so installs are clean.
rsync -a --delete \
  --exclude '.env' \
  --exclude 'node_modules/' \
  --exclude 'dist/' \
  --exclude 'server/dist/' \
  "${SCRIPT_DIR}/" "${APP_HOME}/" 2>/dev/null || \
  cp -a "${SCRIPT_DIR}/." "${APP_HOME}/"
chown -R "${APP_USER}:${APP_USER}" "${APP_HOME}"

echo "==> Installing Node dependencies"
runuser -u "${APP_USER}" -- bash -c "cd '${APP_HOME}' && npm ci --no-audit --no-fund"

echo "==> Building frontend and API"
runuser -u "${APP_USER}" -- bash -c "cd '${APP_HOME}' && npm run build && npm run server:build"

echo "==> Writing server/.env (if missing)"
ENV_FILE="${APP_HOME}/server/.env"
if [[ ! -f "${ENV_FILE}" ]]; then
  JWT_SECRET="$(openssl rand -base64 48)"
  cat > "${ENV_FILE}" <<EOF
DATABASE_URL=postgres://postgres:${DB_PASSWORD}@localhost:5432/helpdesk
JWT_SECRET=${JWT_SECRET}
PORT=5577
UPLOAD_DIR=${APP_HOME}/server/uploads
NODE_ENV=production
ADMIN_USERNAME=admin
ADMIN_PASSWORD=ChangeMeToARealAdminPassword!123
EOF
  chown "${APP_USER}:${APP_USER}" "${ENV_FILE}"
  chmod 600 "${ENV_FILE}"
  echo "    Created ${ENV_FILE} — CHANGE ADMIN_PASSWORD (>= 12 chars) before first boot."
fi

echo "==> Installing systemd unit"
cp "${SCRIPT_DIR}/ciodesk-fedora.service" /etc/systemd/system/ciodeks-fedora.service
systemctl daemon-reload
systemctl enable --now postgresql.service
systemctl enable --now ciodeks-fedora.service

echo "==> Ciodesk is starting. Check status with:"
echo "    systemctl status ciodeks-fedora.service"
echo "    journalctl -u ciodeks-fedora.service -f"
echo "==> Once healthy, open http://<server>:5577 and log in as admin."
