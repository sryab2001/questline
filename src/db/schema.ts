import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

// Every synced table shares these columns. Ids are client-generated UUIDv7s so
// rows can be created offline and pushed to the server later.
const syncColumns = {
  id: text('id').primaryKey(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  /** True until the row has been pushed to the server. */
  dirty: integer('dirty', { mode: 'boolean' }).notNull().default(true),
};

export const settings = sqliteTable('settings', {
  ...syncColumns,
  playerName: text('player_name').notNull(),
  timeZone: text('time_zone').notNull(),
  resetHour: integer('reset_hour').notNull().default(0),
  serverUrl: text('server_url'),
  lastPullAt: integer('last_pull_at', { mode: 'timestamp_ms' }),
  /** Highest level the Level Up overlay has been shown for. */
  lastSeenLevel: integer('last_seen_level').notNull().default(1),
  /** Local hour for the "Daily Quest has arrived" notification. */
  morningHour: integer('morning_hour').notNull().default(7),
  /** Local hour for the "penalty incoming" warning. */
  warningHour: integer('warning_hour').notNull().default(21),
});

export const habits = sqliteTable('habits', {
  ...syncColumns,
  name: text('name').notNull(),
  stat: text('stat', { enum: ['STR', 'AGI', 'STA', 'INT', 'SENSE'] }).notNull(),
  target: real('target').notNull(),
  unit: text('unit').notNull().default(''),
  schedule: text('schedule').notNull().default('daily'),
  grade: text('grade', { enum: ['F', 'E', 'D', 'C', 'B', 'A', 'S'] }).notNull().default('E'),
  sortOrder: integer('sort_order').notNull().default(0),
  archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
  startDay: text('start_day').notNull(),
});

export const logs = sqliteTable(
  'logs',
  {
    ...syncColumns,
    habitId: text('habit_id').notNull(),
    day: text('day').notNull(),
    amount: real('amount').notNull(),
  },
  (t) => [index('logs_day_idx').on(t.day), index('logs_habit_day_idx').on(t.habitId, t.day)],
);

export const dayResults = sqliteTable(
  'day_results',
  {
    ...syncColumns,
    day: text('day').notNull(),
    cleared: integer('cleared').notNull(),
    total: integer('total').notNull(),
    /** Frozen per-goal outcome of the closed day (engine DayOutcome goals). */
    outcomesJson: text('outcomes_json').notNull().default('[]'),
    /** The player has seen the result (penalty screen dismissed). */
    acknowledged: integer('acknowledged', { mode: 'boolean' }).notNull().default(false),
    penaltyJson: text('penalty_json'),
    survivalStatus: text('survival_status'),
  },
  (t) => [uniqueIndex('day_results_day_idx').on(t.day)],
);

export const statAllocations = sqliteTable('stat_allocations', {
  ...syncColumns,
  stat: text('stat', { enum: ['STR', 'AGI', 'STA', 'INT', 'SENSE'] }).notNull(),
  points: integer('points').notNull(),
});

export const storeItems = sqliteTable('store_items', {
  ...syncColumns,
  name: text('name').notNull(),
  cost: integer('cost').notNull(),
  kind: text('kind', { enum: ['treat', 'shield', 'box'] }).notNull(),
});

export const purchases = sqliteTable('purchases', {
  ...syncColumns,
  storeItemId: text('store_item_id').notNull(),
  cost: integer('cost').notNull(),
});

export const unlocks = sqliteTable('unlocks', {
  ...syncColumns,
  kind: text('kind', { enum: ['title', 'item', 'skill', 'class'] }).notNull(),
  ref: text('ref').notNull(),
  equipped: integer('equipped', { mode: 'boolean' }).notNull().default(false),
});

export const classQuests = sqliteTable('class_quests', {
  ...syncColumns,
  name: text('name').notNull(),
  rating: text('rating').notNull(),
  stepsJson: text('steps_json').notNull(),
  currentStep: integer('current_step').notNull().default(0),
  status: text('status', { enum: ['active', 'cleared', 'abandoned'] }).notNull().default('active'),
});
