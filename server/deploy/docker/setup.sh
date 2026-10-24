#!/usr/bin/env bash
# Runs the Questline sync server as a Docker container next to an existing
# Caddy container, on Caddy's Docker network. Nothing is published on the host;
# your other compose projects and your Caddyfile are not modified.
#
#   bash ./docker/setup.sh questline.yourdomain.com --dry-run    # preview
#   sudo bash ./docker/setup.sh questline.yourdomain.com          # install / upgrade
#
# Options: --caddy-container NAME   if more than one Caddy container runs
#          --network NAME           if Caddy is on several networks
set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="/opt/questline/pb_data"
ENV_FILE="/opt/questline/questline.env"
PB_UID=10001
PORT=9090

DOMAIN=""
CADDY=""
NETWORK=""
DRY_RUN=0

usage() {
  echo "usage: sudo bash $0 your.domain.com [--caddy-container NAME] [--network NAME] [--dry-run]" >&2
  exit 1
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --caddy-container) CADDY="${2:-}"; shift ;;
    --network) NETWORK="${2:-}"; shift ;;
    --dry-run) DRY_RUN=1 ;;
    -h | --help) usage ;;
    -*) echo "Unknown option: $1" >&2; usage ;;
    *) DOMAIN="$1" ;;
  esac
  shift
done
[[ -n "$DOMAIN" ]] || usage

die() { echo "Error: $*" >&2; exit 1; }

command -v docker >/dev/null 2>&1 || die "docker is not installed."
if docker compose version >/dev/null 2>&1; then
  COMPOSE=(docker compose)
elif command -v docker-compose >/dev/null 2>&1; then
  COMPOSE=(docker-compose)
else
  die "neither 'docker compose' nor 'docker-compose' is available."
fi
docker info >/dev/null 2>&1 || die "cannot talk to Docker. Run with sudo (or as a user in the docker group)."

# The systemd install (install.sh) uses the same data folder; never run both.
if command -v systemctl >/dev/null 2>&1 && systemctl is-active --quiet questline 2>/dev/null; then
  die "the systemd 'questline' service from install.sh is running. Stop it first:
  sudo systemctl disable --now questline"
fi

# --- find the Caddy container ---
if [[ -z "$CADDY" ]]; then
  mapfile -t found < <(docker ps --format '{{.Names}} {{.Image}}' | awk 'tolower($2) ~ /caddy/ {print $1}')
  case "${#found[@]}" in
    0) die "no running Caddy container found. Pass --caddy-container NAME." ;;
    1) CADDY="${found[0]}" ;;
    *) die "several Caddy containers are running (${found[*]}). Pass --caddy-container NAME." ;;
  esac
fi
docker inspect "$CADDY" >/dev/null 2>&1 || die "container '$CADDY' not found."

# --- find Caddy's network ---
if [[ -z "$NETWORK" ]]; then
  mapfile -t nets < <(docker inspect -f '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{"\n"}}{{end}}' "$CADDY" | sed '/^$/d' | grep -vx -e bridge -e host -e none || true)
  case "${#nets[@]}" in
    0) die "Caddy is only on Docker's default network, where containers can't reach each other by name.
Put Caddy on a named network in its compose file, or pass --network NAME." ;;
    1) NETWORK="${nets[0]}" ;;
    *) die "Caddy is on several networks (${nets[*]}). Pass --network NAME." ;;
  esac
fi
docker network inspect "$NETWORK" >/dev/null 2>&1 || die "network '$NETWORK' not found."

# --- where the Caddyfile lives on this server (it's mounted into the container) ---
CADDYFILE="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy/Caddyfile"}}{{.Source}}{{end}}{{end}}' "$CADDY")"
if [[ -z "$CADDYFILE" ]]; then
  dir="$(docker inspect -f '{{range .Mounts}}{{if eq .Destination "/etc/caddy"}}{{.Source}}{{end}}{{end}}' "$CADDY")"
  [[ -n "$dir" ]] && CADDYFILE="$dir/Caddyfile"
