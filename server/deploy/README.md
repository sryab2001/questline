# Questline server on a Linux VM

PocketBase runs as a systemd service under its own unprivileged user. Typical memory use is 30–60 MB; the service is capped at 160 MB. Two ways to run it:

| Mode | When | Ports |
|---|---|---|
| **Behind your reverse proxy** (`--behind-proxy`) | The VM already runs Caddy/nginx for other sites | Listens on `127.0.0.1:8090` only; your proxy handles the domain and HTTPS. Firewall untouched. |
| **Standalone** | Nothing else uses ports 80/443 | PocketBase serves `:80`/`:443` itself with automatic Let's Encrypt HTTPS |

The installer refuses to start in standalone mode if another web server already owns 80/443, and refuses `--behind-proxy` if the chosen port is taken. Preview any run with `--dry-run`; it changes nothing and needs no sudo.

## Install behind Caddy (existing server with other services)

On the server, from the unpacked `questline-server` folder:

```bash
bash ./install.sh questline.yourdomain.com --behind-proxy --dry-run   # preview
sudo bash ./install.sh questline.yourdomain.com --behind-proxy         # install
```

Use `--port 8095` (any free port 1024–65535) if 8090 is taken.

Then:

1. **DNS:** add an **A record** `questline.yourdomain.com` → the VM's public IP.
2. **Caddy:** add this block to your Caddyfile (usually `/etc/caddy/Caddyfile`):

   ```
   questline.yourdomain.com {
       reverse_proxy 127.0.0.1:8090
   }
   ```

   Then check the config and reload. A reload keeps your other sites running.

   ```bash
   sudo caddy validate --config /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```

   Caddy gets the certificate for the new domain automatically. Ports 80/443 are already open for Caddy, so there's nothing to change in Oracle's security list.
3. **Real client IPs:** in `https://questline.yourdomain.com/_/` → Settings → Application → **Trusted proxy**, set the header to `X-Forwarded-For`.

## Install standalone (fresh VM)

```bash
sudo bash ./install.sh questline.yourdomain.com
```

Then open **TCP 80 and 443** in the Oracle console (VCN → subnet → Security List; the script opens the VM's own firewall), add the DNS A record, and visit `https://questline.yourdomain.com/_/`. The first visit takes a few seconds while the certificate is issued.

## Bring your data from the PC

On the PC: stop the server (Ctrl+C in its terminal), then from the project folder:

```powershell
tar -czf pb_data.tar.gz -C server pb_data
scp pb_data.tar.gz ubuntu@SERVER_IP:~/questline-server/
```

On the server:

```bash
sudo bash ./import-data.sh pb_data.tar.gz
```

Your admin account, app account and all synced data come across as they are.

In the app: **Settings → Sync → Sign out**, then connect again with `https://questline.yourdomain.com` and the same email and password. Tailscale is no longer needed.

## Day-to-day

| Task | Command |
|---|---|
| Logs | `journalctl -u questline -f` |
| Restart | `sudo systemctl restart questline` |
| Memory | `systemctl status questline` (see the `Memory:` line) |
| Upgrade | unpack a newer package and re-run `install.sh` with the **same flags** (data is kept) |
| Backups | dashboard → Settings → Backups (local or S3), or copy `/opt/questline/pb_data` |
