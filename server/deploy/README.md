# Questline server on a Linux VM

PocketBase with the Questline schema. Typical memory use is 30–60 MB, capped at 160 MB. Pick the setup that matches your server:

| Your server | Use | What happens |
|---|---|---|
| **Caddy runs in Docker / docker-compose** | `docker/setup.sh` | Questline runs as a container on Caddy's Docker network. No ports are published, and your other containers and compose files are untouched. |
| Caddy/nginx installed directly on the host | `install.sh --behind-proxy` | systemd service on `127.0.0.1:9090` |
| Nothing else uses ports 80/443 | `install.sh` | systemd service serving `:80`/`:443` with automatic HTTPS |

All scripts refuse to run when they would clash with something already there, and each has a `--dry-run` that changes nothing.

## Docker (Caddy in docker-compose)

On the server, from the unpacked `questline-server` folder:

```bash
bash ./docker/setup.sh questline.yourdomain.com --dry-run   # preview: finds your Caddy, its network and Caddyfile
sudo bash ./docker/setup.sh questline.yourdomain.com         # build and start
```

The script:

- **Finds your Caddy container and its Docker network.** If there are several, pass `--caddy-container NAME` or `--network NAME`.
- **Shows where your Caddyfile really is on disk.** Your compose file mounts it into the container, so there's no `/etc/caddy` on the host.
- **Starts the `questline` container on that network,** with data in `/opt/questline/pb_data`, which is kept across upgrades.
- **Checks that Caddy can reach `questline:9090`.**

Then:

1. **DNS:** add an **A record** `questline.yourdomain.com` → the VM's public IP.
2. **Caddyfile** (the path the script printed): add

   ```
   questline.yourdomain.com {
       reverse_proxy questline:9090
   }
   ```

   and reload Caddy in place. Your other sites stay up.

   ```bash
   docker exec <caddy-container> caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
   docker exec <caddy-container> caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
   ```

   The `/etc/caddy/Caddyfile` path here is *inside* the Caddy container, which is correct. If your Caddy disables its admin API, use `docker compose restart caddy` in its project instead.
3. **Real client IPs:** in `https://questline.yourdomain.com/_/` → Settings → Application → **Trusted proxy**, set the header to `X-Forwarded-For`.

Ports 80/443 are already open for Caddy, so there's nothing to change in Oracle's security list.

| Task | Command |
|---|---|
| Logs | `docker logs -f questline` |
| Memory | `docker stats --no-stream questline` |
| Restart | `docker restart questline` |
| Upgrade | unpack the newer package, run `sudo bash ./docker/setup.sh questline.yourdomain.com` again |

## systemd behind a host-installed Caddy/nginx

```bash
bash ./install.sh questline.yourdomain.com --behind-proxy --dry-run
sudo bash ./install.sh questline.yourdomain.com --behind-proxy
```

PocketBase listens on `127.0.0.1:9090` (change it with `--port`). Add `reverse_proxy 127.0.0.1:9090` for the domain in `/etc/caddy/Caddyfile`, then run `sudo systemctl reload caddy`. If your Caddy turns out to run in Docker, this script stops and points you to the Docker setup.

## systemd standalone (fresh VM)

```bash
sudo bash ./install.sh questline.yourdomain.com
```

Open **TCP 80 and 443** in the Oracle console, add the DNS A record, and visit `https://questline.yourdomain.com/_/`.

## Bring your data from the PC

On the PC: stop the server (Ctrl+C in its terminal), then from the project folder:

```powershell
tar -czf pb_data.tar.gz -C server pb_data
scp pb_data.tar.gz ubuntu@SERVER_IP:~/questline-server/
```

On the server, after the setup above:

```bash
sudo bash ./import-data.sh pb_data.tar.gz
```

This works for both the Docker and the systemd setups, and keeps any existing data as a timestamped backup. Your admin account, app account and all synced data come across as they are.

In the app: **Settings → Sync → Sign out**, then connect again with `https://questline.yourdomain.com` and the same email and password. Tailscale is no longer needed.

## Backups

All data is in `/opt/questline/pb_data`. Copy it somewhere safe, or use the dashboard → Settings → Backups (local or S3).
