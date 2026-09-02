import { describe, expect, it, vi } from 'vitest';
import {
  ActionSession,
  Day,
  DayDate,
  DECISION_KIND,
  EntityId,
  EveningCycle,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  RoutineBlock,
  RoutineBlockRecurrence,
  type Decision,
  type LifeAction,
} from '../../domain';
import {
  InMemoryRoutineBlockRepository,
  InMemoryRoutineOccurrenceExecutionRepository,
  InMemoryRoutineOccurrenceOverrideRepository,
} from '../../infrastructure';
import type {
  ActionSessionRepository,
  DayRepository,
  DecisionRepository,
  LifeActionRepository,
  EveningCycleRepository,
} from '../ports';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { EveningCycleApplicationService } from '../evening-cycle';
import { EnsureCurrentDay } from '../commands/EnsureCurrentDay';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { GetEveningCycleReview, GetEveningReview } from './GetEveningReview';
import { DEFAULT_EVENING_RITUAL_SETTINGS } from '../evening-settings';

const TODAY = DayDate.create('2026-08-05');
const TOMORROW = DayDate.create('2026-08-06');

describe('GetEveningCycleReview', () => {
  it('проецирует targetSleepTime из последнего непропущенного блока сна', async () => {
    const days = new MemoryDayRepository();
    await days.save(createOpenDay(TODAY));
    const blocks = new InMemoryRoutineBlockRepository();
    for (const [idValue, startTime, endTime] of [
      ['nap', '14:00', '14:30'],
      ['night-sleep', '23:00', '23:59'],
    ] as const) {
      await blocks.save(
        RoutineBlock.create({
          id: id(idValue),
          anchorDate: TODAY,
          title: idValue,
          startTime,
          endTime,
          category: ROUTINE_BLOCK_CATEGORY.sleep,
          recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.daily),
          required: true,
          now: new Date('2026-08-05T08:00:00.000+09:00'),
        }),
      );
    }
    const clock = new FakeClock(new Date('2026-08-05T22:30:00.000+09:00'));
    const cycles = new MemoryEveningCycleRepository();
    const query = new GetEveningCycleReview(
      days,
      new MemoryDecisionRepository(),
      new MemoryLifeActionRepository(),
      new MemoryActionSessionRepository(),
      new FakeCurrentDateProvider(TODAY),
      blocks,
      new InMemoryRoutineOccurrenceOverrideRepository(),
      new InMemoryRoutineOccurrenceExecutionRepository(),
      new EveningCycleApplicationService(
        cycles,
        days,
        clock,
        new FakeIdGenerator('target-sleep-cycle'),
      ),
      new EnsureCurrentDay(
        days,
        new FakeCurrentDateProvider(TODAY),
        clock,
        new FakeIdGenerator('target-sleep-day'),
      ),
    );

    const snapshot = await query.execute(TODAY);

    expect(snapshot.routineSummary?.targetSleepTime).toBe('23:00');

    const configured = await new GetEveningReview(query, {
      loadEveningRitualSettings: () => ({
        ...DEFAULT_EVENING_RITUAL_SETTINGS,
        targetSleepTime: '22:45',
        notificationEnabled: true,
      }),
    }).execute(TODAY);

    expect(configured.routineSummary?.targetSleepTime).toBe('22:45');
    expect(configured.eveningRitualSettings?.notificationEnabled).toBe(true);
  });

  it('собирает день, решения, действия, их сессии и подготовку на завтра из единого источника', async () => {
    const dayRepository = new MemoryDayRepository();
    const decisionRepository = new MemoryDecisionRepository();
    const lifeActionRepository = new MemoryLifeActionRepository();
    const sessionRepository = new MemoryActionSessionRepository();
    const day = createOpenDay(TODAY);
    const todayDecision = createPlannedDecision('today', TODAY);
    const tomorrowDecision = createPlannedDecision('tomorrow', TOMORROW, DECISION_KIND.main, 2);
    const action = createReadyLifeAction('action', TODAY, { decisionId: todayDecision.id });
    const session = ActionSession.start({
      id: id('session'),
      lifeActionId: action.id,
      startedAt: new Date('2026-08-05T10:00:00.000+09:00'),
      eventId: id('session-started'),
    });
    session.complete({
      completedAt: new Date('2026-08-05T11:00:00.000+09:00'),
      completionKind: 'completed',
      eventId: id('session-completed'),
    });
    await Promise.all([
      dayRepository.save(day),
      decisionRepository.save(todayDecision),
      decisionRepository.save(tomorrowDecision),
      lifeActionRepository.save(action),
      sessionRepository.save(session),
    ]);
    const findAllSessions = vi.spyOn(sessionRepository, 'findAll');
    const findSessionsByAction = vi.spyOn(sessionRepository, 'findByLifeActionId');

    const query = createQuery(
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      sessionRepository,
      new FakeCurrentDateProvider(TODAY),
    );
    const snapshot = await query.execute();
    const repeatedSnapshot = await query.execute();

    expect(snapshot.day.id.equals(day.id)).toBe(true);
    expect(snapshot.currentDate.equals(TODAY)).toBe(true);
    expect(snapshot.tomorrowDate.equals(TOMORROW)).toBe(true);
    expect(snapshot.isRecoveryReview).toBe(false);
    expect(snapshot.cycle.state).toBe('NOT_STARTED');
    expect(repeatedSnapshot.cycle.id.equals(snapshot.cycle.id)).toBe(true);
    expect(snapshot.decisions.map(String)).toEqual([todayDecision.toString()]);
    expect(snapshot.lifeActions.map((item) => item.id.toString())).toEqual([action.id.toString()]);
    expect(snapshot.actionSessions.map((item) => item.id.toString())).toEqual([
      session.id.toString(),
    ]);
    expect(snapshot.unfinishedSession).toBeNull();
    expect(snapshot.tomorrowDecisions.map((item) => item.id.toString())).toEqual([
      tomorrowDecision.id.toString(),
    ]);
    expect(findAllSessions).toHaveBeenCalledTimes(4);
    expect(findSessionsByAction).not.toHaveBeenCalled();
  });

  it('возвращает NOT_STARTED без сохранения EveningCycle и повторяет это после refresh', async () => {
    const days = new MemoryDayRepository();
    const cycles = new MemoryEveningCycleRepository();
    await days.save(createOpenDay(TODAY));
    const query = createQuery(
      days,
      new MemoryDecisionRepository(),
      new MemoryLifeActionRepository(),
      new MemoryActionSessionRepository(),
      new FakeCurrentDateProvider(TODAY),
      cycles,
    );

    const first = await query.execute(TODAY);
    const refreshed = await query.execute(TODAY);

    expect(first.cycle.state).toBe('NOT_STARTED');
    expect(refreshed.cycle.state).toBe('NOT_STARTED');
    expect(refreshed.cycle.id.equals(first.cycle.id)).toBe(true);
    expect(cycles.size).toBe(0);
  });

  it('восстанавливает уже начатый EveningCycle в его состоянии', async () => {
    const days = new MemoryDayRepository();
    const decisions = new MemoryDecisionRepository();
    const cycles = new MemoryEveningCycleRepository();
    await days.save(createOpenDay(TODAY));
    await decisions.save(createPlannedDecision('still-open', TODAY));
    const service = new EveningCycleApplicationService(
      cycles,
      days,
      new FakeClock(new Date('2026-08-05T20:00:00.000+09:00')),
      new FakeIdGenerator('started-cycle'),
    );
    const started = await service.start(TODAY);
    await service.beginResolving(TODAY);

    const snapshot = await createQuery(
      days,
      decisions,
      new MemoryLifeActionRepository(),
      new MemoryActionSessionRepository(),
      new FakeCurrentDateProvider(TODAY),
      cycles,
    ).execute(TODAY);

    expect(snapshot.cycle.id.equals(started.id)).toBe(true);
    expect(snapshot.cycle.state).toBe('RESOLVING');
  });

  it('восстанавливает COMPLETED EveningCycle для Recovery Scene', async () => {
    const days = new MemoryDayRepository();
    const cycles = new MemoryEveningCycleRepository();
    const day = createOpenDay(TODAY);
    day.complete(new Date('2026-08-05T21:00:00.000+09:00'), id('completed-day'));
    await days.save(day);
    const service = new EveningCycleApplicationService(
      cycles,
      days,
      new FakeClock(new Date('2026-08-05T21:05:00.000+09:00')),
      new FakeIdGenerator('completed-cycle'),
    );
    const completed = await service.start(TODAY);

    const snapshot = await createQuery(
      days,
      new MemoryDecisionRepository(),
      new MemoryLifeActionRepository(),
      new MemoryActionSessionRepository(),
      new FakeCurrentDateProvider(TODAY),
      cycles,
    ).execute(TODAY);

    expect(snapshot.cycle.id.equals(completed.id)).toBe(true);
    expect(snapshot.cycle.state).toBe('COMPLETED');
  });

  it('не маскирует реальную ошибку EveningCycle repository как NOT_STARTED', async () => {
    const days = new MemoryDayRepository();
    await days.save(createOpenDay(TODAY));
    const query = createQuery(
      days,
      new MemoryDecisionRepository(),
      new MemoryLifeActionRepository(),
      new MemoryActionSessionRepository(),
      new FakeCurrentDateProvider(TODAY),
      new FailingEveningCycleRepository(),
    );

    await expect(query.execute(TODAY)).rejects.toThrow('IndexedDB unavailable');
  });

  it('открывает прошлый активный день для восстановления и готовит продолжение на текущую дату', async () => {
    const actualCurrentDate = DayDate.create('2026-08-08');
    const staleDate = DayDate.create('2026-08-06');
    const dayRepository = new MemoryDayRepository();
    const decisionRepository = new MemoryDecisionRepository();
    const lifeActionRepository = new MemoryLifeActionRepository();
    const sessionRepository = new MemoryActionSessionRepository();
    const staleDay = createOpenDay(staleDate);
    const currentDecision = createPlannedDecision(
      'current-main',
      actualCurrentDate,
      DECISION_KIND.main,
      1,
    );
    await Promise.all([dayRepository.save(staleDay), decisionRepository.save(currentDecision)]);

    const snapshot = await createQuery(
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      sessionRepository,
      new FakeCurrentDateProvider(actualCurrentDate),
    ).execute(staleDate);

    expect(snapshot.day.id.equals(staleDay.id)).toBe(true);
    expect(snapshot.currentDate.equals(staleDate)).toBe(true);
    expect(snapshot.tomorrowDate.equals(actualCurrentDate)).toBe(true);
    expect(snapshot.isRecoveryReview).toBe(true);
    expect(snapshot.tomorrowDecisions.map((decision) => decision.id.toString())).toEqual([
      currentDecision.id.toString(),
    ]);
  });

  it('не открывает вечерний контроль для будущей даты', async () => {
    const query = createQuery(
      new MemoryDayRepository(),
      new MemoryDecisionRepository(),
      new MemoryLifeActionRepository(),
      new MemoryActionSessionRepository(),
      new FakeCurrentDateProvider(TODAY),
    );

    await expect(query.execute(DayDate.create('2026-08-06'))).rejects.toMatchObject({
      code: 'day.evening_review_future_date',
    });
  });

  it('возвращает незавершённую сессию как блокировку даже вне списка действий текущего дня', async () => {
    const dayRepository = new MemoryDayRepository();
    const decisionRepository = new MemoryDecisionRepository();
    const lifeActionRepository = new MemoryLifeActionRepository();
    const sessionRepository = new MemoryActionSessionRepository();
    await dayRepository.save(createOpenDay(TODAY));
    const foreignSession = ActionSession.start({
      id: id('foreign-session'),
      lifeActionId: id('foreign-action'),
      startedAt: new Date('2026-08-05T12:00:00.000+09:00'),
      eventId: id('foreign-session-started'),
    });
    await sessionRepository.save(foreignSession);

    const snapshot = await createQuery(
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      sessionRepository,
      new FakeCurrentDateProvider(TODAY),
    ).execute();

    expect(snapshot.unfinishedSession?.id.equals(foreignSession.id)).toBe(true);
    expect(snapshot.actionSessions).toHaveLength(0);
  });

  it('создаёт отсутствующий Day для выбранной даты и правильно вычисляет завтра', async () => {
    const currentDate = DayDate.create('2026-12-31');
    const query = createQuery(
      new MemoryDayRepository(),
      new MemoryDecisionRepository(),
      new MemoryLifeActionRepository(),
      new MemoryActionSessionRepository(),
      new FakeCurrentDateProvider(currentDate),
    );

    const created = await query.execute();
    expect(created.day.date.equals(currentDate)).toBe(true);
    expect(created.cycle.state).toBe('NOT_STARTED');
    expect(created.tomorrowDate.toString()).toBe('2027-01-01');

    const dayRepository = new MemoryDayRepository();
    await dayRepository.save(createOpenDay(currentDate));
    const snapshot = await createQuery(
      dayRepository,
      new MemoryDecisionRepository(),
      new MemoryLifeActionRepository(),
      new MemoryActionSessionRepository(),
      new FakeCurrentDateProvider(currentDate),
    ).execute();
    expect(snapshot.tomorrowDate.toString()).toBe('2027-01-01');
  });
});

