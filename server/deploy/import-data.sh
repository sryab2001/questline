#!/usr/bin/env bash
# Replaces the server's data with a pb_data archive made on another machine.
#
#   sudo ./import-data.sh pb_data.tar.gz
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

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
tar -xzf "$ARCHIVE" -C "$TMP"
if [[ ! -f "$TMP/pb_data/data.db" ]]; then
  echo "The archive must contain a pb_data/ folder with data.db inside." >&2
  exit 1
fi

systemctl stop "$SERVICE"
if [[ -d "$APP_DIR/pb_data" ]]; then
  mv "$APP_DIR/pb_data" "$APP_DIR/pb_data.backup-$(date +%Y%m%d-%H%M%S)"
fi
mv "$TMP/pb_data" "$APP_DIR/pb_data"
chown -R "$SERVICE:$SERVICE" "$APP_DIR/pb_data"
systemctl start "$SERVICE"

echo "==> Data imported and server restarted. Your existing accounts and logins work unchanged."
