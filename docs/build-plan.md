# Questline: Build Plan

How we turn the design ([game-design.md](game-design.md)) and the screen mockups into a real Android app.

**Decisions so far**
- Name: **Questline**
- Platform: **Android only**, a native app (no web or laptop version)
- Toolkit: **Expo (React Native + TypeScript)**
- Data: **on the phone first (SQLite), synced to a small PocketBase server**

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| App framework | Expo (latest SDK) + React Native + TypeScript | Officially recommended way to build React Native apps; no Android Studio needed |
| Navigation | expo-router | File-based routes (`app/quests.tsx`, `app/status.tsx` ...) |
| Local database | expo-sqlite + Drizzle ORM | Typed schema, migrations, live queries that re-render screens when data changes |
| Game logic | Pure TypeScript module (`src/engine`) | Testable, rebalanced without data migrations |
| Animation / glow | react-native-reanimated + @shopify/react-native-skia | 60fps level-up and penalty effects, glowing System windows |
| Fonts | @expo-google-fonts (Rajdhani, Inter) | Matches the mockups |
| Notifications | expo-notifications (local, scheduled on device) | "Daily Quest has arrived" and penalty warnings, even offline |
| Haptics / sound | expo-haptics, expo-audio | Feedback on clear and level-up |
| Secure storage | expo-secure-store | Server auth token |
| Sync server | PocketBase (single Go binary, SQLite) | Auth + REST, tiny to host |
| Builds | EAS Build (cloud) → APK | No local Android SDK required |
| Updates | EAS Update | Push JS/UI fixes to the phone without reinstalling |
| Tests | Vitest (engine + sync logic) | |
| Later | react-native-android-widget | Home-screen widget (needs a custom dev build, also via EAS) |

**Tooling on your machine**: Node 20+ (installed), Git (installed), the **Expo Go** app on your phone, and a free **Expo account** for cloud builds. Android Studio is optional, only for building locally instead of in the cloud.

## 2. Architecture

### Local-first
The phone's SQLite database is the source of truth. Every screen reads from it, so the app is instant and works fully offline. The server is a backup and sync target, never a requirement for using the app.

### Events in, state derived
The database stores **facts** (what you did). The engine **derives** game state (level, stats, gold, HP) by folding those facts through the rules.

```
logs, day_results, allocations, purchases, unlocks  ──►  engine.computeState(events, rules)  ──►  PlayerState
                (SQLite on the phone)                       (pure TS, deterministic)              (screens)
```

- Changing an XP number rebalances history automatically.
- The engine is a pure function, so time-travel tests are trivial.
- Append-only facts also make sync nearly conflict-free (below).

### Day close
When the app opens (and on a background task where Android allows it), the engine evaluates every day since the last `day_result` that has ended, in the user's timezone and reset hour. For each one it records cleared or failed and the penalty, then writes a `day_result`. Each day key is unique, so re-running this is harmless.

### Notifications
Each time data changes, the app reschedules its local notifications:
- "[Daily Quest has arrived]" at the reset time.
- "3 goals left, 2h until penalty" in the evening, cancelled once the goals are cleared.
- The Survival window closing.

Android fires these on time with no server and no Firebase.

### Sync with PocketBase
- Every row gets a **client-generated UUID** (v7), plus `updated_at`, `deleted_at` (soft delete) and a local `dirty` flag.
- **Push**: upsert dirty rows to PocketBase by id, then clear `dirty`.
- **Pull**: fetch rows with `updated > last_pull_at` and upsert them locally.
- **Conflicts**:
  - `logs`, `purchases`, `allocations` and `unlocks` are append-only, so there's nothing to conflict.
  - `habits`, `store_items` and settings use last-write-wins on `updated_at`.
  - `day_results` are deterministic from logs, so either copy is correct.
- **Triggers**: app foreground, after each change (debounced) and manual "Sync now". Failure just retries later.
- **New phone**: log in → full pull → state is rebuilt by the engine.
- Auth is PocketBase email/password, with the token in secure storage.

## 3. Data model

The same tables exist locally (SQLite via Drizzle) and on the server (PocketBase collections). All of them have `id` (uuid), `created_at`, `updated_at`, `deleted_at`, plus `dirty` locally.

