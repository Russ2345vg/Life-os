import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { DayDate, Direction, EntityId, ActionSession, Walk } from '../../domain';
import { createEmptySleepSchedule, updateSleepSettings } from '../../domain/sleep/SleepSchedule';
import {
  defaultAutopilotPreferences,
  defaultAutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import { createLifeActionDraft } from '../../test/helpers/LifeActionTestFactory';
import {
  buildAutopilotGuard,
  type AutopilotGuardSource,
} from '../../application/planner/AutopilotGuard';
import { planningJournal } from '../../application/planner/planningSupport';
import { IndexedDbAutopilotSettingsStore } from './IndexedDbAutopilotSettingsStore';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { IndexedDbJournalUnitOfWork } from './IndexedDbJournalUnitOfWork';
import { IndexedDbRoutineBlockRepository } from './IndexedDbRoutineBlockRepository';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { request, done } from '../sync/attachments/AttachmentRegistration';
import { DirectionRecordMapper } from './mappers/DirectionRecordMapper';
import { SleepScheduleRecordMapper } from './mappers/SleepScheduleRecordMapper';
import { ActionSessionRecordMapper } from './mappers/ActionSessionRecordMapper';
import { WalkRecordMapper } from './mappers/WalkRecordMapper';
import { routineTestBlock } from '../../test/helpers/AutopilotTestFactory';
import { IndexedDbPilotMutationRecorder } from '../sync/pilot/IndexedDbPilotMutationRecorder';
import { LIFE_OS_SYNC_REGISTRY } from '../sync/LifeOsSyncRegistry';

const opened: LifeOsIndexedDb[] = [];
afterEach(() => {
  for (const db of opened.splice(0)) db.close();
});
async function fixture(enableSync = false) {
  const db = new LifeOsIndexedDb(new IDBFactory());
  opened.push(db);
  if (enableSync) {
    await put(db, 'sync_settings', {
      id: 'sync',
      setupState: 'configured',
      membershipStatus: 'active',
      spaceId: 'space',
      deviceId: 'desktop',
      currentKeyEpoch: 1,
    });
    db.configureSyncMutationCapture(new IndexedDbPilotMutationRecorder(), LIFE_OS_SYNC_REGISTRY);
  }
  const actions = new IndexedDbLifeActionRepository(db),
    unit = new IndexedDbJournalUnitOfWork(db);
  const action = createLifeActionDraft('a');
  await actions.save(action);
  const settings = new IndexedDbAutopilotSettingsStore(db);
  const preferences = await settings.writePreferences(defaultAutopilotPreferences(), null);
  const draft = await settings.writeDraft(
    { ...defaultAutopilotDayDraft('2026-10-10'), startMinute: 540, endMinute: 1320 },
    null,
  );
  const source: AutopilotGuardSource = {
    date: '2026-10-10',
    catalog: { actions: await actions.findAll(), goals: [], directions: [], links: [] },
    sessions: [],
    sleep: createEmptySleepSchedule(),
    sleepObservations: [],
    routineBlocks: [],
    walks: [],
    preferences,
    draft,
  };
  return { db, actions, unit, settings, source, guard: buildAutopilotGuard(source) };
}
async function put(db: LifeOsIndexedDb, store: string, record: unknown) {
  const database = await db.open(),
    tx = database.transaction(store, 'readwrite');
  tx.objectStore(store).put(record);
  await done(tx);
}
async function state(db: LifeOsIndexedDb) {
  const database = await db.open();
  const names = ['lifeActions', 'routineBlocks', 'journal', 'sync_outbox'];
  const tx = database.transaction(names);
  return Promise.all(names.map((name) => request(tx.objectStore(name).getAll())));
}
describe('autopilot transaction source guards', () => {
  it('applies an unchanged source and rejects a repeated stale guard without duplicate blocks', async () => {
    const f = await fixture(),
      block = routineTestBlock('day-autopilot:v1:2026-10-10:rest:0');
    await f.unit.commit({
      autopilotGuard: f.guard,
      routineBlocks: [{ block, expectedVersion: null }],
      journalEntries: [],
    });
    const before = await state(f.db);
    await expect(f.unit.commit({ autopilotGuard: f.guard, journalEntries: [] })).rejects.toThrow();
    expect(await state(f.db)).toEqual(before);
  });
  it.each([
    'action',
    'session',
    'sleep',
    'preferences',
    'draft',
    'manual',
    'fixed',
    'walk',
  ] as const)('rejects the entire batch after a %s source race', async (race) => {
    const f = await fixture();
    if (race === 'action') {
      const action = (await f.actions.findAll())[0]!;
      action.setPlan(DayDate.create('2026-10-11'), false);
      await f.actions.save(action);
    }
    if (race === 'session') {
      const session = ActionSession.start({
        id: EntityId.create('session'),
        lifeActionId: EntityId.create('a'),
        eventId: EntityId.create('session-start'),
        startedAt: new Date('2026-10-10T00:00:00Z'),
      });
      await put(f.db, 'actionSessions', ActionSessionRecordMapper.toRecord(session));
    }
    if (race === 'sleep')
      await put(
        f.db,
        'sleepSchedules',
        SleepScheduleRecordMapper.toRecord(
          updateSleepSettings(
            createEmptySleepSchedule(),
            { bedtime: '23:00', wakeTime: '07:00', timeZone: 'Asia/Chita', enabled: false },
            new Date('2026-10-10T00:00:00Z'),
          ),
        ),
      );
    if (race === 'preferences')
      await f.settings.writePreferences({ ...f.source.preferences.value, maxActions: 6 }, 1);
    if (race === 'draft')
      await f.settings.writeDraft({ ...f.source.draft.value, wishes: 'Порядок' }, 1);
    if (race === 'manual')
      await f.unit.commit({
        routineBlocks: [{ block: routineTestBlock('manual'), expectedVersion: null }],
        journalEntries: [],
      });
    if (race === 'fixed') {
      const action = createLifeActionDraft('new-fixed');
      action.setPlan(DayDate.create('2026-10-10'), false);
      action.setTimePlanning({
        estimateMinutes: 30,
        scheduledStartMinute: 600,
        scheduledDurationMinutes: 30,
      });
      await f.actions.save(action);
    }
    if (race === 'walk') {
      const walk = Walk.create({
        id: EntityId.create('new-walk'),
        date: DayDate.create('2026-10-10'),
        type: 'restorative',
        now: new Date('2026-10-09T23:50:00Z'),
      }).start({ mode: 'stopwatch', startedAt: new Date('2026-10-10T00:00:00Z') });
      await put(f.db, 'walks', WalkRecordMapper.toRecord(walk));
    }
    const before = await state(f.db);
    await expect(
      f.unit.commit({
        autopilotGuard: f.guard,
        routineBlocks: [{ block: routineTestBlock('new-rest'), expectedVersion: null }],
        journalEntries: [],
      }),
    ).rejects.toThrow();
    expect(await state(f.db)).toEqual(before);
  });
  it('rejects a focus archived after preview without returning the archived direction', async () => {
    const f = await fixture(),
      direction = Direction.create({
        id: EntityId.create('d'),
        name: 'Инвестиции',
        now: new Date('2026-10-10T00:00:00Z'),
      });
    await put(f.db, 'directions', DirectionRecordMapper.toRecord(direction));
    const guard = buildAutopilotGuard({
      ...f.source,
      catalog: { ...f.source.catalog, directions: [direction] },
    });
    await put(
      f.db,
      'directions',
      DirectionRecordMapper.toRecord(direction.archive(new Date('2026-10-10T01:00:00Z'))),
    );
    await expect(f.unit.commit({ autopilotGuard: guard, journalEntries: [] })).rejects.toThrow();
  });
  it('rolls back action date block and journal when a final journal write fails', async () => {
    const f = await fixture(true),
      before = await state(f.db),
      action = (await f.actions.findAll())[0]!;
    const version = action.version;
    action.setPlan(DayDate.create('2026-10-10'), false);
    const entry = planningJournal(
      'same-id',
      'LifeAction',
      'a',
      'План',
      new Date('2026-10-10T00:00:00Z'),
      {},
    );
    await expect(
      f.unit.commit({
        autopilotGuard: f.guard,
        lifeActions: [{ lifeAction: action, expectedVersion: version }],
        routineBlocks: [{ block: routineTestBlock('rest'), expectedVersion: null }],
        journalEntries: [entry, entry],
      }),
    ).rejects.toThrow();
    expect(await state(f.db)).toEqual(before);
    expect(await new IndexedDbRoutineBlockRepository(f.db).findAll()).toEqual([]);
  });
});
