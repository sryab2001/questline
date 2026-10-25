/// <reference path="../pb_data/types.d.ts" />

// Journal (synced, owner-only), the "AI may read my writing" switch, and report periods
// (weekly / monthly).

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
    app.save(
      syncedCollection(app, 'journal', [
        { name: 'day', type: 'text' },
        { name: 'mood', type: 'number', onlyInt: true },
        { name: 'energy', type: 'number', onlyInt: true },
        { name: 'text', type: 'text', max: 50000 },
      ]),
    );

    const settings = app.findCollectionByNameOrId('settings');
    settings.fields.add(new BoolField({ name: 'ai_reads_writing' }));
    app.save(settings);

    const reports = app.findCollectionByNameOrId('reports');
    reports.fields.add(new TextField({ name: 'period' }));
    app.save(reports);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('journal'));
    const settings = app.findCollectionByNameOrId('settings');
    settings.fields.removeByName('ai_reads_writing');
    app.save(settings);
    const reports = app.findCollectionByNameOrId('reports');
    reports.fields.removeByName('period');
    app.save(reports);
  },
);
