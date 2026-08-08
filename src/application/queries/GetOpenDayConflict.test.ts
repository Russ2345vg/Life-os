import { describe, expect, it } from 'vitest';
import { ActionSession, Day, DayDate, EntityId } from '../../domain';
import {
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import {
  TestActionSessionRepository,
  TestLifeActionRepository,
} from '../../test/helpers/TestRepositories';
import { GetOpenDayConflict } from './GetOpenDayConflict';

const FIRST_DATE = DayDate.create('2026-08-06');
const SECOND_DATE = DayDate.create('2026-08-07');

class FakeOpenDayConflictReader {
  public constructor(private readonly days: readonly Day[]) {}

  public async findOpenDays(): Promise<readonly Day[]> {
    return this.days;
  }
}

describe('GetOpenDayConflict', () => {
  it('возвращает оба открытых дня и связывает незавершённую сессию с её днём', async () => {
    const first = createOpenDay('open-first', FIRST_DATE);
    const second = createOpenDay('open-second', SECOND_DATE);
    const lifeActionRepository = new TestLifeActionRepository();
    const actionSessionRepository = new TestActionSessionRepository();
    const action = markLifeActionInProgress(createReadyLifeAction('recovery-action', FIRST_DATE));
    const session = ActionSession.start({
      id: id('recovery-session'),
      lifeActionId: action.id,
      startedAt: new Date('2026-08-06T10:00:00.000+09:00'),
      eventId: id('recovery-session-started'),
    });
    await lifeActionRepository.save(action);
    await actionSessionRepository.save(session);

    const result = await new GetOpenDayConflict(
      new FakeOpenDayConflictReader([second, first]),
      actionSessionRepository,
      lifeActionRepository,
    ).execute();

    expect(result.hasConflict).toBe(true);
    expect(result.openDays.map((item) => item.day.id.toString())).toEqual([
      'open-first',
      'open-second',
    ]);
    expect(result.openDays[0]?.hasUnfinishedSession).toBe(true);
    expect(result.unfinishedSessionDayId?.toString()).toBe('open-first');
    expect(result.hasOrphanedUnfinishedSession).toBe(false);
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
