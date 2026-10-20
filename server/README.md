# Questline sync server

PocketBase running on your PC, reachable from your phone through Tailscale. The app works offline without it; the server is backup and sync.

```
phone (Questline) ──HTTPS over Tailscale──► tailscale serve ──► 127.0.0.1:8090 PocketBase ──► server/pb_data/
```

## 1. Start PocketBase

```powershell
.\server\start.ps1
```

The first run downloads PocketBase (checksum-verified) if it isn't already in `server/bin`, applies the schema in `pb_migrations/`, and prints a link to create the **superuser** (the admin account for the dashboard). Open that link and choose your own email and password.

Dashboard: http://127.0.0.1:8090/_/

## 2. Create your app account

In the dashboard: **Collections → users → New record**, then enter your email and a password. This is the login you'll type into the app. Public sign-up is disabled, so accounts can only be made here.

## 3. Tailscale

1. Install Tailscale on the PC and on your phone, and sign in to the same account on both.
2. In the Tailscale admin console → **DNS**: make sure **MagicDNS** is on, and under **HTTPS Certificates** click **Enable**.
3. On the PC, in a terminal:

   ```powershell
   tailscale serve --bg 8090
   tailscale serve status
   ```

   `status` shows your URL, like `https://your-pc.your-tailnet.ts.net`. It's only reachable from devices in your tailnet. This is not Funnel, so it isn't public.

## 4. Connect the app

On the phone, with Tailscale connected: **Status → ⚙ Settings → Sync**. Enter the `https://…ts.net` URL and your app account's email and password, then tap **Connect**.

The app then syncs on launch, when you return to it, and a few seconds after each change. On a new phone, install the APK, connect, and everything comes back.

> Keep the Expo Go development copy and the installed APK on different accounts (or don't connect Expo Go at all). Each has its own local data, and both on one account would merge test data into your real progress.

## 5. Optional: start with Windows

```powershell
.\server\install-autostart.ps1
```

This creates a scheduled task that runs `start.ps1` hidden at log-in. `tailscale serve --bg` already persists across reboots.

## Backups

All data lives in `server/pb_data/`. Copy that folder somewhere safe, or use the dashboard's **Settings → Backups** to schedule automatic backups.

## Testing

`src/sync/pocketbase.integration.test.ts` runs against a throwaway server when `PB_TEST_URL`, `PB_TEST_EMAIL` and `PB_TEST_PASSWORD` are set; otherwise it's skipped.
