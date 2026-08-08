import { describe, expect, it } from 'vitest';
import {
  ActionSession,
  Day,
  DayDate,
  DECISION_KIND,
  EntityId,
  type Decision,
  type LifeAction,
} from '../../domain';
import type {
  ActionSessionRepository,
  DayRepository,
  DecisionRepository,
  LifeActionRepository,
} from '../ports';
import { FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { GetEveningReview } from './GetEveningReview';

const TODAY = DayDate.create('2026-08-05');
const TOMORROW = DayDate.create('2026-08-06');

describe('GetEveningReview', () => {
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

    const snapshot = await new GetEveningReview(
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      sessionRepository,
      new FakeCurrentDateProvider(TODAY),
    ).execute();

    expect(snapshot.day.id.equals(day.id)).toBe(true);
    expect(snapshot.currentDate.equals(TODAY)).toBe(true);
    expect(snapshot.tomorrowDate.equals(TOMORROW)).toBe(true);
    expect(snapshot.isRecoveryReview).toBe(false);
    expect(snapshot.decisions.map(String)).toEqual([todayDecision.toString()]);
    expect(snapshot.lifeActions.map((item) => item.id.toString())).toEqual([action.id.toString()]);
    expect(snapshot.actionSessions.map((item) => item.id.toString())).toEqual([
      session.id.toString(),
    ]);
    expect(snapshot.unfinishedSession).toBeNull();
    expect(snapshot.tomorrowDecisions.map((item) => item.id.toString())).toEqual([
      tomorrowDecision.id.toString(),
    ]);
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

    const snapshot = await new GetEveningReview(
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
    const query = new GetEveningReview(
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

    const snapshot = await new GetEveningReview(
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      sessionRepository,
      new FakeCurrentDateProvider(TODAY),
    ).execute();

    expect(snapshot.unfinishedSession?.id.equals(foreignSession.id)).toBe(true);
    expect(snapshot.actionSessions).toHaveLength(0);
  });

  it('правильно вычисляет завтра на границе года и сообщает об отсутствующем дне', async () => {
    const currentDate = DayDate.create('2026-12-31');
    const query = new GetEveningReview(
      new MemoryDayRepository(),
      new MemoryDecisionRepository(),
      new MemoryLifeActionRepository(),
      new MemoryActionSessionRepository(),
      new FakeCurrentDateProvider(currentDate),
    );

    await expect(query.execute()).rejects.toMatchObject({ code: 'day.not_found' });

    const dayRepository = new MemoryDayRepository();
    await dayRepository.save(createOpenDay(currentDate));
    const snapshot = await new GetEveningReview(
      dayRepository,
      new MemoryDecisionRepository(),
      new MemoryLifeActionRepository(),
      new MemoryActionSessionRepository(),
      new FakeCurrentDateProvider(currentDate),
    ).execute();
    expect(snapshot.tomorrowDate.toString()).toBe('2027-01-01');
  });
});

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

  public async findUnfinished(): Promise<ActionSession | null> {
    return this.#items.find((session) => session.status !== 'completed') ?? null;
  }

  public async save(session: ActionSession): Promise<void> {
    this.#items.push(session);
  }
}
