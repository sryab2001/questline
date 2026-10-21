/// <reference path="../pb_data/types.d.ts" />

// Urgent Quests: per-player frequency setting.
migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId('settings');
    settings.fields.add(new TextField({ name: 'urgent_frequency' }));
    app.save(settings);
  },
  (app) => {
    const settings = app.findCollectionByNameOrId('settings');
    settings.fields.removeByName('urgent_frequency');
    app.save(settings);
  },
);