function createQuery(
  days: DayRepository,
  decisions: DecisionRepository,
  lifeActions: LifeActionRepository,
  sessions: ActionSessionRepository,
  currentDateProvider: FakeCurrentDateProvider,
  cycles: MemoryEveningCycleRepository = new MemoryEveningCycleRepository(),
): GetEveningCycleReview {
  const clock = new FakeClock(new Date('2026-08-05T20:00:00.000+09:00'));
  return new GetEveningCycleReview(
    days,
    decisions,
    lifeActions,
    sessions,
    currentDateProvider,
    undefined,
    undefined,
    undefined,
    new EveningCycleApplicationService(cycles, days, clock, new FakeIdGenerator('evening-review')),
    new EnsureCurrentDay(
      days,
      currentDateProvider,
      clock,
      new FakeIdGenerator('ensure-evening-review'),
    ),
  );
}

function createOpenDay(date: DayDate): Day {
  return Day.openCurrent({
    id: id(`day-${date.toString()}`),
    currentDate: date,
    occurredAt: new Date(`${date.toString()}T08:00:00.000Z`),
    createdEventId: id(`day-created-${date.toString()}`),
    openedEventId: id(`day-opened-${date.toString()}`),
  });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}

class MemoryDayRepository implements DayRepository {
  readonly #items = new Map<string, Day>();

