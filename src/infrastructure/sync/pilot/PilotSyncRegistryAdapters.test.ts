import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { LIFE_OS_STORE, LifeOsIndexedDb } from '../../persistence/indexed-db/LifeOsIndexedDb';
import { LIFE_OS_SYNC_REGISTRY } from '../LifeOsSyncRegistry';
import { structuredSyncFixtures } from './StructuredSyncFixtures';
import {
  applyRemotePilotRecord,
  buildPilotRuntimeRegistry,
  haveSamePilotSemanticContent,
  normalizePilotRecord,
  PILOT_DEPENDENCY_ORDER,
  prepareRemotePilotRecord,
  pilotRelationshipReferences,
} from './PilotSyncRegistryAdapters';

const goal = {
  schemaVersion: 1,
  id: 'goal-1',
  directionId: 'direction-1',
  title: 'Synthetic',
  description: null,
  whyImportant: null,
  whyNow: null,
  status: 'active',
  stage: 'active_goal',
  intentionLevel: null,
  horizon: null,
  progressType: null,
  progress: null,
  achievementCriteria: null,
  nextProgress: null,
  coverImage: { dataUrl: 'data:image/png;base64,AA==', mimeType: 'image/png', sizeBytes: 1 },
  createdAt: '2026-09-04T00:00:00.000Z',
  updatedAt: '2026-09-04T00:00:00.000Z',
  archivedAt: null,
  version: 1,
};

