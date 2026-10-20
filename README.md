# Questline

A habit tracker for Android, styled as the "System" from *Solo Leveling* with item, class and title flavour from *Overgeared*. Your habits are Daily Quests. Clearing them earns EXP, levels, stats and ranks; missing them has penalties.

- Game design: [docs/game-design.md](docs/game-design.md)
- Build plan and phases: [docs/build-plan.md](docs/build-plan.md)

## Stack

Expo (React Native + TypeScript), expo-router, expo-sqlite + Drizzle ORM (local-first), Reanimated. Sync to a PocketBase server comes in Phase 2.

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

## Layout

```
src/
  app/          expo-router screens: (tabs)/index (Quests), status, store, class
  engine/       pure game logic: days, levels, ranks, state (no React, no DB) + tests
  db/           Drizzle schema, client, actions
  hooks/        usePlayerState: live DB queries → engine → screen state
  components/   SystemWindow, QuestRow, ProgressBar, SysText
  theme/        colours, fonts, spacing from the mockups
drizzle/        generated SQL migrations (bundled into the app)
```
