import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import { ActionSession, Day, DayDate, EntityId } from '../../domain';
import {
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { IndexedDbActionSessionRepository } from './IndexedDbActionSessionRepository';
import { IndexedDbDayRepository } from './IndexedDbDayRepository';
import { IndexedDbLifeActionRepository } from './IndexedDbLifeActionRepository';
import { IndexedDbOpenDayRecoveryUnitOfWork } from './IndexedDbOpenDayRecoveryUnitOfWork';
import { LifeOsIndexedDb } from './indexed-db/LifeOsIndexedDb';

const FIRST_DATE = DayDate.create('2026-08-06');
const SECOND_DATE = DayDate.create('2026-08-07');

describe('IndexedDbOpenDayRecoveryUnitOfWork', () => {
  it('закрывает конфликтующие дни одной транзакцией и сохраняет их после повторного чтения', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const days = new IndexedDbDayRepository(database);
    const unitOfWork = new IndexedDbOpenDayRecoveryUnitOfWork(database);
    const first = createOpenDay('uow-first', FIRST_DATE);
    const second = createOpenDay('uow-second', SECOND_DATE);
    await days.save(first);
    await days.save(second);
    const expectedOpenDays = [
      { dayId: first.id, version: first.version },
      { dayId: second.id, version: second.version },
    ];

    first.complete(new Date('2026-08-07T20:00:00.000+09:00'), id('uow-first-complete'));
    second.complete(new Date('2026-08-07T20:00:00.000+09:00'), id('uow-second-complete'));
    await unitOfWork.commit({
      expectedOpenDays,
      keepOpenDayId: null,
      completedDays: [first, second],
    });

    expect((await days.findByDate(FIRST_DATE))?.status).toBe('completed');
    expect((await days.findByDate(SECOND_DATE))?.status).toBe('completed');
    database.close();
  });

  it('откатывает закрытие, если внутри транзакции найден незавершённый сеанс закрываемого дня', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const days = new IndexedDbDayRepository(database);
    const actions = new IndexedDbLifeActionRepository(database);
    const sessions = new IndexedDbActionSessionRepository(database);
    const unitOfWork = new IndexedDbOpenDayRecoveryUnitOfWork(database);
    const first = createOpenDay('rollback-first', FIRST_DATE);
    const second = createOpenDay('rollback-second', SECOND_DATE);
    await days.save(first);
    await days.save(second);
    const action = markLifeActionInProgress(createReadyLifeAction('rollback-action', FIRST_DATE));
    await actions.save(action);
    await sessions.save(
      ActionSession.start({
        id: id('rollback-session'),
        lifeActionId: action.id,
        startedAt: new Date('2026-08-06T09:00:00.000+09:00'),
        eventId: id('rollback-session-event'),
      }),
    );
    const expectedOpenDays = [
      { dayId: first.id, version: first.version },
      { dayId: second.id, version: second.version },
    ];
    first.complete(new Date('2026-08-07T20:00:00.000+09:00'), id('rollback-first-complete'));
    second.complete(new Date('2026-08-07T20:00:00.000+09:00'), id('rollback-second-complete'));

    await expect(
      unitOfWork.commit({ expectedOpenDays, keepOpenDayId: null, completedDays: [first, second] }),
    ).rejects.toMatchObject({ code: 'day.recovery_session_blocked' });
    expect((await days.findByDate(FIRST_DATE))?.status).toBe('open');
    expect((await days.findByDate(SECOND_DATE))?.status).toBe('open');
    database.close();
  });
});

function createOpenDay(dayId: string, date: DayDate): Day {
  return Day.openCurrent({
    id: id(dayId),
    currentDate: date,
    occurredAt: new Date(`${date.toString()}T08:00:00.000+09:00`),
    createdEventId: id(`${dayId}-created`),
    openedEventId: id(`${dayId}-opened`),
  });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
