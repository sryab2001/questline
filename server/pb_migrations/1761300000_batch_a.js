/// <reference path="../pb_data/types.d.ts" />

// Batch A: screen-time Limit Quests (habits.limit_source) and routines.

const OWNER_ONLY = 'owner = @request.auth.id';

function syncedCollection(app, name, fields) {
  const users = app.findCollectionByNameOrId('users');
  return new Collection({
    type: 'base',
    name,
    listRule: OWNER_ONLY,
    viewRule: OWNER_ONLY,
    createRule: '@request.auth.id != "" && owner = @request.auth.id',
    updateRule: `${OWNER_ONLY} && (@request.body.owner:isset = false || @request.body.owner = @request.auth.id)`,
    deleteRule: null,
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
      { name: 'created_at', type: 'number', onlyInt: true },
      { name: 'updated_at', type: 'number', onlyInt: true },
      { name: 'deleted_at', type: 'number', onlyInt: true },
      ...fields,
      { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
      { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
    ],
    indexes: [`CREATE INDEX idx_${name}_owner_updated ON ${name} (owner, updated)`],
  });
}

migrate(
  (app) => {
    const habits = app.findCollectionByNameOrId('habits');
    habits.fields.add(new TextField({ name: 'limit_source' }));
    app.save(habits);

    app.save(
      syncedCollection(app, 'routines', [
        { name: 'name', type: 'text' },
        { name: 'habit_ids_json', type: 'text', max: 20000 },
        { name: 'sort_order', type: 'number', onlyInt: true },
      ]),
    );
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('routines'));
    const habits = app.findCollectionByNameOrId('habits');
    habits.fields.removeByName('limit_source');
    app.save(habits);
  },
);