  public async findByDate(date: DayDate): Promise<Day | null> {
    return this.#items.get(date.toString()) ?? null;
  }

  public async findOpen(): Promise<Day | null> {
    return [...this.#items.values()].find((day) => day.status === 'open') ?? null;
  }

  public async save(day: Day): Promise<void> {
    this.#items.set(day.date.toString(), day);
  }

  public async saveIfVersionMatches(day: Day, expectedVersion: number): Promise<boolean> {
    const stored = this.#items.get(day.date.toString());
    if (stored === undefined || !stored.id.equals(day.id) || stored.version !== expectedVersion) {
      return false;
    }
    this.#items.set(day.date.toString(), day);
    return true;
  }
}

class MemoryDecisionRepository implements DecisionRepository {
  readonly #items: Decision[] = [];

  public async findById(id: EntityId): Promise<Decision | null> {
    return this.#items.find((decision) => decision.id.equals(id)) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly Decision[]> {
    return this.#items.filter((decision) => decision.plannedDate?.equals(date) === true);
  }

  public async save(decision: Decision): Promise<void> {
    this.#items.push(decision);
  }
}

class MemoryLifeActionRepository implements LifeActionRepository {
  readonly #items: LifeAction[] = [];

  public async findById(id: EntityId): Promise<LifeAction | null> {
    return this.#items.find((lifeAction) => lifeAction.id.equals(id)) ?? null;
  }

