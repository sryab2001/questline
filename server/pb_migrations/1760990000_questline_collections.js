/// <reference path="../pb_data/types.d.ts" />

// Questline sync schema. Each collection mirrors a table in the app's local
// SQLite database (src/db/schema.ts) with the same snake_case field names.
// Ids are generated on the phone (UUIDv7), so the id field accepts them.

const OWNER_ONLY = 'owner = @request.auth.id';

/** Field sets per collection, beyond the shared sync fields. */
const TABLES = {
  settings: [
    { type: 'text', name: 'player_name' },
    { type: 'text', name: 'time_zone' },
    { type: 'number', name: 'reset_hour', onlyInt: true },
    { type: 'number', name: 'last_seen_level', onlyInt: true },
    { type: 'number', name: 'morning_hour', onlyInt: true },
    { type: 'number', name: 'warning_hour', onlyInt: true },
  ],
  habits: [
    { type: 'text', name: 'name' },
    { type: 'text', name: 'stat' },
    { type: 'number', name: 'target' },
    { type: 'text', name: 'unit' },
    { type: 'text', name: 'schedule' },
    { type: 'text', name: 'grade' },
    { type: 'number', name: 'sort_order', onlyInt: true },
    { type: 'bool', name: 'archived' },
    { type: 'text', name: 'start_day' },
  ],
  logs: [
    { type: 'text', name: 'habit_id' },
    { type: 'text', name: 'day' },
    { type: 'number', name: 'amount' },
  ],
  day_results: [
    { type: 'text', name: 'day' },
    { type: 'number', name: 'cleared', onlyInt: true },
    { type: 'number', name: 'total', onlyInt: true },
    { type: 'text', name: 'outcomes_json', max: 200000 },
    { type: 'bool', name: 'acknowledged' },
    { type: 'text', name: 'penalty_json', max: 20000 },
    { type: 'text', name: 'survival_status' },
  ],
  stat_allocations: [
    { type: 'text', name: 'stat' },
    { type: 'number', name: 'points', onlyInt: true },
  ],
  store_items: [
    { type: 'text', name: 'name' },
    { type: 'number', name: 'cost', onlyInt: true },
    { type: 'text', name: 'kind' },
  ],
  purchases: [
    { type: 'text', name: 'store_item_id' },
    { type: 'number', name: 'cost', onlyInt: true },
  ],
  unlocks: [
    { type: 'text', name: 'kind' },
    { type: 'text', name: 'ref' },
    { type: 'bool', name: 'equipped' },
  ],
  class_quests: [
    { type: 'text', name: 'name' },
    { type: 'text', name: 'rating' },
    { type: 'text', name: 'steps_json', max: 200000 },
    { type: 'number', name: 'current_step', onlyInt: true },
    { type: 'text', name: 'status' },
  ],
};

const EXTRA_INDEXES = {
  day_results: (name) => [`CREATE UNIQUE INDEX idx_${name}_owner_day ON ${name} (owner, day)`],
};

migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');

    // Accounts are created by the admin only; no public sign-up.
    users.createRule = null;
    // Stay logged in for 90 days between syncs.
    users.authToken.duration = 90 * 24 * 60 * 60;
    app.save(users);

    for (const [name, fields] of Object.entries(TABLES)) {
      const collection = new Collection({
        type: 'base',
        name,
        listRule: OWNER_ONLY,
        viewRule: OWNER_ONLY,
        createRule: '@request.auth.id != "" && owner = @request.auth.id',
        updateRule: `${OWNER_ONLY} && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)`,
        deleteRule: null, // the app soft-deletes via deleted_at
        fields: [
          {
            name: 'id',
            type: 'text',
            system: true,
            primaryKey: true,
            required: true,
            min: 1,
            max: 36,
            pattern: '^[a-z0-9-]+$',
            autogeneratePattern: '[a-z0-9]{15}',
          },
          { name: 'owner', type: 'relation', collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
          // Client-side timestamps (ms). 0 means "not set" for deleted_at.
          { name: 'created_at', type: 'number', onlyInt: true },
          { name: 'updated_at', type: 'number', onlyInt: true },
          { name: 'deleted_at', type: 'number', onlyInt: true },
          ...fields,
          // Server timestamps; `updated` is the pull cursor.
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [`CREATE INDEX idx_${name}_owner_updated ON ${name} (owner, updated)`, ...(EXTRA_INDEXES[name]?.(name) ?? [])],
      });
      app.save(collection);
    }
  },
  (app) => {
    for (const name of Object.keys(TABLES).reverse()) {
      app.delete(app.findCollectionByNameOrId(name));
    }
  },
);