describe('PilotSyncRegistryAdapters', () => {
  it('preserves focused-session classification when a legacy peer omits it', () => {
    const existing = { ...structuredSyncFixtures().action_session, kind: 'focus' };
    const wire = normalizePilotRecord('action_session', existing);
    expect(wire.kind).toBe('focus');
    expect(prepareRemotePilotRecord('action_session', wire).kind).toBe('focus');
    const oldWire = { ...wire };
    delete oldWire.kind;
    expect(prepareRemotePilotRecord('action_session', oldWire, existing).kind).toBe('focus');
  });
  it('round-trips one sleep observation independently from the schedule', () => {
    const fixture = {
      schemaVersion: 1,
      id: 'sleep-observation:2026-10-03',
      cycleDate: '2026-10-03',
      nightCycleId: 'night-1',
      wentToBedAt: '2026-10-03T14:30:00.000Z',
      wokeAt: '2026-10-04T00:00:00.000Z',
      wakeSource: 'ALARM_QR',
      wakeOccurrenceId: 'wake-1',
      timeZone: 'Asia/Chita',
      confirmedAt: '2026-10-04T00:05:00.000Z',
      createdAt: '2026-10-04T00:01:00.000Z',
      updatedAt: '2026-10-04T00:05:00.000Z',
    };

    const wire = normalizePilotRecord('sleep_observation', fixture);

    expect(wire).toMatchObject({
      schemaVersion: 1,
      id: fixture.id,
      cycleDate: '2026-10-03',
    });
    expect(prepareRemotePilotRecord('sleep_observation', wire)).toEqual(fixture);
    expect(pilotRelationshipReferences('sleep_observation', wire)).toEqual([]);
  });

  it('keeps the historical session goal when an old peer does not know the field', () => {
    const existing = { ...structuredSyncFixtures().action_session, goalIdAtStart: 'goal-original' };
    const legacy = { ...existing } as Record<string, unknown>;
    delete legacy.goalIdAtStart;
    const wire = normalizePilotRecord('action_session', legacy);
    expect(wire).not.toHaveProperty('goalIdAtStart');
    expect(prepareRemotePilotRecord('action_session', wire, existing)).toMatchObject({
      goalIdAtStart: 'goal-original',
    });
    expect(
      prepareRemotePilotRecord('action_session', { ...wire, goalIdAtStart: null }, existing),
    ).toMatchObject({ goalIdAtStart: null });
  });
  it('validates and round-trips weekday capacity through sync', () => {
    const fixture = structuredSyncFixtures().time_capacity;
    const wire = normalizePilotRecord('time_capacity', fixture);
    expect(wire.version).toBeUndefined();
    expect(prepareRemotePilotRecord('time_capacity', wire)).toMatchObject({
      id: 'time-capacity',
      weekdays: [360, 360, 360, 360, 300, null, null],
      version: 1,
    });
    expect(() =>
      normalizePilotRecord('time_capacity', {
        ...fixture,
        weekdays: [0, null, null, null, null, null, null],
      }),
    ).toThrow();
  });

  it('round-trips a diary entry without transport versions and preserves reflection text', () => {
    const fixture = structuredSyncFixtures().diary_entry;
    const wire = normalizePilotRecord('diary_entry', fixture);

    expect(wire).not.toHaveProperty('version');
    expect(wire).toMatchObject({
      id: 'diary:day:2026-09-07',
      periodKey: 'day:2026-09-07',
      status: 'completed',
      payload: { worldBetter: 'Помог коллеге\nи позвонил родителям.' },
    });
    expect(pilotRelationshipReferences('diary_entry', wire)).toEqual([]);
    expect(prepareRemotePilotRecord('diary_entry', wire)).toMatchObject({ version: 1 });
    expect(prepareRemotePilotRecord('diary_entry', wire, { ...fixture, version: 7 })).toMatchObject(
      {
        version: 8,
      },
    );
  });

  it('round-trips a monthly direction focus with an optional direction relationship', () => {
    const fixture = structuredSyncFixtures().monthly_direction_focus;
    const wire = normalizePilotRecord('monthly_direction_focus', fixture);

    expect(wire).not.toHaveProperty('version');
    expect(wire).toMatchObject({
      id: 'monthly-direction-focus:2026-09',
      month: '2026-09',
      directionId: 'sync04-direction',
    });
    expect(pilotRelationshipReferences('monthly_direction_focus', wire)).toEqual([
      { entityType: 'direction', objectId: 'sync04-direction', required: true },
    ]);
    expect(
      pilotRelationshipReferences('monthly_direction_focus', { ...wire, directionId: null }),
    ).toEqual([]);
    expect(prepareRemotePilotRecord('monthly_direction_focus', wire)).toMatchObject({ version: 1 });
  });

  it('preserves scheduled time when an old peer omits new fields and clears it on an explicit null date', () => {
    const existing = {
      ...structuredSyncFixtures().life_action,
      plannedDate: '2026-09-28',
      estimateMinutes: 90,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 60,
    };
    const oldWire = { ...existing } as Record<string, unknown>;
    delete oldWire.estimateMinutes;
    delete oldWire.scheduledStartMinute;
    delete oldWire.scheduledDurationMinutes;
    const normalized = normalizePilotRecord('life_action', oldWire);
    expect(normalized.estimateMinutes).toBeUndefined();
    expect(normalized.scheduledStartMinute).toBeUndefined();
    expect(prepareRemotePilotRecord('life_action', normalized, existing)).toMatchObject({
      estimateMinutes: 90,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 60,
    });
    expect(
      prepareRemotePilotRecord('life_action', { ...normalized, plannedDate: null }, existing),
    ).toMatchObject({
      estimateMinutes: 90,
      scheduledStartMinute: null,
      scheduledDurationMinutes: null,
    });
    expect(
      prepareRemotePilotRecord(
        'life_action',
        { ...normalized, scheduledStartMinute: null, scheduledDurationMinutes: null },
        existing,
      ),
    ).toMatchObject({
      scheduledStartMinute: null,
      scheduledDurationMinutes: null,
    });
  });

  it('accepts an old peer clearing the date while retaining unknown block fields', () => {
    const staleBlock = {
      ...structuredSyncFixtures().life_action,
      plannedDate: null,
      scheduledStartMinute: 600,
      scheduledDurationMinutes: 60,
    };
    expect(normalizePilotRecord('life_action', staleBlock)).toMatchObject({
      plannedDate: null,
      scheduledStartMinute: null,
      scheduledDurationMinutes: null,
    });
  });

  it.each(['goal', 'life_action'] as const)(
    'round-trips %s trash timestamps through the existing mapper',
    (type) => {
      const timestamps = {
        deletedAt: null,
        lastDeletedAt: '2026-09-24T08:00:00.000Z',
        restoredFromTrashAt: '2026-09-25T09:00:00.000Z',
      };
      const wire = normalizePilotRecord(type, { ...structuredSyncFixtures()[type], ...timestamps });
      expect(wire).toMatchObject(timestamps);
      expect(prepareRemotePilotRecord(type, wire)).toMatchObject(timestamps);
      const deleted = {
        ...timestamps,
        deletedAt: timestamps.lastDeletedAt,
        restoredFromTrashAt: null,
      };
      const deletedWire = normalizePilotRecord(type, {
        ...structuredSyncFixtures()[type],
        ...deleted,
      });
      expect(prepareRemotePilotRecord(type, deletedWire)).toMatchObject(deleted);
      expect(haveSamePilotSemanticContent(type, wire, deletedWire)).toBe(false);
    },
  );

  it('round-trips recurrence restoration and purge fields plus occurrence generation', () => {
    const fixtures = structuredSyncFixtures();
    const fields = {
      removedAt: '2026-09-25T08:00:00.000Z',
      lastRemovedAt: '2026-09-24T08:00:00.000Z',
      restoredFromTrashAt: '2026-09-24T09:00:00.000Z',
      purgedAt: '2026-10-25T08:00:00.000Z',
      restorationGeneration: 2,
    };
    const wire = normalizePilotRecord('recurrence_rule', {
      ...fixtures.recurrence_rule,
      ...fields,
      paused: true,
    });
    expect(wire).toMatchObject(fields);
    expect(prepareRemotePilotRecord('recurrence_rule', wire)).toMatchObject(fields);
    const occurrence = {
      ruleId: 'rule',
      ruleRevision: 4,
      slot: '2026-09-25',
      originalDate: '2026-09-25',
      restorationGeneration: 2,
    };
    const actionWire = normalizePilotRecord('life_action', { ...fixtures.life_action, occurrence });
    expect(actionWire.occurrence).toEqual(occurrence);
    expect(prepareRemotePilotRecord('life_action', actionWire).occurrence).toEqual(occurrence);
  });

  it('normalizes legacy records with no trash fields to active defaults', () => {
    const fixtures = structuredSyncFixtures();
    for (const type of ['goal', 'life_action'] as const) {
      const legacy = Object.fromEntries(
        Object.entries(fixtures[type]).filter(
          ([key]) => !['deletedAt', 'lastDeletedAt', 'restoredFromTrashAt'].includes(key),
        ),
      );
      expect(prepareRemotePilotRecord(type, normalizePilotRecord(type, legacy))).toMatchObject({
        deletedAt: null,
        lastDeletedAt: null,
        restoredFromTrashAt: null,
      });
    }
    expect(
      prepareRemotePilotRecord(
        'recurrence_rule',
        normalizePilotRecord('recurrence_rule', fixtures.recurrence_rule),
      ),
    ).toMatchObject({
      removedAt: null,
      lastRemovedAt: null,
      restoredFromTrashAt: null,
      purgedAt: null,
      restorationGeneration: 0,
    });
  });
  it('round-trips scenario links without requiring tasks to still exist', () => {
    const wire = normalizePilotRecord('task_scenario', structuredSyncFixtures().task_scenario);
    expect(wire.version).toBeUndefined();
    expect(pilotRelationshipReferences('task_scenario', wire)).toEqual([
      { entityType: 'life_action', objectId: 'sync04-life_action', required: false },
    ]);
    expect(prepareRemotePilotRecord('task_scenario', wire)).toMatchObject({
      actionIds: ['sync04-life_action'],
      date: null,
      archived: false,
    });
    expect(() =>
      normalizePilotRecord('task_scenario', { ...wire, actionIds: ['a', 'b', 'c', 'd'] }),
    ).toThrow();
  });
  it.each(['sphere', 'direction'] as const)(
    'compares %s residual objects independently of key order while preserving array order',
    (type) => {
      const local = {
        ...structuredSyncFixtures()[type],
        futureFields: { score: 8, nested: { first: 1, second: 2 }, sequence: [1, 2] },
      };
      const incoming = Object.fromEntries(
        Object.entries({
          ...local,
          futureFields: { sequence: [1, 2], nested: { second: 2, first: 1 }, score: 8 },
        }).reverse(),
      );
      expect(haveSamePilotSemanticContent(type, local, incoming)).toBe(true);
      expect(
        haveSamePilotSemanticContent(type, local, {
          ...incoming,
          futureFields: { ...local.futureFields, score: 9 },
        }),
      ).toBe(false);
      expect(
        haveSamePilotSemanticContent(type, local, {
          ...incoming,
          futureFields: { ...local.futureFields, sequence: [2, 1] },
        }),
      ).toBe(false);
    },
  );
  it('reads focus and conversion relationships from normalized wire records without version', () => {
    const fixtures = structuredSyncFixtures();
    const wire = normalizePilotRecord('focus_period', fixtures.focus_period);
    expect(wire.version).toBeUndefined();
    expect(pilotRelationshipReferences('focus_period', wire)).toEqual([
      { entityType: 'goal', objectId: 'sync04-goal', required: true },
    ]);
    const converted = normalizePilotRecord('inbox_idea', {
      ...fixtures.inbox_idea,
      status: 'converted',
      targetType: 'action',
      targetId: 'sync04-life_action',
    });
    expect(pilotRelationshipReferences('inbox_idea', converted)).toEqual([
      { entityType: 'life_action', objectId: 'sync04-life_action', required: true },
    ]);
  });
  it('extracts an optional Goal link while preserving Decision and Sphere references', () => {
    expect(
      pilotRelationshipReferences('life_action', {
        goalId: 'goal-1',
        decisionId: 'decision-1',
        sphereId: 'sphere-1',
      }),
    ).toEqual([
      { entityType: 'decision', objectId: 'decision-1', required: true },
      { entityType: 'sphere', objectId: 'sphere-1', required: true },
      { entityType: 'goal', objectId: 'goal-1', required: true },
    ]);
    expect(pilotRelationshipReferences('life_action', {})).toEqual([]);
    expect(pilotRelationshipReferences('life_action', { goalId: null })).toEqual([]);
  });

  it('bridges optional Action parent and daily Direction fields without changing old wire records', () => {
    const fixtures = structuredSyncFixtures();
    const child = normalizePilotRecord('life_action', {
      ...fixtures.life_action,
      parentActionId: 'parent-1',
    });
    expect(child.parentActionId).toBe('parent-1');
    expect(pilotRelationshipReferences('life_action', child)).toContainEqual({
      entityType: 'life_action',
      objectId: 'parent-1',
      required: true,
    });
    const legacyChild: Record<string, unknown> = { ...fixtures.life_action };
    delete legacyChild.parentActionId;
    expect(normalizePilotRecord('life_action', legacyChild).parentActionId).toBeUndefined();
    expect(prepareRemotePilotRecord('life_action', legacyChild).parentActionId).toBeNull();
    const day = normalizePilotRecord('day', { ...fixtures.day, mainDirectionId: 'direction-1' });
    expect(day.mainDirectionId).toBe('direction-1');
    expect(pilotRelationshipReferences('day', day)).toContainEqual({
      entityType: 'direction',
      objectId: 'direction-1',
      required: true,
    });
    const legacyDay: Record<string, unknown> = { ...fixtures.day };
    delete legacyDay.mainDirectionId;
    expect(normalizePilotRecord('day', legacyDay).mainDirectionId).toBeUndefined();
    expect(prepareRemotePilotRecord('day', legacyDay).mainDirectionId).toBeNull();
  });

  it.each([{ goalId: 'sync04-goal', isNext: true }, { goalId: null, isNext: false }, {}])(
    'preserves bridge and legacy action data through wire normalization and apply %j',
    async (fields) => {
      const source = { ...structuredSyncFixtures().life_action };
      delete source.goalId;
      delete source.isNext;
      const record: Record<string, unknown> = { ...source, ...fields };
      const expected = { ...record, goalId: fields.goalId ?? null, isNext: fields.isNext ?? false };
      const expectedWire: Record<string, unknown> = { ...expected };
      delete expectedWire.version;
      const wire = JSON.parse(
        JSON.stringify(normalizePilotRecord('life_action', record)),
      ) as Record<string, unknown>;

      expect(wire).toEqual(expectedWire);
      expect(normalizePilotRecord('life_action', wire)).toEqual(expectedWire);
      const indexedDb = new LifeOsIndexedDb(new IDBFactory());
      const database = await indexedDb.open();
      try {
        await applyRemotePilotRecord(database, 'life_action', wire);
        const read = database
          .transaction(LIFE_OS_STORE.lifeActions)
          .objectStore(LIFE_OS_STORE.lifeActions);
        expect(await request<Record<string, unknown>>(read.get(String(record.id)))).toEqual({
          ...expected,
          version: 1,
        });
      } finally {
        database.close();
      }
    },
  );

  it('uses the complete real dependency order and excludes Goal covers', () => {
    expect(PILOT_DEPENDENCY_ORDER).toHaveLength(39);
    expect(PILOT_DEPENDENCY_ORDER.indexOf('sphere')).toBeLessThan(
      PILOT_DEPENDENCY_ORDER.indexOf('direction'),
    );
    expect(PILOT_DEPENDENCY_ORDER.indexOf('direction')).toBeLessThan(
      PILOT_DEPENDENCY_ORDER.indexOf('goal'),
    );
    expect(PILOT_DEPENDENCY_ORDER.indexOf('walk')).toBeLessThan(
      PILOT_DEPENDENCY_ORDER.indexOf('walk_capture'),
    );
    expect(normalizePilotRecord('goal', goal)).toMatchObject({
      id: 'goal-1',
      directionId: 'direction-1',
    });
    expect(normalizePilotRecord('goal', goal)).not.toHaveProperty('coverImage');
  });

  it('derives executable pilot stores and order from the central Sync Registry', () => {
    const registrations = LIFE_OS_SYNC_REGISTRY.map((registration) => ({
      ...registration,
      storeName: `sentinel-${registration.entityType}`,
    }));
    const runtime = buildPilotRuntimeRegistry(registrations);

    expect(
      runtime.map(({ registration }) => [registration.entityType, registration.storeName]),
    ).toContainEqual(['decision', 'sentinel-decision']);
    expect(runtime.map(({ registration }) => registration.entityType)).toEqual(
      PILOT_DEPENDENCY_ORDER,
    );
    expect(runtime).toHaveLength(39);
  });

  it('preserves a local Goal cover while applying structured remote data without Outbox echo', async () => {
    const indexedDb = new LifeOsIndexedDb(new IDBFactory());
    const database = await indexedDb.open();
    const seed = database.transaction(LIFE_OS_STORE.goals, 'readwrite');
    seed.objectStore(LIFE_OS_STORE.goals).put(goal);
    await done(seed);
    const remote = { ...normalizePilotRecord('goal', goal), title: 'Remote edit', version: 2 };
    await applyRemotePilotRecord(database, 'goal', remote);
    const read = database.transaction(LIFE_OS_STORE.goals).objectStore(LIFE_OS_STORE.goals);
    expect(await request<Record<string, unknown>>(read.get('goal-1'))).toMatchObject({
      title: 'Remote edit',
      coverImage: goal.coverImage,
    });
  });

  it('sets a remote-created Goal cover to null', async () => {
    const database = await new LifeOsIndexedDb(new IDBFactory()).open();
    await applyRemotePilotRecord(database, 'goal', normalizePilotRecord('goal', goal));
    const read = database.transaction(LIFE_OS_STORE.goals).objectStore(LIFE_OS_STORE.goals);
    expect(await request<Record<string, unknown>>(read.get('goal-1'))).toMatchObject({
      coverImage: null,
    });
  });

  it('syncs a Goal next step and keeps it when an older wire record omits the field', () => {
    const selected = normalizePilotRecord('goal', { ...goal, nextActionId: 'action-1' });
    expect(selected.nextActionId).toBe('action-1');
    const older = normalizePilotRecord('goal', goal);
    expect(older).not.toHaveProperty('nextActionId');
    expect(
      prepareRemotePilotRecord('goal', older, { ...goal, nextActionId: 'action-1' }),
    ).toMatchObject({ nextActionId: 'action-1' });
  });

  it('compares same-ID records by normalized semantic content, not local timestamps or version', () => {
    const sameContentFromAnotherDevice = Object.fromEntries(
      Object.entries({
        ...goal,
        createdAt: '2026-09-05T00:00:00.000Z',
        updatedAt: '2026-09-06T00:00:00.000Z',
        version: 91,
      }).filter(([key]) => key !== 'coverImage'),
    );

    expect(haveSamePilotSemanticContent('goal', goal, sameContentFromAnotherDevice)).toBe(true);
    expect(
      haveSamePilotSemanticContent('goal', goal, {
        ...sameContentFromAnotherDevice,
        title: 'Actually different',
      }),
    ).toBe(false);
  });

  it('regenerates receiver-local optimistic versions instead of trusting the remote version', () => {
    expect(
      prepareRemotePilotRecord(
        'goal',
        { ...normalizePilotRecord('goal', goal), version: 2 },
        {
          ...goal,
          version: 7,
        },
      ),
    ).toMatchObject({ version: 8, coverImage: goal.coverImage });
    expect(
      prepareRemotePilotRecord('goal', { ...normalizePilotRecord('goal', goal), version: 99 }),
    ).toMatchObject({ version: 1, coverImage: null });
  });

  it('extracts nested structured relationships used by planning, rituals, recommendations and walks', () => {
    expect(
      pilotRelationshipReferences('preparation_plan', {
        cycleId: 'cycle-1',
        tomorrowPlanId: 'tomorrow-1',
        targetDayId: 'day-1',
        items: [
          { sourceType: 'FIRST_ACTION', sourceId: 'action-1' },
          { sourceType: 'PROJECT', sourceId: 'project-1' },
          { sourceType: 'RULE', sourceId: 'rule-1' },
          { sourceType: 'REFLECTION', sourceId: 'embedded-correction-1' },
        ],
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'life_action', objectId: 'action-1' }),
        expect.objectContaining({ entityType: 'goal', objectId: 'goal-from-project:project-1' }),
        expect.objectContaining({ entityType: 'preparation_rule', objectId: 'rule-1' }),
      ]),
    );
    expect(
      pilotRelationshipReferences('recommendation_application', {
        targetType: 'TOMORROW_PLAN',
        targetId: 'tomorrow-1',
      }),
    ).toEqual([{ entityType: 'tomorrow_plan', objectId: 'tomorrow-1', required: true }]);
    expect(
      pilotRelationshipReferences('walk', {
        sphereId: null,
        linkedEntity: { type: 'goal', id: 'goal-1' },
        returnContext: {
          entity: { type: 'routine', id: 'routine-1' },
          routineContext: {
            source: { routineBlockId: 'routine-1' },
            next: { routineBlockId: 'routine-2' },
          },
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'goal', objectId: 'goal-1' }),
        expect.objectContaining({ entityType: 'routine_block', objectId: 'routine-1' }),
        expect.objectContaining({ entityType: 'routine_block', objectId: 'routine-2' }),
      ]),
    );
    expect(
      pilotRelationshipReferences('morning_cycle', {
        dayId: 'day-1',
        physicalPlanItems: null,
        physicalExecution: {
          sets: [{ exerciseDefinitionId: 'exercise-1' }],
        },
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ entityType: 'exercise_definition', objectId: 'exercise-1' }),
      ]),
    );
  });
});

function request<T>(value: IDBRequest<unknown>): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result as T | undefined);
    value.onerror = () => reject(value.error);
  });
}
function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
}