  public async findByDate(date: DayDate): Promise<readonly LifeAction[]> {
    return this.#items.filter((lifeAction) => lifeAction.plannedDate?.equals(date) === true);
  }

  public async findByDecisionId(decisionId: EntityId): Promise<readonly LifeAction[]> {
    return this.#items.filter((lifeAction) => lifeAction.decisionId?.equals(decisionId) === true);
  }

  public async save(lifeAction: LifeAction): Promise<void> {
    this.#items.push(lifeAction);
  }
}

class MemoryActionSessionRepository implements ActionSessionRepository {
  readonly #items: ActionSession[] = [];

  public async findById(id: EntityId): Promise<ActionSession | null> {
    return this.#items.find((session) => session.id.equals(id)) ?? null;
  }

  public async findByLifeActionId(lifeActionId: EntityId): Promise<readonly ActionSession[]> {
    return this.#items.filter((session) => session.lifeActionId.equals(lifeActionId));
  }

  public async findAll(): Promise<readonly ActionSession[]> {
    return [...this.#items];
  }

  public async findUnfinished(): Promise<ActionSession | null> {
    return this.#items.find((session) => session.status !== 'completed') ?? null;
  }

  public async save(session: ActionSession): Promise<void> {
    this.#items.push(session);
  }
}

class MemoryEveningCycleRepository implements EveningCycleRepository {
  readonly #items = new Map<string, EveningCycle>();

  public async findById(id: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((cycle) => cycle.id.equals(id)) ?? null;
  }

  public async findByDayId(dayId: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null;
  }

  public async findByDateKey(dateKey: DayDate): Promise<EveningCycle | null> {
    return this.#items.get(dateKey.toString()) ?? null;
  }

  public async createIfAbsent(cycle: EveningCycle): Promise<EveningCycle> {
    const existing = await this.findByDateKey(cycle.dateKey);
    if (existing !== null) return existing;
    this.#items.set(cycle.dateKey.toString(), cycle);
    return cycle;
  }

  public async saveIfVersionMatches(
    cycle: EveningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    const stored = await this.findByDateKey(cycle.dateKey);
    if (stored === null || stored.version !== expectedVersion) return false;
    this.#items.set(cycle.dateKey.toString(), cycle);
    return true;
  }

  public get size(): number {
    return this.#items.size;
  }
}

class FailingEveningCycleRepository extends MemoryEveningCycleRepository {
  public override async findByDateKey(): Promise<EveningCycle | null> {
    throw new Error('IndexedDB unavailable');
  }
}
