# Questline

A habit tracker for Android, styled as the "System" from *Solo Leveling* with item, class and title flavour from *Overgeared*. Your habits are Daily Quests. Clearing them earns EXP, levels, stats and ranks; missing them has penalties.

- Game design: [docs/game-design.md](docs/game-design.md)
- Build plan and phases: [docs/build-plan.md](docs/build-plan.md)

## Stack

Expo SDK 57 (React Native + TypeScript), expo-router, expo-sqlite + Drizzle ORM (local-first), Reanimated, expo-audio. Syncs to a self-hosted PocketBase server (see [server/README.md](server/README.md) for the PC/Tailscale setup and [server/deploy/README.md](server/deploy/README.md) for a Linux VM).

## Run it on your phone

1. Install **Expo Go** from the Play Store.
2. `npm install`
3. `npm start`, then scan the QR code with Expo Go. The phone and PC must be on the same Wi-Fi; if they can't see each other, use `npx expo start --tunnel`.

## Scripts

| Command | What it does |
|---|---|
| `npm start` | Start the dev server (Expo Go / dev build) |
| `npm test` | Engine unit tests (Vitest) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run db:generate` | Generate a Drizzle migration after editing `src/db/schema.ts` |
| `node scripts/generate-icons.mjs` | Re-render the app icon, adaptive icon, splash and notification icon |
| `node scripts/generate-sounds.mjs` | Re-synthesize the sound effects in `assets/sounds/` |
| `powershell -File server/package.ps1` | Build `dist/questline-server.tar.gz` for a Linux server |

## Layout

```
src/
  app/          expo-router screens: (tabs)/ Quests, Status, Store, Class; awakening (onboarding),
                habit editor, habits, history (calendar), settings
  engine/       pure game logic: days, levels, ranks, economy, survival, boxes (no React, no DB) + tests
  sync/         PocketBase client, table mapping, push/pull engine, status store
  sound/        sound effect playback
  notifications/ scheduled System reminders
  db/           Drizzle schema, client, actions
  hooks/        usePlayerState: live DB queries → engine → screen state
  components/   SystemWindow, QuestRow, ProgressBar, SysText
  theme/        colours, fonts, spacing from the mockups
drizzle/        generated SQL migrations (bundled into the app)
```