fi

CADDY_BLOCK="$DOMAIN {
    reverse_proxy questline:$PORT
}"

echo "Caddy container : $CADDY"
echo "Docker network  : $NETWORK"
echo "Caddyfile       : ${CADDYFILE:-not found from mounts, see the volumes of the caddy service in its compose file}"
echo "Questline data  : $DATA_DIR"
echo "Exposed ports   : none (Caddy reaches questline:$PORT over $NETWORK)"

if [[ $DRY_RUN -eq 1 ]]; then
  echo
  echo "==> DRY RUN: nothing changed. Would build the image, start the 'questline' container,"
  echo "    and you would add this to the Caddyfile:"
  echo
  echo "$CADDY_BLOCK"
  exit 0
fi

[[ $EUID -eq 0 ]] || die "run with sudo (needed to create $DATA_DIR)."

[[ -d "$HERE/../pb_migrations" ]] || die "pb_migrations folder missing next to docker/. Unpack the full questline-server package."
[[ -d "$HERE/../pb_hooks" ]] || die "pb_hooks folder missing next to docker/. Unpack the full questline-server package."

mkdir -p "$DATA_DIR"
chown -R "$PB_UID:$PB_UID" "$DATA_DIR"

# Private settings (AI key) live next to the data, readable by root only, and are
# never overwritten by an upgrade.
if [[ ! -f "$ENV_FILE" ]]; then
  cat >"$ENV_FILE" <<'EOF_ENV'
# Questline server settings. After editing, apply with:
#   cd ~/questline-server/docker && sudo docker compose up -d
#
# Weekly AI report (https://console.groq.com/keys). Leave empty to turn it off.
GROQ_API_KEY=
# GROQ_MODEL=llama-3.3-70b-versatile
# Cron for the Sunday report, in UTC (default: Sundays 13:30 UTC).
# QUESTLINE_REPORT_CRON=30 13 * * 0
EOF_ENV
  chmod 600 "$ENV_FILE"
  echo "==> Created $ENV_FILE (add GROQ_API_KEY there to turn on the weekly AI report)"
fi

cat >"$HERE/.env" <<EOF
CADDY_NETWORK=$NETWORK
QUESTLINE_DATA=$DATA_DIR
QUESTLINE_ENV_FILE=$ENV_FILE
EOF

echo
echo "==> Building and starting the questline container"
(cd "$HERE" && "${COMPOSE[@]}" up -d --build)

echo "==> Checking Caddy can reach it"
ok=0
for _ in 1 2 3 4 5 6 7 8 9 10; do
  if docker exec "$CADDY" wget -q -O- "http://questline:$PORT/api/health" >/dev/null 2>&1; then ok=1; break; fi
  sleep 2
done
if [[ $ok -eq 1 ]]; then
  echo "    OK: $CADDY -> questline:$PORT"
else
  echo "    Could not confirm yet. Check: docker logs questline"
fi

cat <<EOF

==> Done. Questline runs in the 'questline' container on network '$NETWORK'.
    No ports were opened; your other containers and Caddy were not changed.

Next steps:
  1. DNS: A record  $DOMAIN -> this server's public IP.
  2. Add to your Caddyfile${CADDYFILE:+ ($CADDYFILE)}:

$CADDY_BLOCK

     then validate and reload Caddy in place (other sites stay up):
       docker exec $CADDY caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
       docker exec $CADDY caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
  3. Data from your PC:  sudo bash ./import-data.sh pb_data.tar.gz
     Starting fresh:     docker exec questline /pb/pocketbase superuser upsert YOUR_EMAIL YOUR_PASSWORD --dir /pb/pb_data
  4. In https://$DOMAIN/_/ > Settings > Application > Trusted proxy: header X-Forwarded-For.

Logs:     docker logs -f questline
Memory:   docker stats --no-stream questline
Upgrade:  unpack a newer package and run this script again (data in $DATA_DIR is kept)
EOF
