# Questline: Build Plan

How we turn the design ([game-design.md](game-design.md)) and the screen mockups into a real Android app.

**Status (2026-10-21):** Phases 0–4 done, behaviour design shipped, server live on Oracle (Docker behind Caddy). Server packaged for a Linux VM (Oracle ARM) in `server/deploy/`.

**Decisions so far**
- Name: **Questline**
- Platform: **Android only**, a native app (no web or laptop version)
- Toolkit: **Expo (React Native + TypeScript)**
- Data: **on the phone first (SQLite), synced to a small PocketBase server**

## 1. Stack

| Layer | Choice | Why |
|---|---|---|
| App framework | Expo SDK 57 (matches Expo Go on the Play Store) + React Native + TypeScript | Officially recommended way to build React Native apps; no Android Studio needed |
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

### Phase 3: System economy (3–4 days) ✅
Also shipped in this round: app icon and splash, Awakening onboarding, history calendar, sounds and richer animations.

- Ability points (+3 per daily clear) and allocation.
- HP (streak health), MP, Fatigue; skill **Rest Day** (costs MP).
- Gold + **Store**: custom treats, Streak Shield, Blessed/Cursed Random Box.
- **Penalty** screen + Survival make-up quest (4-hour window).

### Phase 4: Polish (2–3 days) ✅
- Sounds and haptics on clear and level-up.
- History calendar (cleared, failed and shielded days).
- Urgent Quests (random short challenges via notification): optional, frequency-controlled, at most one a day, never penalised, seeded per day.

### Phase 5: Overgeared layer (4–6 days) ✅
- Achievements (14) granting titles with effects, first-clear all-stat bonuses and rated items.
- Items with ratings (Normal → Legendary) in weapon, armor and accessory slots, from Gates, achievements and Class Quests. Generated deterministically from their source.
- Hidden stats (Indomitable, Composure, Insight, Dignity), shown as a mirror with no gameplay effect.
- **Class Quests** (graded step chains or counted goals, no time limit) and the Job Change (level 10, 3-day trial, job from your top stats).
- Effects of items, titles and jobs apply only from the day they're equipped, never retroactively. No server migration needed (uses existing events and class_quests).

### Phase 5.5: Main Quests & reward redesign ✅
- **Main Quests**: goals split into chapters of Learn / Practice / Build quests, each chapter ending with a Boss. Chapters open in order; a one-line "what I learned" note on clear; a linked daily habit shows its days and totals; outline paste. Phase 5 Class Quests read as one-chapter quests.
- **Economy v2**: gold measures days of effort (about 100 G per kept day, scaled by difficulty, not by quest count), so Store prices read as days. Starts from the update day; earlier gold is untouched. Shields cost 5 days and you hold at most 2. Random boxes removed (nothing random is sold).
- **Gear that changes the rules** (forgiven slips, better Minimum Clears, cheaper Rest Days, longer Urgent Quests, Critical chance) and **the Forge** (3 items → 1 of the next rarity, result previewed). Unique+ drops carry gear.
- **Shadow Army**: mastered quests rise as named, ranked Shadows. **Hunter's Record**: real-world totals, last 30 vs previous 30 days, personal bests, milestone titles.
- **Unlocks** (free permissions when the Daily Quest is kept) and **Bounties** (real rewards committed in advance to a chapter or quest).
- Grounded in the research in docs/behavior-design.md: informational over controlling rewards, visible progress, goal gradient, experiential rewards, temptation bundling. No server migration needed.

### Phase 6: Android extras (2–3 days) ✅
- Home-screen widget (`react-native-android-widget`; `expo-widgets` is iOS-only in SDK 57) showing today's quests with a clear button per quest. It reads the database headless, refreshes every 30 minutes and whenever the app changes, and keeps its header (level, streak) from the last app snapshot.
- "✓ <quest>" buttons on the morning and evening notifications (up to three), "✓ DONE" on Urgent Quests. Handled by an `expo-task-manager` background task when the app is closed, and by a listener when it's open. Marking done is idempotent, and clearing the last quest cancels that evening's warning.
- New app entry `index.ts` registers the widget handler and the background task before the router loads.

### After Phase 6
- **Quest Board**: 8 ready-made Main Quests (GenAI Engineer, Couch to Half Marathon, Strength Foundations, Learn a Language A1→A2, Read 12 Books, Cook 20 Dishes, 8-Week Meditation, Personal Finance Basics) written as outlines in `src/engine/quest-board.ts`. Accepting one makes an editable copy and can add and link its daily quest. Later: publish your own Main Quests to the server so others on it can accept them (needs a server collection).
- **Batch A**: screen-time **Limit Quests** (local Expo module `modules/screen-time` reading Android usage stats; kept by staying under a daily limit; days without a reading don't count), **Instance Dungeon** focus timer for time-based quests, **Routines** (ordered chains run one tap per step), the **Voice of the World** announcer (original lines rendered with Kokoro-82M by `scripts/voice/generate.mjs`) plus custom sounds per event, and **EAS Update** (`runtimeVersion: fingerprint`, channels per build profile). Server migration `1761300000_batch_a.js` (habits.limit_source, routines).
- **Batch B**: **weekly review** (Sunday/Monday prompt; week summary, quick target fixes, reflections, next week's focus and Main Quest goals, last week's plan checked), **patterns** (weak weekday, struggling and automatic quests) in the Record, and the **weekly AI report** written on the server: `server/pb_hooks/questline_report.*` (endpoint `POST /api/questline/report` and a Sunday cron) calls Groq with numbers and quest names only; the key lives in `/opt/questline/questline.env`. Server migration `1761400000_reports.js` (reports collection, settings.ai_report).
- **Hunter Analysis & Journal**: `src/engine/analysis.ts` computes patterns with their numbers (anchor habits from co-occurrence, judged on ordinary days only; weak weekdays; usual time of day from log timestamps; screen time vs missed quests; recovery after slips; Minimum Clear reliance; mood by habit from journal ratings; Main Quest pace and finish estimate) for the review week or the last Season. The AI report only ranks and explains these findings: prompts were tuned in a five-round pilot against Groq (`gpt-oss-20b`, low reasoning), fixing arithmetic errors, invented anchors and misread comparisons by pre-computing them. Weekly and Season reports; the app saves its analysis daily as a synced event for the scheduled jobs. Optional synced journal (mood, energy, text); a single "Let the System read my writing" switch controls whether journal text and reflections reach the AI (enforced on the server too). Server migration `1761500000_journal.js`.

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
