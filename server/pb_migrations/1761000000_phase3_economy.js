/// <reference path="../pb_data/types.d.ts" />

// Phase 3: store purchases carry kind/day/result, settings gain onboarding and
// sound flags, and skill uses (Rest Day) sync as their own collection.

const OWNER_ONLY = 'owner = @request.auth.id';

migrate(
  (app) => {
    const settings = app.findCollectionByNameOrId('settings');
    settings.fields.add(new BoolField({ name: 'onboarded' }));
    settings.fields.add(new BoolField({ name: 'sound_on' }));
    app.save(settings);

    const purchases = app.findCollectionByNameOrId('purchases');
    purchases.fields.add(new TextField({ name: 'kind' }));
    purchases.fields.add(new TextField({ name: 'day' }));
    purchases.fields.add(new TextField({ name: 'result_json', max: 20000 }));
    app.save(purchases);

    const users = app.findCollectionByNameOrId('users');
    const skillUses = new Collection({
      type: 'base',
      name: 'skill_uses',
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
        { name: 'skill', type: 'text' },
        { name: 'day', type: 'text' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE INDEX idx_skill_uses_owner_updated ON skill_uses (owner, updated)'],
    });
    app.save(skillUses);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId('skill_uses'));

    const purchases = app.findCollectionByNameOrId('purchases');
    for (const name of ['kind', 'day', 'result_json']) purchases.fields.removeByName(name);
    app.save(purchases);

    const settings = app.findCollectionByNameOrId('settings');
    for (const name of ['onboarded', 'sound_on']) settings.fields.removeByName(name);
    app.save(settings);
  },
);
