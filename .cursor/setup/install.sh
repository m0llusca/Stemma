#!/usr/bin/env bash
# Idempotent repository bootstrap for the Stemma Cloud Agent environment.
# Prepares durable state: PostgreSQL, the app .env, JS dependencies, DB schema and demo seed.
# Safe to run repeatedly. The database server itself is (re)started per boot by start.sh.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
WEB_DIR="$REPO_ROOT/apps/web"

PG_VERSION=16
PG_PORT=55432
PG_USER=qc_app
PG_PASSWORD=qc_app
PG_DB=qc_app
PG_DB_VERIFY=qc_app_demo_verify

echo "==> [1/8] Ensure apt can reach Ubuntu mirrors over HTTPS"
# The Cloud Agent network blocks plain HTTP (port 80) to the Ubuntu mirrors while
# HTTPS (443) works, so rewrite the archive/security URIs to https before apt runs.
sudo sed -i \
  -e 's|http://archive.ubuntu.com|https://archive.ubuntu.com|g' \
  -e 's|http://security.ubuntu.com|https://security.ubuntu.com|g' \
  /etc/apt/sources.list /etc/apt/sources.list.d/*.sources 2>/dev/null || true

echo "==> [2/8] Install PostgreSQL ${PG_VERSION} (skipped if already present)"
if ! command -v pg_ctlcluster >/dev/null 2>&1; then
  sudo apt-get update
  sudo DEBIAN_FRONTEND=noninteractive apt-get install -y postgresql postgresql-client
fi

echo "==> [3/8] Configure cluster to listen on port ${PG_PORT}"
sudo sed -i "s/^port = .*/port = ${PG_PORT}/" "/etc/postgresql/${PG_VERSION}/main/postgresql.conf"

echo "==> [4/8] Start the cluster so migrations/seed can run"
sudo pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null \
  || sudo pg_ctlcluster "${PG_VERSION}" main restart
for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -p "${PG_PORT}" >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "==> [5/8] Ensure role and databases exist"
sudo -u postgres psql -p "${PG_PORT}" -tc "SELECT 1 FROM pg_roles WHERE rolname='${PG_USER}'" \
  | grep -q 1 \
  || sudo -u postgres psql -p "${PG_PORT}" -c "CREATE ROLE ${PG_USER} LOGIN PASSWORD '${PG_PASSWORD}'"
sudo -u postgres psql -p "${PG_PORT}" -tc "SELECT 1 FROM pg_database WHERE datname='${PG_DB}'" \
  | grep -q 1 \
  || sudo -u postgres psql -p "${PG_PORT}" -c "CREATE DATABASE ${PG_DB} OWNER ${PG_USER}"
sudo -u postgres psql -p "${PG_PORT}" -tc "SELECT 1 FROM pg_database WHERE datname='${PG_DB_VERIFY}'" \
  | grep -q 1 \
  || sudo -u postgres psql -p "${PG_PORT}" -c "CREATE DATABASE ${PG_DB_VERIFY} OWNER ${PG_USER}"

echo "==> [6/8] Create apps/web/.env from the example (first run only)"
cd "${WEB_DIR}"
if [ ! -f .env ]; then
  cp .env.example .env
  printf '\n# Local-only demo auth for development. Never enable in production.\nQC_DEMO_AUTH=enabled\n' >> .env
fi

echo "==> [7/8] Install JS dependencies"
npm ci

echo "==> [8/8] Generate Prisma client, apply migrations, seed demo data"
npm run db:deploy
npm run db:seed

echo "==> Stemma install complete."
