import { describe, expect, it, vi } from 'vitest';
import { ActionSession, Day, DayDate, EntityId } from '../../domain';
import {
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import {
  TestActionSessionRepository,
  TestLifeActionRepository,
} from '../../test/helpers/TestRepositories';
import type { OpenDayRecoveryUnitOfWork } from '../ports/OpenDayRecoveryUnitOfWork';
import { ResolveOpenDayConflict } from './ResolveOpenDayConflict';

const FIRST_DATE = DayDate.create('2026-08-06');
const SECOND_DATE = DayDate.create('2026-08-07');

class FakeOpenDayConflictReader {
  public constructor(private readonly days: readonly Day[]) {}
  public async findOpenDays(): Promise<readonly Day[]> {
    return this.days;
  }
}

describe('ResolveOpenDayConflict', () => {
  it('атомарно подготавливает закрытие всех конфликтующих дней без выдуманного итога', async () => {
    const first = createOpenDay('resolve-first', FIRST_DATE);
    const second = createOpenDay('resolve-second', SECOND_DATE);
    const commit = vi.fn<OpenDayRecoveryUnitOfWork['commit']>().mockResolvedValue(undefined);
    const command = new ResolveOpenDayConflict(
      new FakeOpenDayConflictReader([first, second]),
      new TestActionSessionRepository(),
      new TestLifeActionRepository(),
      { commit },
      { now: () => new Date('2026-08-07T20:00:00.000+09:00') },
      { generate: () => id(`event-${Math.random()}`) },
    );

    const result = await command.execute({
      expectedOpenDays: [
        { dayId: first.id, version: first.version },
        { dayId: second.id, version: second.version },
      ],
      keepOpenDayId: null,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.completedDays).toHaveLength(2);
    expect(result.value.completedDays.every((day) => day.summary === null)).toBe(true);
    expect(commit).toHaveBeenCalledOnce();
  });

  it('запрещает закрывать день, к которому относится незавершённая сессия', async () => {
    const first = createOpenDay('session-first', FIRST_DATE);
    const second = createOpenDay('session-second', SECOND_DATE);
    const actions = new TestLifeActionRepository();
    const sessions = new TestActionSessionRepository();
    const action = markLifeActionInProgress(createReadyLifeAction('session-action', FIRST_DATE));
    await actions.save(action);
    await sessions.save(
      ActionSession.start({
        id: id('session-running'),
        lifeActionId: action.id,
        startedAt: new Date('2026-08-06T09:00:00.000+09:00'),
        eventId: id('session-running-event'),
      }),
    );
    const commit = vi.fn<OpenDayRecoveryUnitOfWork['commit']>();
    const command = new ResolveOpenDayConflict(
      new FakeOpenDayConflictReader([first, second]),
      sessions,
      actions,
      { commit },
      { now: () => new Date('2026-08-07T20:00:00.000+09:00') },
      { generate: () => id(`event-${Math.random()}`) },
    );

    const result = await command.execute({
      expectedOpenDays: [
        { dayId: first.id, version: first.version },
        { dayId: second.id, version: second.version },
      ],
      keepOpenDayId: null,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('day.recovery_session_blocked');
    expect(commit).not.toHaveBeenCalled();
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
