# Security and credentials

Questline has **no secrets in the source code**. Every credential is supplied by whoever runs it, at runtime, and stays out of git.

## Where credentials live

| Credential | Where it lives | In the repo? |
|---|---|---|
| Sync server URL | Typed in the app (Settings → Sync), stored on the phone | No |
| Your app account email/password | Typed in the app; the password is sent once to *your* PocketBase server and never stored | No |
| Session token | Phone's encrypted secure storage (Android Keystore via `expo-secure-store`); refreshed on each sync; expires after 90 days unused | No |
| PocketBase admin (superuser) and user accounts | Created by you on your server; stored hashed in `pb_data/` | No (`server/pb_data/` is gitignored) |
| Android signing key | Generated and held by EAS (Expo's build service) in your Expo account | No (`*.jks`, `*.keystore` are gitignored) |
| Integration test login | Environment variables `PB_TEST_URL`, `PB_TEST_EMAIL`, `PB_TEST_PASSWORD`, for a throwaway server only | No |
| HTTPS certificate (Linux deploy) | Issued by Let's Encrypt to PocketBase, cached in `pb_data/` | No |

**Not secret, and committed on purpose:**
- `app.json` → `extra.eas.projectId` is a public identifier for the maintainer's Expo project. Nobody can build or publish to it without access to that Expo account.
- `android.package` (`com.questline.app`) is the app's public ID.

## Forking or self-hosting

1. Change `android.package` in `app.json` to your own ID (e.g. `com.yourname.questline`).
2. Run `npx eas-cli@latest init --force` to link the app to *your* Expo account. This replaces the `projectId`.
3. Run your own server (`server/README.md` for a PC, `server/deploy/README.md` for a Linux VM) and create your own accounts. Public sign-up is disabled by the schema; only the server admin can create users.
4. Optional: if you store third-party credentials in the PocketBase dashboard (S3 backups, SMTP), start PocketBase with `--encryptionEnv` so they're encrypted at rest.

## Data and privacy

- All habit data is stored on the phone first. It only leaves the device if you connect a sync server, and then only to that server.
- Server rules restrict every record to its owner. Users cannot read or modify each other's data.
- The app has no analytics, ads, crash reporters or third-party trackers.

## Reporting a vulnerability

Please open a private security advisory on the repository (GitHub → Security → Report a vulnerability) rather than a public issue.
