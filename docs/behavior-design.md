# Questline: Behaviour Design Proposal

How to make Questline's mechanics rest on habit science instead of generic gamification.

**Status (2026-10-20): all three tiers implemented**, except the commitment wager (deferred). Never-miss-twice was chosen over manhwa-harsh penalties; mastered quests give half EXP plus a permanent stat bonus; weekly check-ins are on. Tunable numbers live in `src/engine/rules.ts`; players can read the rules and drop odds in-app under Settings → How the System works.

## The core idea

Reinforcement psychology (Thorndike, Pavlov, Skinner; dopamine reward-prediction error) is what attention apps tune to keep you opening them. A **habit** is different: behaviour triggered automatically by a cue in your life, through repetition in a consistent context ([Gardner et al. 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3552971/)). Two habit-app studies matter most here:

- **Reminders help repetition but block habit formation.** In a 4-week study, time-based reminders increased how often people did the behaviour, but **event-based cues** ("after X, I do Y") built automaticity. Positive reinforcement alone had little effect ([Stawarz, Cox & Blandford, CHI 2015](https://discovery.ucl.ac.uk/id/eprint/1468224/)).
- **Reminders and streaks create dependency.** Users relied on the app instead of the cue. When they dropped the app, the behaviour went with it ([Renfree et al., CHI 2016](https://discovery-pp.ucl.ac.uk/id/eprint/1477627)).

**Design goal:** use reward mechanics to drive early repetitions in a stable context, move the trigger from the app to a real-life cue, and *graduate* habits once they're automatic. Success is measured by habit strength, not by how often the app is opened.

## What the current design gets wrong

| Current mechanic | Problem in the research | Source |
|---|---|---|
| Any missed day: full penalty and streak reset | Missing one day barely affects habit formation; longer gaps do. Broken streaks make people drop off, and highlighting failure "typically doesn't work". | [Lally et al. 2010](https://www.thebehavioralscientist.com/articles/how-long-to-form-a-habit); [Silverman & Barasch 2023](https://www.colorado.edu/business/faculty-research/2023/04/19/or-track-how-broken-streaks-affect-consumer-decisions) |
| Harsh "you failed" framing | Self-compassion after failure *increases* self-improvement motivation compared with self-criticism | [Breines & Chen 2012](https://pubmed.ncbi.nlm.nih.gov/22645164/) |
| Clock-time reminders only | Reminders build dependency; event cues build automaticity | Stawarz 2015; Renfree 2016 |
| Every reward fixed and predictable | Dopamine responds to *unexpected* reward; fully predicted reward gets no response. Expected tangible rewards undermine intrinsic motivation. | [Hollerman & Schultz 1998](https://www.pdn.cam.ac.uk/system/files/documents/1998-hollerman-natneurosci.pdf); [Deci, Koestner & Ryan 1999](https://home.ubalt.edu/ntygmitc/642/Articles%20syllabus/Deci%20Koestner%20Ryan%20meta%20IM%20psy%20bull%2099.pdf) |
| All-or-nothing targets | Behavioural complexity is the strongest predictor of how long habits take to form | 2024 meta-analysis cited in [Lally coverage](https://www.thebehavioralscientist.com/articles/how-long-to-form-a-habit) |
| No end state: habits are tracked forever | Dependency (Renfree 2016). The app should become less necessary over time. | |

Kept as-is, because the evidence supports them: flexible timing, meaning "anytime today" rather than a fixed slot. Rigid time windows produced *fewer* gym visits and less lasting habit than flexible ones ([Beshears, Milkman et al. 2021](https://ideas.repec.org/a/inm/ormnsc/v67y2021i7p4139-4171.html)).

## Proposed mechanics

Ranked by strength of evidence × fit with the Solo Leveling/Overgeared theme.

### Tier 1: strong evidence, core changes

**1. Trigger lines (implementation intentions)**
- Each quest gets an optional **cue**: "After I *brush my teeth*, I will do *50 push-ups*", plus an optional place.
- If-then plans have a medium-to-large effect on reaching goals: d = 0.65 across 94 tests ([Gollwitzer & Sheeran 2006](https://stafforini.com/works/gollwitzer-2006-implementation-intentions-and/)).
- The quest row shows the cue. The morning notification lists today's cues instead of just "Daily Quest has arrived".
- Theme: the System shows it as a **[Trigger]** condition on the quest.

**2. "Never miss twice": slips vs. failures**
- **First missed day = Slip:**
  - half penalty, no streak reset (the streak shows a crack);
  - a gentle message: *"One slip does not break a Player. Do not miss twice."*
- **Second consecutive miss = Failure:** the full penalty and a streak reset, as today.
- **Comeback bonus:** clearing the day after a slip or failure gives +50% EXP and gold, plus a "[Recovered]" notice. The most effective of 54 interventions in a 61,000-person megastudy was a small reward for *returning after a missed workout* ([Milkman et al., Nature 2021](https://www.scimex.org/newsfeed/which-programs-give-gym-goers-the-biggest-boost)).
- **Streak repair:** a slipped streak can be repaired by clearing the next day. Silverman & Barasch found the drop-off effect is weaker when streaks can be repaired.
- Streak Shields only absorb *Failures*, so they become more valuable.

**3. Habit Strength and Mastery (the app steps back)**
- **Strength meter (0–100%):** each quest gets one, modelled on Lally's curve.
  - It grows towards its ceiling with each completion, so about 66 completions reach about 95%.
  - A single miss dips it slightly; consecutive misses dip it more.
  - Days when the quest isn't scheduled don't count either way.
- **Weekly check-in:** once strength is at least 60%, the System asks 4 quick questions about that quest (1–7 scale). These are the validated **Self-Report Behavioural Automaticity Index** ([Gardner et al. 2012](https://pmc.ncbi.nlm.nih.gov/articles/PMC3552971/)): "*[Push-ups] is something…* I do automatically / I do without having to consciously remember / I do without thinking / I start doing before I realise I'm doing it."
- **Mastery trial:** at 85% strength with an average check-in score of 5.5 or more, the System offers it. Accepting turns the quest into a **Passive Skill**: *"[Passive Skill acquired: Iron Discipline (Push-ups)]"*. Then:
  - its reminders stop;
  - it gives a permanent stat bonus;
  - its daily EXP halves, because effort has moved elsewhere;
  - the System offers a new quest to take its place.
- **If a mastered habit decays:** when strength drops below 60%, the skill shows "[Weakened]", reminders return, and it reverts to a normal quest until it recovers.
- This is the main anti-dependency mechanic, and it fits the theme: Jinwoo's skills level up and become passive.

**4. Minimum Clear (elastic targets)**
- Each quest can have a **minimum** (e.g. 10 of 100 push-ups, or 2 minutes of meditation).
- On a bad day, reaching the minimum counts as **[Minimum Clear]**:
  - no penalty;
  - the streak holds;
  - 30% of the EXP;
  - half the strength growth.
- This keeps the cue→behaviour link alive, which matters more early on than the volume does (Fogg's *Tiny Habits*; complexity slows habit formation).

### Tier 2: good evidence, motivation layer

**5. Variable loot drops (surprise rewards)**
- The fixed EXP and gold stay. On top of that, each clear has a hidden chance of a **drop**: gold pouch, EXP scroll, MP potion or, rarely, a Streak Shield.
- Drop rarities follow the Overgeared ladder: Normal 60%, Rare 25%, Epic 10%, Unique 4%, Legendary 1%.
- There's also a small chance of a **Critical Clear** (×2 EXP).
- Each roll is *seeded by quest + day*, so undoing and redoing can't re-roll it, and it syncs identically across devices.
- Why surprise and not just more fixed reward: unexpected reward drives the dopamine learning signal (Schultz), and *unexpected* rewards don't carry the motivation-undermining effect of *expected* tangible ones (Deci et al.). The drops are bonus, never the reason to act.

**6. Fresh-start Gates**
- **New week:** every Monday a **Gate opens**, a weekly quest such as "Clear 5 of 7 days".
- **New month:** each month is a **Season**, with a recap and a season title.
- **After a broken streak:** the next landmark offers **Reawakening**, a re-plan screen to lower targets, set minimums and pick a *new, small* streak goal (Barasch suggests offering a new goal after a break).
- People pursue goals more after temporal landmarks: new week, new month, birthdays ([Dai, Milkman & Riis 2014](https://faculty.wharton.upenn.edu/wp-content/uploads/2014/06/Dai_Fresh_Start_2014_Mgmt_Sci.pdf)).

**7. Goal-gradient pushes and endowed progress**
- **Weekly Gate card:** it starts with one slot already stamped ("Gate entry"). A car-wash loyalty card with 2 of 10 stamps pre-filled was completed 34% of the time vs 19% ([Nunes & Drèze 2006](https://encyclopedia.pub/entry/38231)).
- **Last goal:** when one goal is left, it's highlighted with the bonus waiting ("1 goal left: +100 EXP clear bonus"). People speed up as they near a reward ([Kivetz, Urminsky & Zheng 2006](https://business.columbia.edu/faculty/research/goal-gradient-hypothesis-resurrected-purchase-acceleration-illusionary-goal)).

**8. Temptation bundling**
- An optional "Only while…" pairing per quest (e.g. *only listen to my audiobook while running*), shown on the quest and in its reminder.
- 51% more gym visits in the original study, though the effect faded over time ([Milkman, Minson & Volpp 2014](https://repository.upenn.edu/oid_papers/150)).

### Tier 3: weaker or contested evidence, optional

**9. Identity titles:** mastered habits grant identity titles ("Runner", "Reader"), and quests can be phrased as identity. This comes from "being a voter" vs "voting" ([Bryan et al. 2011](https://pmc.ncbi.nlm.nih.gov/articles/PMC3150938)), but a larger field replication found no effect.

**10. Quest upgrades (adaptive difficulty)**
- **After 14 clean days:** the System offers "Quest upgrade: 50 → 60 push-ups (grade D → C)". It's opt-in, supporting both competence and autonomy (self-determination theory).
- **After repeated failures:** it offers a downgrade, or a switch to the minimum.

**11. Daily Report (peak-end):** the next morning, a short recap of yesterday's gains and habit-strength changes, ending on the best moment.

**12. Commitment wager:** an opt-in gold stake on a week's Gate. This is effective for people who choose it, but punishing for those who don't. Deferred.

## Guardrails (what makes this different from attention apps)

- **The success metric is habit strength, never time in the app.** There are no feeds or infinite lists, and nothing exists to keep you scrolling.
- **The app is designed to need you less.** Mastered quests stop sending reminders.
- **Notifications are capped:** at most morning, warning and penalty-quest alerts. Cue-based text, no guilt.
- **Drops are free bonuses.** Nothing random is ever bought with real money. Drop odds are documented here and shown in a help screen.
- **Penalty copy is stern but never shaming,** in the System's voice: cold, factual, forward-looking.

## Data model impact (for later)

- **`habits` gains:** `cue`, `place`, `bundle`, `min_target`, `mastered_at`.
- **New table `checkins`:** habit_id, day, the 4 scores.
- **Computed by the engine** from existing day results, with no new storage: slip vs failure, comeback, drops, strength.
- **`day_results` outcomes gain a per-goal `min` flag**, recording a Minimum Clear.
- One app migration and one server migration.

## Reward redesign (Phase 5.5)

The first economy paid gold per quest, so income grew with every quest added (a test profile with 6 quests held 33k gold after 80 days) and Store prices stopped meaning anything. Items mostly boosted EXP, and random boxes sold chances for currency. The redesign follows what the research says about rewards that last:

- **Informational, not controlling.** Expected tangible rewards lowered intrinsic motivation (d ≈ −0.40) while feedback on competence raised it, across 128 experiments ([Deci, Koestner & Ryan 1999/2001](https://www.selfdeterminationtheory.org/SDT/documents/2001_DeciKoestnerRyan.pdf)). So the main long-term rewards describe growth: the **Hunter's Record** (real totals, last 30 vs previous 30 days, personal bests) and the **Shadow Army** (habits that now run on their own).
- **Visible progress and small wins** ([Amabile & Kramer, *The Progress Principle*](https://www.library.hbs.edu/working-knowledge/how-small-wins-unleash-creativity)) and the **goal gradient** ([Kivetz, Urminsky & Zheng 2006](https://business.columbia.edu/faculty/research/goal-gradient-hypothesis-resurrected-purchase-acceleration-illusionary-goal)): **Main Quests** split distant goals into chapters of near ones, every reward shows a progress bar, and Record titles mark 10×/50×/100× the daily target.
- **Experiences over things, chosen in advance** ([Van Boven & Gilovich 2003](https://cdn.vanderbilt.edu/vu-wp0/wp-content/uploads/sites/59/2011/05/06143905/to-do-or-to-have.pdf)): **Bounties** are real rewards committed to a chapter or quest, so the anticipation is part of the payoff; the Store nudges toward experiences.
- **Temptation bundling** ([Milkman, Minson & Volpp 2014](https://repository.upenn.edu/oid_papers/150), +51% gym visits early, fading over time): **Unlocks** turn a guilty pleasure into a free permission the moment the Daily Quest is kept: immediate, not bought.
- **Gold as days of effort.** About 100 G per kept day, scaled by difficulty rather than quest count, so prices read as days ("movie night ≈ 5 days"). Applied from the update day on; earlier gold is untouched.
- **Gear that changes rules, not just numbers** (forgiven slips, better Minimum Clears, cheaper Rest Days), plus **the Forge** for meaningful choice with duplicates. Recalling what you learned when clearing a Main Quest quest is retrieval practice.
- **Guardrails kept:** nothing random is sold (boxes removed), surprises stay free and can be turned off, no artificial scarcity or countdowns ([Chou on habit-gamification traps](https://yukaichou.com/gamification-analysis/habit-formation-gamification-octalysis-design/)).
