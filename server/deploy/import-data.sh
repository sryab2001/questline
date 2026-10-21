#!/usr/bin/env bash
# Replaces the server's data with a pb_data archive made on another machine.
# Works with either install: the Docker container (docker/setup.sh) or the
# systemd service (install.sh).
#
#   sudo bash ./import-data.sh pb_data.tar.gz
#
# The current data (if any) is kept as a timestamped backup next to it.
set -euo pipefail

APP_DIR="/opt/questline"
SERVICE="questline"
ARCHIVE="${1:-}"

if [[ -z "$ARCHIVE" || ! -f "$ARCHIVE" ]]; then
  echo "usage: sudo bash $0 pb_data.tar.gz" >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

if command -v docker >/dev/null 2>&1 && docker inspect "$SERVICE" >/dev/null 2>&1; then
  MODE="docker"
  OWNER="10001:10001"
elif command -v systemctl >/dev/null 2>&1 && systemctl cat "$SERVICE" >/dev/null 2>&1; then
  MODE="systemd"
  OWNER="$SERVICE:$SERVICE"
else
  echo "No Questline install found. Run docker/setup.sh or install.sh first." >&2
  exit 1
fi

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$ARCHIVE" -C "$TMP"
if [[ ! -f "$TMP/pb_data/data.db" ]]; then
  echo "The archive must contain a pb_data/ folder with data.db inside." >&2
  exit 1
fi

echo "==> Stopping Questline ($MODE)"
if [[ "$MODE" == "docker" ]]; then docker stop "$SERVICE" >/dev/null; else systemctl stop "$SERVICE"; fi

mkdir -p "$APP_DIR"
if [[ -d "$APP_DIR/pb_data" ]]; then
  BACKUP="$APP_DIR/pb_data.backup-$(date +%Y%m%d-%H%M%S)"
  mv "$APP_DIR/pb_data" "$BACKUP"
  echo "==> Previous data kept at $BACKUP"
fi
mv "$TMP/pb_data" "$APP_DIR/pb_data"
chown -R "$OWNER" "$APP_DIR/pb_data"

if [[ "$MODE" == "docker" ]]; then docker start "$SERVICE" >/dev/null; else systemctl start "$SERVICE"; fi

echo "==> Data imported and Questline restarted. Your existing accounts and logins work unchanged."
