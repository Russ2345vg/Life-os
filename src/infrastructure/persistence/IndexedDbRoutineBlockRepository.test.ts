import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  CreateRoutineBlock,
  DeleteRoutineBlock,
  GetRoutineBlocksForDate,
  UpdateRoutineBlock,
} from '../../application';
import {
  DayDate,
  EntityId,
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
} from '../../domain';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import { LIFE_OS_STORE, LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';
import { IndexedDbRoutineBlockRepository } from './IndexedDbRoutineBlockRepository';
import { executeIndexedDbRequest } from './indexed-db/IndexedDbRequest';

const DATE = DayDate.create('2026-08-08');
const INPUT = {
  anchorDate: DATE,
  title: 'Сон',
  startTime: '22:00',
  endTime: '23:00',
  category: ROUTINE_BLOCK_CATEGORY.sleep,
  recurrence: ROUTINE_BLOCK_RECURRENCE.daily,
  required: true,
} as const;

function services(database: LifeOsIndexedDb, prefix: string) {
  const repository = new IndexedDbRoutineBlockRepository(database);
  const clock = new FakeClock(new Date('2026-08-08T00:00:00.000Z'));
  return {
    repository,
    create: new CreateRoutineBlock(repository, clock, new FakeIdGenerator(prefix)),
    update: new UpdateRoutineBlock(repository, clock),
    remove: new DeleteRoutineBlock(repository),
    query: new GetRoutineBlocksForDate(repository),
    clock,
  };
}

describe('IndexedDbRoutineBlockRepository', () => {
  it('persists a block across closing and reopening IndexedDB', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = services(firstDatabase, 'persist');
    const created = await first.create.execute(INPUT);
    expect(created.ok).toBe(true);
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const reopened = services(reopenedDatabase, 'reopened');
    expect((await reopened.query.execute(DATE)).map((block) => block.title)).toEqual(['Сон']);
    reopenedDatabase.close();
  });

  it('persists actionId across F5 without copying action state', async () => {
    const factory = new IDBFactory();
    const firstDatabase = new LifeOsIndexedDb(factory);
    const first = services(firstDatabase, 'assigned');
    const created = await first.create.execute({
      ...INPUT,
      assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.existingAction,
      actionId: EntityId.create('canonical-action'),
    });
    if (!created.ok) throw created.error;
    const connection = await firstDatabase.open();
    const raw = await executeIndexedDbRequest<Record<string, unknown>>(
      connection,
      LIFE_OS_STORE.routineBlocks,
      'readonly',
      (store) => store.get(created.value.id.toString()),
    );
    expect(raw).toMatchObject({
      assignment: ROUTINE_BLOCK_ASSIGNMENT.existingAction,
      actionId: 'canonical-action',
    });
    expect(raw).not.toHaveProperty('actionStatus');
    expect(raw).not.toHaveProperty('actionResult');
    firstDatabase.close();

    const reopenedDatabase = new LifeOsIndexedDb(factory);
    const restored = await new IndexedDbRoutineBlockRepository(reopenedDatabase).findById(
      created.value.id,
    );
    expect(restored?.assignment.kind).toBe(ROUTINE_BLOCK_ASSIGNMENT.existingAction);
    if (restored?.assignment.kind === ROUTINE_BLOCK_ASSIGNMENT.existingAction) {
      expect(restored.assignment.actionId.toString()).toBe('canonical-action');
    }
    reopenedDatabase.close();
  });

  it('treats a stage 13.1 record without assignment as reminder', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const connection = await database.open();
    await executeIndexedDbRequest(connection, LIFE_OS_STORE.routineBlocks, 'readwrite', (store) =>
      store.put({
        schemaVersion: 1,
        id: 'legacy-routine',
        anchorDate: DATE.toString(),
        title: 'Старый блок',
        startTime: '08:00',
        endTime: '09:00',
        category: ROUTINE_BLOCK_CATEGORY.other,
        recurrence: ROUTINE_BLOCK_RECURRENCE.none,
        selectedWeekdays: [],
        required: false,
        createdAt: '2026-08-08T00:00:00.000Z',
        updatedAt: '2026-08-08T00:00:00.000Z',
        version: 1,
      }),
    );

    const restored = await new IndexedDbRoutineBlockRepository(database).findById(
      EntityId.create('legacy-routine'),
    );
    expect(restored?.assignment).toEqual({ kind: ROUTINE_BLOCK_ASSIGNMENT.reminder });
    database.close();
  });

  it('persists editing and increments version', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = services(database, 'update');
    const created = await app.create.execute(INPUT);
    if (!created.ok) throw created.error;
    app.clock.setTime(new Date('2026-08-08T01:00:00.000Z'));
    const updated = await app.update.execute({
      ...INPUT,
      id: created.value.id,
      expectedVersion: 1,
      title: 'Ночной сон',
    });
    expect(updated).toMatchObject({ ok: true, value: { title: 'Ночной сон', version: 2 } });
    database.close();
  });

  it('prevents a stale repository instance from overwriting a new version', async () => {
    const factory = new IDBFactory();
    const database = new LifeOsIndexedDb(factory);
    const first = services(database, 'conflict');
    const second = services(database, 'other-tab');
    const created = await first.create.execute(INPUT);
    if (!created.ok) throw created.error;
    await first.update.execute({
      ...INPUT,
      id: created.value.id,
      expectedVersion: 1,
      title: 'Свежие данные',
    });
    const stale = await second.update.execute({
      ...INPUT,
      id: created.value.id,
      expectedVersion: 1,
      title: 'Старые данные',
    });
    expect(stale).toMatchObject({ ok: false, error: { code: 'routine_block.version_conflict' } });
    expect((await first.repository.findById(created.value.id))?.title).toBe('Свежие данные');
    database.close();
  });

  it('deletes a block without touching other stores', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const app = services(database, 'delete');
    const created = await app.create.execute(INPUT);
    if (!created.ok) throw created.error;
    const connection = await database.open();
    await executeIndexedDbRequest(connection, LIFE_OS_STORE.days, 'readwrite', (store) =>
      store.put({ id: 'untouched-day', date: DATE.toString() }),
    );
    expect(await app.remove.execute({ id: created.value.id, expectedVersion: 1 })).toMatchObject({
      ok: true,
    });
    expect(await app.query.execute(DATE)).toHaveLength(0);
    await expect(
      executeIndexedDbRequest(connection, LIFE_OS_STORE.days, 'readonly', (store) =>
        store.get('untouched-day'),
      ),
    ).resolves.toMatchObject({ id: 'untouched-day' });
    database.close();
  });
});
