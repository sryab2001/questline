// Opt-in: runs only when PB_TEST_URL, PB_TEST_EMAIL and PB_TEST_PASSWORD point at a
// throwaway PocketBase with server/pb_migrations applied (see server/README.md).
import { describe, expect, it } from 'vitest';

import { PbClient, PbError } from './client';
import { SYNC_TABLES, toLocal, toRemote } from './tables';

const PB_TEST_URL = process.env.PB_TEST_URL;
const PB_TEST_EMAIL = process.env.PB_TEST_EMAIL;
const PB_TEST_PASSWORD = process.env.PB_TEST_PASSWORD;
const run = PB_TEST_URL && PB_TEST_EMAIL && PB_TEST_PASSWORD ? describe : describe.skip;

const habits = SYNC_TABLES.find((t) => t.name === 'habits')!;
const settingsTable = SYNC_TABLES.find((t) => t.name === 'settings')!;

run('PocketBase round trip', () => {
  it('upserts with client ids and pulls changes by cursor', async () => {
    const client = new PbClient(PB_TEST_URL!);
    const auth = await client.authWithPassword(PB_TEST_EMAIL!, PB_TEST_PASSWORD!);
    client.setToken(auth.token);
    const userId = auth.record.id;

    const id = `0192f5a8-0000-7000-8000-${Date.now().toString(16).padStart(12, '0')}`;
    const row = {
      id,
      createdAt: new Date(1000),
      updatedAt: new Date(2000),
      deletedAt: null,
      dirty: true,
      name: 'Push-ups',
      stat: 'STR',
      target: 100,
      unit: 'reps',
      schedule: 'daily',
      grade: 'E',
      sortOrder: 0,
      archived: false,
      startDay: '2026-10-20',
    };

    // The engine's upsert: PATCH, and on 404 create with the client id.
    const body = toRemote(habits, row, userId);
    const { id: _ignored, ...patch } = body;
    await expect(client.update('habits', id, patch)).rejects.toMatchObject({ status: 404 });
    await client.create('habits', body);
    await client.update('habits', id, { ...patch, name: 'Push-ups+', updated_at: 3000 });

    const listed = await client.list('habits', 1, 50, `updated >= "2000-01-01 00:00:00.000Z"`);
    const rec = listed.items.find((r) => r.id === id)!;
    expect(toLocal(habits, rec)).toMatchObject({ id, name: 'Push-ups+', updatedAt: new Date(3000), dirty: false });

    // Settings: per-user remote id maps back to the local singleton.
    const s = toRemote(
      settingsTable,
      {
        id: 'settings',
        createdAt: new Date(1),
        updatedAt: new Date(2),
        deletedAt: null,
        dirty: true,
        playerName: 'Jin',
        timeZone: 'UTC',
        resetHour: 0,
        serverUrl: null,
        lastPullAt: null,
        lastSeenLevel: 1,
        morningHour: 7,
        warningHour: 21,
      },
      userId,
    );
    const { id: sid, ...sPatch } = s;
    try {
      await client.update('settings', String(sid), sPatch);
    } catch (e) {
      if (!(e instanceof PbError && e.status === 404)) throw e;
      await client.create('settings', s);
    }
    const settingsList = await client.list('settings', 1, 10, '');
    expect(toLocal(settingsTable, settingsList.items[0])).toMatchObject({ id: 'settings', playerName: 'Jin' });
  });
});
