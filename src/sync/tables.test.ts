import { describe, expect, it } from 'vitest';

import type { PbRecord } from './client';
import { remoteUpdatedAt, SYNC_TABLES, toLocal, toRemote } from './tables';

const byName = (name: string) => SYNC_TABLES.find((t) => t.name === name)!;
const USER = 'user123';

describe('toRemote', () => {
  it('maps a habit row to snake_case fields with ms timestamps and owner', () => {
    const body = toRemote(
      byName('habits'),
      {
        id: 'abc',
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
      },
      USER,
    );
    expect(body).toEqual({
      owner: USER,
      id: 'abc',
      created_at: 1000,
      updated_at: 2000,
      deleted_at: 0,
      name: 'Push-ups',
      stat: 'STR',
      target: 100,
      unit: 'reps',
      schedule: 'daily',
      grade: 'E',
      sort_order: 0,
      archived: false,
      start_day: '2026-10-20',
    });
    expect(body).not.toHaveProperty('dirty');
  });

  it('keeps device-only settings off the server and gives settings a per-user id', () => {
    const body = toRemote(
      byName('settings'),
      {
        id: 'settings',
        createdAt: new Date(1),
        updatedAt: new Date(2),
        deletedAt: null,
        dirty: true,
        playerName: 'Jin',
        timeZone: 'Asia/Kolkata',
        resetHour: 0,
        serverUrl: 'https://x',
        lastPullAt: new Date(5),
        lastSeenLevel: 3,
        morningHour: 7,
        warningHour: 21,
      },
      USER,
    );
    expect(body.id).toBe(`settings-${USER}`);
    expect(body).not.toHaveProperty('server_url');
    expect(body).not.toHaveProperty('last_pull_at');
    expect(body.player_name).toBe('Jin');
  });

  it('sends nullable text as an empty string', () => {
    const body = toRemote(
      byName('day_results'),
      {
        id: 'd1',
        createdAt: new Date(1),
        updatedAt: new Date(2),
        deletedAt: null,
        dirty: true,
        day: '2026-10-19',
        cleared: 1,
        total: 2,
        outcomesJson: '[]',
        acknowledged: false,
        penaltyJson: null,
        survivalStatus: null,
      },
      USER,
    );
    expect(body.penalty_json).toBe('');
    expect(body.survival_status).toBe('');
  });
});

describe('toLocal', () => {
  const rec = (fields: Record<string, unknown>): PbRecord => ({ id: 'x', updated: '2026-10-20 10:00:00.000Z', ...fields });

  it('turns server records back into clean local rows', () => {
    const row = toLocal(
      byName('logs'),
      rec({ id: 'log1', owner: USER, created_at: 10, updated_at: 20, deleted_at: 0, habit_id: 'h1', day: '2026-10-20', amount: 25 }),
    );
    expect(row).toEqual({
      id: 'log1',
      dirty: false,
      createdAt: new Date(10),
      updatedAt: new Date(20),
      deletedAt: null,
      habitId: 'h1',
      day: '2026-10-20',
      amount: 25,
    });
  });

  it('restores nulls for empty nullable fields and keeps soft deletes', () => {
    const row = toLocal(
      byName('day_results'),
      rec({ created_at: 1, updated_at: 2, deleted_at: 99, day: 'd', cleared: 0, total: 0, outcomes_json: '[]', acknowledged: true, penalty_json: '', survival_status: '' }),
    );
    expect(row.penaltyJson).toBeNull();
    expect(row.survivalStatus).toBeNull();
    expect(row.deletedAt).toEqual(new Date(99));
    expect(row.acknowledged).toBe(true);
  });

  it('maps the per-user settings id back to the local singleton and ignores device-only fields', () => {
    const row = toLocal(byName('settings'), rec({ id: `settings-${USER}`, player_name: 'Jin', updated_at: 5 }));
    expect(row.id).toBe('settings');
    expect(row).not.toHaveProperty('serverUrl');
    expect(row).not.toHaveProperty('lastPullAt');
  });

  it('round-trips through toRemote', () => {
    const t = byName('habits');
    const original = {
      id: 'h',
      createdAt: new Date(1),
      updatedAt: new Date(2),
      deletedAt: null,
      dirty: false,
      name: 'Read',
      stat: 'INT',
      target: 20,
      unit: 'pages',
      schedule: '1,3,5',
      grade: 'C',
      sortOrder: 2,
      archived: true,
      startDay: '2026-10-01',
    };
    const remote = { ...toRemote(t, original, USER), updated: 'x' } as unknown as PbRecord;
    expect(toLocal(t, remote)).toEqual(original);
    expect(remoteUpdatedAt(remote)).toBe(2);
  });
});
