#!/usr/bin/env bash
# Per-boot reconciliation for the Stemma Cloud Agent environment.
# Starts the PostgreSQL cluster (if not already running) and waits for readiness.
# Idempotent and tolerant of restarts. The web dev server runs from the terminals entry.
set -euo pipefail

PG_VERSION=16
PG_PORT=55432

if ! sudo -u postgres pg_isready -p "${PG_PORT}" >/dev/null 2>&1; then
  echo "Starting PostgreSQL ${PG_VERSION} cluster on port ${PG_PORT}..."
  sudo pg_ctlcluster "${PG_VERSION}" main start
fi

for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -p "${PG_PORT}" >/dev/null 2>&1; then
    echo "PostgreSQL is ready on port ${PG_PORT}."
    exit 0
  fi
  sleep 1
done

echo "PostgreSQL did not become ready on port ${PG_PORT}." >&2
exit 1
