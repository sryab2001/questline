# Quest App: Game Design Notes

A habit tracker styled as the "System" from *Solo Leveling*, with item, class and title flavour from *Overgeared*.
Sources: Solo Leveling Wiki (System, Quests, The Preparation To Become Powerful), Overgeared Wiki (Ratings, Pagma's Successor class/quest).

## What the source material does

### Solo Leveling: the System
- **Daily Quest** "Preparation to Become Powerful": 100 push-ups, 100 sit-ups, 100 squats, 10 km run. 24-hour time limit.
  - Rewards: Status Recovery (full heal), +3 ability points, Random Loot Box.
  - Failure: the Player is moved to the **Penalty Zone** and must survive 4 hours (quest "Survival").
- **Quest types**: Daily, Main (large objectives, big rewards), Urgent/Emergency (triggered suddenly; must act now).
- **Status window**: Name, Level, Job, Title, HP, MP, Fatigue, plus five stats:
  - Strength: power and attack. Agility: reaction and evasion. Stamina: max HP and recovery.
  - Intelligence: max MP and MP recovery. Sense: perception and danger awareness.
- **Levelling**: every level-up raises all stats by +1. Ability points come from the daily quest.
- **Store**: buys consumables and gear with **Gold** (earned from kills, quests and selling).
  - Blessed Random Box gives "an item you want"; Cursed Random Box gives "an item you need".
- **Job Change Quest**: a one-time trial that unlocks a job (class).
- **Ranks**: Hunters are ranked E → D → C → B → A → S.

### Overgeared: Satisfy
- **Rating ladder** (items, classes, skills): Normal → Rare → Epic → Unique → Legendary → Myth.
  - The wiki gives colours only for Normal (white) and Epic (violet). The rest are our choice: Rare blue, Unique gold, Legendary orange, Myth red.
  - Any class rated Rare or higher is a **Hidden Class**.
- **Quest difficulty** uses letter grades: F, E, D, C, B, A, S, SS, SSS.
- **Class quests** are long chains of linked quests with **no time limit**, ending in a final quest.
- **Titles** carry permanent stat effects, e.g. "First Unique Item Maker: Dexterity +200".
- **World-first bonuses**: crafting the first Legendary item permanently raised all stats by +10.
- **Hidden stats** (Grid has Composure, Indomitable, Dignity, Insight, Dexterity) are earned through actions and story, not by spending points.
- **Item windows** show name, rating, conditions of use (level requirement), effects and flavour text.

## How it maps to the app

| Source mechanic | In the app |
|---|---|
| Daily Quest | The user's daily habits, each with a target (`[64/100] reps`). One time limit until the daily reset. |
| Daily Quest reward | Status Recovery (restores HP/MP), +3 ability points, a Random Box and Gold. |
| Penalty Zone / Survival | Missed dailies cost EXP and HP. An optional 4-hour "Survival" make-up quest halves the penalty. |
| HP | Streak health. Drops on misses; reaching 0 breaks the streak. |
| MP | Spent on **skills**, e.g. "Rest Day" (50 MP) to skip a day without penalty. Regenerates from completed goals. |
| Fatigue | Rises with streaks of heavy days and clears on rest days. Lowers EXP gain when high. |
| STR / AGI / STA / INT / SENSE | Each habit has a category that feeds one stat (workouts → STR, cardio → AGI, sleep/diet → STA, study → INT, mindfulness → SENSE). |
| Level-up | All stats +1, Status Recovery, Fatigue reset, sometimes a new skill. |
| Rank E → S | Driven by level thresholds. |
| Store + Gold | Gold from goals (+40 G) and daily clears (+150 G). The user defines real-life rewards (gaming hour, takeout) with gold prices. |
| Blessed / Cursed Random Box | Blessed gives a random reward from the user's wishlist. Cursed gives a bonus challenge with a large payout. |
| Urgent Quest | A surprise short quest (e.g. "Drink 500 ml of water within 30 min") for bonus rewards. |
| Main Quest | A big milestone goal (e.g. "Read 12 books this year"). |
| Class Quest chain (no time limit) | Long-term goals as linked steps with difficulty grades. Clearing the chain grants a Class (Hidden, rated). |
| Job Change | Unlocked at a level threshold. The class is chosen from the user's dominant stat or an earned class quest. |
| Titles | Achievements with permanent effects (e.g. "The Persistent: Indomitable +20, EXP +5%"). One equipped at a time. |
| First-clear bonuses | The first time ever doing something gives a permanent all-stat bonus. |
| Hidden stats | Indomitable (coming back after a miss), Composure (meditation streaks), Insight (journaling/reflection), Dignity (keeping hard commitments). Never directly spendable. |
| Item ratings | Equipment and rewards use the Normal → Myth ladder. Equipment gives stat bonuses and perks like Streak Shield. |

## Open questions
- XP curve and level thresholds for each rank.
- Whether quest targets scale with level (the manhwa's daily quest never scaled; a habit app probably should, optionally).
- Exact penalty numbers and how the Survival make-up quest picks its bonus task.
