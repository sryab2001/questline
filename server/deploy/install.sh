#!/usr/bin/env bash
# Installs or upgrades the Questline sync server (PocketBase) on Ubuntu/Debian.
#
#   sudo bash ./install.sh questline.example.com
#
# - Downloads PocketBase for this CPU (arm64/amd64) and verifies its checksum
# - Runs it as an unprivileged "questline" user under systemd, memory-capped
# - PocketBase gets and renews its own Let's Encrypt certificate for the domain
# - Opens ports 80/443 in the host firewall (Oracle images block them by default)
# Re-running upgrades the binary and migrations and keeps all data.
set -euo pipefail

PB_VERSION="0.40.5"
APP_DIR="/opt/questline"
SERVICE="questline"
HERE="$(cd "$(dirname "$0")" && pwd)"

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "usage: sudo bash $0 your.domain.com" >&2
  exit 1
fi
if [[ $EUID -ne 0 ]]; then
  echo "Run with sudo." >&2
  exit 1
fi

case "$(uname -m)" in
  aarch64 | arm64) ARCH="arm64" ;;
  x86_64 | amd64) ARCH="amd64" ;;
  *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac

echo "==> Installing PocketBase $PB_VERSION ($ARCH) for $DOMAIN"

need() { command -v "$1" >/dev/null 2>&1; }
if ! need curl || ! need unzip; then
  apt-get update -qq
  apt-get install -y -qq curl unzip
fi

# --- user and folders ---
if ! id "$SERVICE" >/dev/null 2>&1; then
  useradd --system --home-dir "$APP_DIR" --shell /usr/sbin/nologin "$SERVICE"
fi
mkdir -p "$APP_DIR/pb_data" "$APP_DIR/pb_migrations"

# --- binary (checksum-verified) ---
ZIP="pocketbase_${PB_VERSION}_linux_${ARCH}.zip"
BASE="https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/$ZIP" "$BASE/$ZIP"
curl -fsSL -o "$TMP/checksums.txt" "$BASE/checksums.txt"
(cd "$TMP" && grep " $ZIP\$" checksums.txt | sha256sum -c --quiet -)
unzip -o -q "$TMP/$ZIP" pocketbase -d "$TMP"
install -m 0755 "$TMP/pocketbase" "$APP_DIR/pocketbase"

# --- schema ---
rm -f "$APP_DIR"/pb_migrations/*.js
cp "$HERE"/pb_migrations/*.js "$APP_DIR/pb_migrations/"
chown -R "$SERVICE:$SERVICE" "$APP_DIR"

# --- systemd service ---
cat >"/etc/systemd/system/$SERVICE.service" <<EOF
[Unit]
Description=Questline sync server (PocketBase)
After=network-online.target
Wants=network-online.target

[Service]
User=$SERVICE
Group=$SERVICE
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/pocketbase serve $DOMAIN --dir $APP_DIR/pb_data --migrationsDir $APP_DIR/pb_migrations --hooksPool 2
Restart=on-failure
RestartSec=5

# Bind 80/443 without running as root.
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true

# Keep it small: Go GC aims under 96 MiB, hard cap 160 MiB.
Environment=GOMEMLIMIT=96MiB
MemoryHigh=128M
MemoryMax=160M
LimitNOFILE=4096

# Sandboxing
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=$APP_DIR/pb_data

[Install]
WantedBy=multi-user.target
EOF

# --- host firewall ---
if need ufw && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null
  ufw allow 443/tcp >/dev/null
  echo "==> ufw: allowed 80 and 443"
elif need iptables; then
  for port in 80 443; do
    if ! iptables -C INPUT -p tcp --dport "$port" -m state --state NEW -j ACCEPT 2>/dev/null; then
      # Insert before Oracle's default REJECT rule.
      iptables -I INPUT 1 -p tcp --dport "$port" -m state --state NEW -j ACCEPT
    fi
  done
  if need netfilter-persistent; then
    netfilter-persistent save >/dev/null 2>&1 || true
  fi
  echo "==> iptables: allowed 80 and 443"
fi

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
sleep 2

echo
systemctl --no-pager --lines=0 status "$SERVICE" || true
cat <<EOF

==> Done. Questline server is running at https://$DOMAIN

Next steps:
  1. In the Oracle Cloud console, add ingress rules for TCP 80 and 443 to the
     instance's subnet security list (or network security group).
  2. Make sure DNS has an A record: $DOMAIN -> this server's public IP.
     The certificate is issued on the first HTTPS request.
  3. Moving data from your PC? Run: sudo bash ./import-data.sh pb_data.tar.gz
     Starting fresh? Create the admin account:
       sudo -u $SERVICE $APP_DIR/pocketbase superuser upsert YOUR_EMAIL YOUR_PASSWORD --dir $APP_DIR/pb_data
     then add your app user in https://$DOMAIN/_/ under Collections > users.

Logs:     journalctl -u $SERVICE -f
Memory:   systemctl status $SERVICE | grep Memory
EOF
