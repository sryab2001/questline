/// <reference path="../pb_data/types.d.ts" />

// Batch B: weekly AI reports (written by the server hook, read-only for players)
// and the per-player opt-in for the Sunday report.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users');
    app.save(
      new Collection({
        type: 'base',
        name: 'reports',
        listRule: 'owner = @request.auth.id',
        viewRule: 'owner = @request.auth.id',
        // Only the server writes reports (pb_hooks/questline_report.js).
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'owner', type: 'relation', collectionId: users.id, required: true, maxSelect: 1, cascadeDelete: true },
          // Last closed day the report covers.
          { name: 'through', type: 'text' },
          { name: 'body', type: 'text', max: 20000 },
          { name: 'model', type: 'text' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        ],
        indexes: ['CREATE INDEX idx_reports_owner_created ON reports (owner, created)'],
      }),
    );

    const settings = app.findCollectionByNameOrId('settings');
    settings.fields.add(new BoolField({ name: 'ai_report' }));
    app.save(settings);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('reports'));
    const settings = app.findCollectionByNameOrId('settings');
    settings.fields.removeByName('ai_report');
    app.save(settings);
  },
);
