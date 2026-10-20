/// <reference path="../pb_data/types.d.ts" />

// Behaviour design: quest cues/minimums/mastery, settings title and surprises,
// plus check-ins and events collections.

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
    habits.fields.add(new TextField({ name: 'cue' }));
    habits.fields.add(new TextField({ name: 'place' }));
    habits.fields.add(new TextField({ name: 'bundle' }));
    habits.fields.add(new NumberField({ name: 'min_target' }));
    habits.fields.add(new NumberField({ name: 'mastered_at', onlyInt: true }));
    habits.fields.add(new TextField({ name: 'mastery_name' }));
    habits.fields.add(new TextField({ name: 'mastery_title' }));
    app.save(habits);

    const settings = app.findCollectionByNameOrId('settings');
    settings.fields.add(new BoolField({ name: 'surprises_on' }));
    settings.fields.add(new TextField({ name: 'title' }));
    app.save(settings);

    app.save(
      syncedCollection(app, 'checkins', [
        { name: 'habit_id', type: 'text' },
        { name: 'day', type: 'text' },
        { name: 'scores_json', type: 'text' },
        { name: 'avg', type: 'number' },
      ]),
    );
    app.save(
      syncedCollection(app, 'events', [
        { name: 'kind', type: 'text' },
        { name: 'ref', type: 'text' },
        { name: 'day', type: 'text' },
        { name: 'data_json', type: 'text', max: 20000 },
      ]),
    );
  },
  (app) => {
    for (const name of ['events', 'checkins']) app.delete(app.findCollectionByNameOrId(name));

    const settings = app.findCollectionByNameOrId('settings');
    for (const name of ['surprises_on', 'title']) settings.fields.removeByName(name);
    app.save(settings);

    const habits = app.findCollectionByNameOrId('habits');
    for (const name of ['cue', 'place', 'bundle', 'min_target', 'mastered_at', 'mastery_name', 'mastery_title']) {
      habits.fields.removeByName(name);
    }
    app.save(habits);
  },
);
