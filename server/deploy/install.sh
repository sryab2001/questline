#!/usr/bin/env bash
# Installs or upgrades the Questline sync server (PocketBase) on Ubuntu/Debian.
#
#   Standalone (PocketBase serves HTTPS itself on 80/443):
#     sudo bash ./install.sh questline.example.com
#
#   Behind an existing reverse proxy such as Caddy (PocketBase stays on localhost):
#     sudo bash ./install.sh questline.example.com --behind-proxy [--port 8090]
#
#   Preview without changing anything (no sudo needed):
#     bash ./install.sh questline.example.com --behind-proxy --dry-run
#
# Either way it downloads PocketBase for this CPU (checksum-verified) and runs it
# as an unprivileged "questline" user under systemd, memory-capped. Re-running
# upgrades the binary and migrations and keeps all data.
set -euo pipefail

PB_VERSION="0.40.5"
APP_DIR="/opt/questline"
SERVICE="questline"
HERE="$(cd "$(dirname "$0")" && pwd)"

DOMAIN=""
MODE="standalone"
PORT="8090"
DRY_RUN=0

usage() {
  echo "usage: sudo bash $0 your.domain.com [--behind-proxy [--port 8090]] [--dry-run]" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --behind-proxy) MODE="proxy" ;;
    --port)
      PORT="${2:-}"
      shift
      ;;
    --dry-run) DRY_RUN=1 ;;
    -h | --help) usage ;;
    -*) echo "Unknown option: $1" >&2; usage ;;
    *) DOMAIN="$1" ;;
  esac
  shift
done

[[ -n "$DOMAIN" ]] || usage
[[ "$PORT" =~ ^[0-9]+$ ]] && ((PORT > 1023 && PORT < 65536)) || { echo "--port must be 1024-65535" >&2; exit 1; }
if [[ $DRY_RUN -eq 0 && $EUID -ne 0 ]]; then
  echo "Run with sudo (or add --dry-run to preview)." >&2
  exit 1
fi

case "$(uname -m)" in
  aarch64 | arm64) ARCH="arm64" ;;
  x86_64 | amd64) ARCH="amd64" ;;
  *) echo "Unsupported CPU: $(uname -m)" >&2; exit 1 ;;
esac

need() { command -v "$1" >/dev/null 2>&1; }

# Is something other than our own service listening on this TCP port?
port_taken_by_other() {
  local port="$1" listeners
  need ss || return 1
  listeners="$(ss -ltnpH "sport = :$port" 2>/dev/null || true)"
  [[ -n "$listeners" ]] || return 1
  # Re-running the installer: our own PocketBase holding the port is fine.
  grep -q '"pocketbase"' <<<"$listeners" && return 1
  return 0
}

if [[ "$MODE" == "proxy" ]]; then
  if port_taken_by_other "$PORT"; then
    echo "Port $PORT is already in use by another program. Pick a free one with --port." >&2
    ss -ltnpH "sport = :$PORT" >&2 || true
    exit 1
  fi
  LISTEN="--http 127.0.0.1:$PORT"
  CAPS="# Localhost only: no special privileges needed.
CapabilityBoundingSet=
NoNewPrivileges=true"
else
  for p in 80 443; do
    if port_taken_by_other "$p"; then
      echo "Port $p is already used by another web server (Caddy, nginx, ...)." >&2
      echo "Re-run with --behind-proxy so Questline runs on localhost behind it." >&2
      exit 1
    fi
  done
  LISTEN="$DOMAIN"
  CAPS="# Bind 80/443 without running as root.
AmbientCapabilities=CAP_NET_BIND_SERVICE
CapabilityBoundingSet=CAP_NET_BIND_SERVICE
NoNewPrivileges=true"
fi

UNIT="[Unit]
Description=Questline sync server (PocketBase)
After=network-online.target
Wants=network-online.target

[Service]
User=$SERVICE
Group=$SERVICE
WorkingDirectory=$APP_DIR
ExecStart=$APP_DIR/pocketbase serve $LISTEN --dir $APP_DIR/pb_data --migrationsDir $APP_DIR/pb_migrations --hooksPool 2
Restart=on-failure
RestartSec=5

$CAPS

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
WantedBy=multi-user.target"

CADDY_BLOCK="$DOMAIN {
    reverse_proxy 127.0.0.1:$PORT
}"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "==> DRY RUN: nothing will be changed"
  echo "Mode:      $MODE"
  echo "PocketBase $PB_VERSION ($ARCH) -> $APP_DIR/pocketbase"
  echo "Data:      $APP_DIR/pb_data (kept on re-runs)"
  if [[ "$MODE" == "proxy" ]]; then
    echo "Listens:   127.0.0.1:$PORT only (not reachable from outside)"
    echo "Firewall:  untouched"
    echo
    echo "--- Add to your Caddyfile ---"
    echo "$CADDY_BLOCK"
  else
    echo "Listens:   0.0.0.0:80 and 0.0.0.0:443 with automatic HTTPS for $DOMAIN"
    echo "Firewall:  opens 80 and 443"
  fi
  echo
  echo "--- /etc/systemd/system/$SERVICE.service ---"
  echo "$UNIT"
  exit 0
fi

echo "==> Installing PocketBase $PB_VERSION ($ARCH) for $DOMAIN ($MODE mode)"

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
echo "$UNIT" >"/etc/systemd/system/$SERVICE.service"

# --- host firewall (standalone only; behind a proxy nothing new is exposed) ---
if [[ "$MODE" == "standalone" ]]; then
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
fi

systemctl daemon-reload
systemctl enable "$SERVICE" >/dev/null
systemctl restart "$SERVICE"
sleep 2

echo
systemctl --no-pager --lines=0 status "$SERVICE" || true

if [[ "$MODE" == "proxy" ]]; then
  cat <<EOF

==> Done. PocketBase is running on 127.0.0.1:$PORT (localhost only).
    Your Caddy config and firewall were not touched.

Next steps:
  1. DNS: add an A record  $DOMAIN -> this server's public IP.
  2. Add this block to your Caddyfile (usually /etc/caddy/Caddyfile):

$CADDY_BLOCK

     then check and reload Caddy (other sites keep running during a reload):
       sudo caddy validate --config /etc/caddy/Caddyfile
       sudo systemctl reload caddy
     Caddy fetches the certificate for $DOMAIN on its own.
  3. In https://$DOMAIN/_/ go to Settings > Application > Trusted proxy and set
     the header to X-Forwarded-For, so logs and rate limits see real client IPs.
EOF
else
  cat <<EOF

==> Done. Questline server is running at https://$DOMAIN

Next steps:
  1. In the Oracle Cloud console, add ingress rules for TCP 80 and 443 to the
     instance's subnet security list (or network security group).
  2. Make sure DNS has an A record: $DOMAIN -> this server's public IP.
     The certificate is issued on the first HTTPS request.
EOF
fi

cat <<EOF

Moving data from your PC?  sudo bash ./import-data.sh pb_data.tar.gz
Starting fresh?            sudo -u $SERVICE $APP_DIR/pocketbase superuser upsert YOUR_EMAIL YOUR_PASSWORD --dir $APP_DIR/pb_data
                           then add your app user in https://$DOMAIN/_/ under Collections > users.

Logs:     journalctl -u $SERVICE -f
Memory:   systemctl status $SERVICE | grep Memory
EOF