| Table | Key fields | Notes |
|---|---|---|
| `settings` | name, timezone, reset_hour, server_url | One row |
| `habits` | name, stat (STR/AGI/STA/INT/SENSE), target, unit, schedule (daily / weekdays), grade (F–S), sort_order, archived | A habit = a Daily Quest goal |
| `logs` | habit_id, day (YYYY-MM-DD local), amount | Each tap or increment; progress = sum per day |
| `day_results` | day, cleared, total, penalty_json, survival_status | Unique per day |
| `stat_allocations` | stat, points | Spending ability points |
| `store_items` | name, cost, kind (treat / shield / box) | User-defined real-life rewards |
| `purchases` | store_item_id, cost | Gold spent |
| `unlocks` | kind (title / item / skill / class), ref, equipped | Earned titles, items, skills, classes |
| `class_quests` | name, rating, steps_json, current_step, status | Long-term goal chains |

Static definitions (titles, items, skills, rank thresholds, XP curve) live in code (`src/engine/rules.ts`).

## 4. Repo layout

```
Quest APP/
  app/                 # expo-router screens: (tabs)/quests, status, store, class; level-up & penalty modals
  src/
    engine/            # pure game logic + rules + tests (no React, no DB)
    db/                # Drizzle schema, migrations, queries
    sync/              # PocketBase push/pull + tests
    notifications/     # scheduling logic
    components/        # SystemWindow, StatBar, RatingBadge, GlowText ...
    theme/             # colours: cyan system, red penalty, gold/violet loot; fonts
  server/
    pb_migrations/     # PocketBase collections as code
    Dockerfile, docker-compose.yml, Caddyfile
  docs/
  app.json, eas.json
```

## 5. Milestones

### Phase 0: Foundation (½–1 day)
- `git init`, create the Expo app (TypeScript, expo-router), ESLint/Prettier.
- Theme + fonts; `SystemWindow` component matching the mockups.
- SQLite + Drizzle schema and migrations; engine skeleton with Vitest.
- Running on your phone in Expo Go with live reload.

### Phase 1: Core loop, offline (3–5 days) ← start using it daily here
- Habit CRUD (name, stat, target, unit, schedule).
- **Daily Quests** screen: tap or increment to log.
- Engine v1: EXP, level curve, ranks E→S, stats per habit category, streaks.
- Day close + basic penalty (EXP and HP loss).
- **Status** screen, **Level Up** overlay.
- Local notifications (morning arrival, evening warning).
- First APK via EAS Build, installed on the phone.

### Phase 2: Server sync & backup (2–3 days)
- PocketBase server with collections, deployed (VPS + Caddy, or home PC + Tailscale).
- Login, sync engine (push/pull), "Sync now" button and status indicator.
- Restore onto a fresh install to prove the backup works.

### Phase 3: System economy (3–4 days)
- Ability points (+3 per daily clear) and allocation.
- HP (streak health), MP, Fatigue; skill **Rest Day** (costs MP).
- Gold + **Store**: custom treats, Streak Shield, Blessed/Cursed Random Box.
- **Penalty** screen + Survival make-up quest (4-hour window).

### Phase 4: Polish (2–3 days)
- Sounds and haptics on clear and level-up.
- History calendar (cleared, failed and shielded days).
- Urgent Quests (random short challenges via notification).

### Phase 5: Overgeared layer (4–6 days)
- Titles with effects, first-clear bonuses.
- Items with ratings (Normal → Myth) and equip slots.
- Hidden stats (Indomitable, Composure, Insight, Dignity).
- **Class Quests** and the Job Change; Main Quests.

### Phase 6: Android extras (2–3 days)
- Home-screen widget showing today's quests.
- "Mark done" action straight from the notification.

## 6. Deployment

- **App**: `eas build -p android --profile preview` produces an APK download link; install it on the phone. Later UI or logic fixes ship with `eas update` (no reinstall). No Play Store account is needed for personal use.
- **Server**: a Docker image running PocketBase, behind Caddy for HTTPS (Hetzner CX22, ~€4/mo). Alternatively, a home PC reached through Tailscale. A `pb_data/` volume holds the data, with nightly backups to S3-compatible storage.

## 7. Testing strategy

- **Engine** (Vitest, fixed dates). Cover:
  - cleared, partial and missed days, including several missed in a row;
  - timezone and DST boundaries, and reset hours other than midnight;
  - Rest Day, Streak Shield, and a level-up at day close.
- **Sync** (Vitest with a fake server): push/pull, last-write-wins, soft deletes, interrupted sync.
- **On device**: a manual checklist per phase in Expo Go and on the APK build.

## 8. Decisions still open

- Server hosting (VPS or home PC + Tailscale): needed by Phase 2.
- XP curve and rank thresholds: start simple, tune after two weeks of real use.
- Whether quest targets scale with level.
- Private GitHub repo or local-only Git.
