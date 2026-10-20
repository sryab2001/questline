# Questline server on a Linux VM

PocketBase runs as a systemd service with automatic HTTPS (Let's Encrypt) for your domain. Typical memory use is 30–60 MB; the service is capped at 160 MB.

## Install

On the server, from the unpacked `questline-server` folder:

```bash
sudo bash ./install.sh questline.yourdomain.com
```

Then:

1. **Oracle Cloud console:** go to your VCN → subnet → Security List and add ingress rules for **TCP 80** and **TCP 443** from `0.0.0.0/0`. The script opens the VM's own firewall, but Oracle also filters at the network level.
2. **DNS:** add an **A record** `questline.yourdomain.com` → the VM's public IP.
3. Open `https://questline.yourdomain.com/_/`. The first visit takes a few seconds while the certificate is issued.

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
| Upgrade | unpack a newer package and run `sudo bash ./install.sh questline.yourdomain.com` again (data is kept) |
| Backups | dashboard → Settings → Backups (local or S3), or copy `/opt/questline/pb_data` |
