import { describe, expect, it } from 'vitest';
import type {
  CommitOpenLoopResolutionInput,
  OpenLoopResolutionUnitOfWork,
} from '../ports/OpenLoopResolutionUnitOfWork';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import {
  ACTION_SESSION_STATUS,
  ActionSession,
  DAY_STATUS,
  Day,
  DayDate,
  EntityId,
  EVENING_CYCLE_STATE,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_REQUIREMENT,
  OPEN_LOOP_RESOLUTION,
  SESSION_COMPLETION_KIND,
  type EveningCycle,
} from '../../domain';
import { EveningCycleApplicationService } from '../evening-cycle';
import { GetOpenLoopsForDay } from '../queries/GetOpenLoopsForDay';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../test/helpers/Fakes';
import {
  TestActionSessionRepository,
  TestDecisionRepository,
  TestLifeActionRepository,
} from '../../test/helpers/TestRepositories';
import { createPlannedDecision, confirmDecision } from '../../test/helpers/DecisionTestFactory';
import {
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import {
  OPEN_LOOP_BLOCKING_REASON,
  ResolveOpenLoop,
  isDecisionHasOpenActionsError,
} from './ResolveOpenLoop';

const DAY = DayDate.create('2026-08-14');
const NEXT_DAY = DayDate.create('2026-08-15');
const EVENING = new Date('2026-08-14T22:00:00.000+09:00');

describe('E3: разбор незавершённого', () => {
  it('находит только обязательные незавершённые элементы дня и одинаково отвечает повторным UI-входам', async () => {
    const context = await createContext();
    const planned = createPlannedDecision('open-decision', DAY);
    const completedDecision = confirmDecision(createPlannedDecision('done-decision', DAY));
    const action = createReadyLifeAction('open-action', DAY);
    const completedAction = completeLifeAction(
      markLifeActionInProgress(createReadyLifeAction('done-action', DAY)),
    );
    const futureAction = createReadyLifeAction('future-action', NEXT_DAY);
    const session = createSession(action.id);
    await Promise.all([
      context.decisions.save(planned),
      context.decisions.save(completedDecision),
      context.actions.save(action),
      context.actions.save(completedAction),
      context.actions.save(futureAction),
      context.sessions.save(session),
    ]);

    const first = await context.query.execute(DAY);
    const second = await context.query.execute(DAY);

    expect(first.cycle.state).toBe(EVENING_CYCLE_STATE.resolving);
    expect(first.total).toBe(3);
    expect(first.remaining).toBe(3);
    expect(
      first.items.filter((item) => item.requirement === OPEN_LOOP_REQUIREMENT.requiresResolution),
    ).toHaveLength(3);
    expect(first.items.map((item) => item.entityId)).not.toContain(futureAction.id.toString());
    expect(second.items.map(itemKey)).toEqual(first.items.map(itemKey));
  });

  it('атомарно переносит решение и его действие, не создаёт дублей и восстанавливает прогресс', async () => {
    const context = await createContext();
    const decision = createPlannedDecision('carry-decision', DAY);
    const action = createReadyLifeAction('carry-action', DAY, { decisionId: decision.id });
    const session = createSession(action.id);
    await Promise.all([
      context.decisions.save(decision),
      context.actions.save(action),
      context.sessions.save(session),
    ]);
    await context.query.execute(DAY);

    const stopped = await context.command.execute({
      dateKey: DAY,
      entityType: OPEN_LOOP_ENTITY_TYPE.actionSession,
      entityId: session.id,
      resolution: OPEN_LOOP_RESOLUTION.carryForward,
    });
    expect(stopped.ok).toBe(true);
    const carried = await context.command.execute({
      dateKey: DAY,
      entityType: OPEN_LOOP_ENTITY_TYPE.decision,
      entityId: decision.id,
      resolution: OPEN_LOOP_RESOLUTION.carryForward,
    });
    expect(carried.ok).toBe(true);
    if (!carried.ok) return;
    expect(carried.value.cycle.state).toBe(EVENING_CYCLE_STATE.reflecting);
    expect(carried.value.cycle.openLoopProgress).toEqual({ total: 3, resolved: 3, remaining: 0 });

    const repeated = await context.command.execute({
      dateKey: DAY,
      entityType: OPEN_LOOP_ENTITY_TYPE.decision,
      entityId: decision.id,
      resolution: OPEN_LOOP_RESOLUTION.carryForward,
    });
    expect(repeated.ok).toBe(true);
    expect((await context.decisions.findById(decision.id))?.rescheduleCount).toBe(1);
    expect((await context.actions.findById(action.id))?.rescheduleCount).toBe(1);
    expect((await context.decisions.findById(decision.id))?.plannedDate?.equals(NEXT_DAY)).toBe(
      true,
    );

    const restoredQuery = new GetOpenLoopsForDay(
      context.days,
      context.decisions,
      context.actions,
      context.sessions,
      context.cyclesService,
    );
    const restored = await restoredQuery.execute(DAY);
    expect(restored.resolved).toBe(3);
    expect(restored.remaining).toBe(0);
  });

  it('завершает Решение без открытых Actions, если есть завершённое доказательство', async () => {
    const context = await createContext();
    const decision = createPlannedDecision('complete-decision', DAY);
    const evidence = completeLifeAction(
      markLifeActionInProgress(
        createReadyLifeAction('complete-evidence', DAY, { decisionId: decision.id }),
      ),
    );
    await Promise.all([context.decisions.save(decision), context.actions.save(evidence)]);
    await context.query.execute(DAY);

    const result = await context.command.execute({
      dateKey: DAY,
      entityType: OPEN_LOOP_ENTITY_TYPE.decision,
      entityId: decision.id,
      resolution: OPEN_LOOP_RESOLUTION.complete,
      actualResult: 'Задуманный результат получен',
    });

    expect(result.ok).toBe(true);
    expect((await context.decisions.findById(decision.id))?.status).toBe('confirmed');
    expect((await context.query.execute(DAY)).remaining).toBe(0);
  });

  it.each([OPEN_LOOP_RESOLUTION.complete, OPEN_LOOP_RESOLUTION.drop] as const)(
    'возвращает структурированную бизнес-блокировку для Решения с открытым Action: %s',
    async (resolution) => {
      const context = await createContext();
      const decision = createPlannedDecision(`blocked-${resolution}`, DAY);
      const action = createReadyLifeAction(`blocked-action-${resolution}`, DAY, {
        decisionId: decision.id,
      });
      await Promise.all([context.decisions.save(decision), context.actions.save(action)]);
      await context.query.execute(DAY);

      const result = await context.command.execute({
        dateKey: DAY,
        entityType: OPEN_LOOP_ENTITY_TYPE.decision,
        entityId: decision.id,
        resolution,
        actualResult: 'Итог',
        reason: 'Причина',
      });

      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.error.code).toBe(OPEN_LOOP_BLOCKING_REASON.decisionHasOpenActions);
      expect(isDecisionHasOpenActionsError(result.error)).toBe(true);
      if (!isDecisionHasOpenActionsError(result.error)) return;
      expect(result.error.openActionIds).toEqual([action.id.toString()]);
      expect(result.error.resolution).toBe(resolution);
      expect((await context.decisions.findById(decision.id))?.status).toBe('planned');
      expect((await context.query.execute(DAY)).resolved).toBe(0);
    },
  );

  it('отказывается от Решения без дочерних блокировок и не восстанавливает его после перезагрузки', async () => {
    const context = await createContext();
    const droppedDecision = createPlannedDecision('drop-decision', DAY);
    const nextAction = createReadyLifeAction('next-after-drop', DAY);
    await Promise.all([context.decisions.save(droppedDecision), context.actions.save(nextAction)]);
    await context.query.execute(DAY);

    const result = await context.command.execute({
      dateKey: DAY,
      entityType: OPEN_LOOP_ENTITY_TYPE.decision,
      entityId: droppedDecision.id,
      resolution: OPEN_LOOP_RESOLUTION.drop,
      reason: 'Больше не актуально',
    });
    expect(result.ok).toBe(true);
    expect((await context.decisions.findById(droppedDecision.id))?.status).toBe('cancelled');

    const restoredQuery = new GetOpenLoopsForDay(
      context.days,
      context.decisions,
      context.actions,
      context.sessions,
      context.cyclesService,
    );
    const restored = await restoredQuery.execute(DAY);
    expect(restored.resolved).toBe(1);
    expect(restored.remaining).toBe(1);
    expect(
      restored.items.find((item) => item.entityId === droppedDecision.id.toString())?.resolution,
    ).toBe(OPEN_LOOP_RESOLUTION.drop);
    expect(
      restored.items.find((item) => item.entityId === nextAction.id.toString())?.resolution,
    ).toBeNull();
  });

  it('поддерживает COMPLETE, DROP и не считает REVISE результатом разбора', async () => {
    const context = await createContext();
    const completing = markLifeActionInProgress(createReadyLifeAction('complete', DAY));
    const dropping = createReadyLifeAction('drop', DAY);
    const session = createSession(completing.id);
    await Promise.all([
      context.actions.save(completing),
      context.actions.save(dropping),
      context.sessions.save(session),
    ]);
    await context.query.execute(DAY);

    const revise = await context.command.execute({
      dateKey: DAY,
      entityType: OPEN_LOOP_ENTITY_TYPE.lifeAction,
      entityId: dropping.id,
      resolution: OPEN_LOOP_RESOLUTION.revise,
    });
    expect(revise.ok && revise.value.requiresRevision).toBe(true);
    expect((await context.query.execute(DAY)).resolved).toBe(0);

    await context.command.execute({
      dateKey: DAY,
      entityType: OPEN_LOOP_ENTITY_TYPE.actionSession,
      entityId: session.id,
      resolution: OPEN_LOOP_RESOLUTION.complete,
    });
    const completed = await context.command.execute({
      dateKey: DAY,
      entityType: OPEN_LOOP_ENTITY_TYPE.lifeAction,
      entityId: completing.id,
      resolution: OPEN_LOOP_RESOLUTION.complete,
      actualResult: 'Готовый результат',
    });
    const dropped = await context.command.execute({
      dateKey: DAY,
      entityType: OPEN_LOOP_ENTITY_TYPE.lifeAction,
      entityId: dropping.id,
      resolution: OPEN_LOOP_RESOLUTION.drop,
      reason: 'Больше не нужно',
    });
    expect(completed.ok).toBe(true);
    expect(dropped.ok).toBe(true);
    expect((await context.actions.findById(completing.id))?.status).toBe('completed');
    expect((await context.actions.findById(dropping.id))?.status).toBe('cancelled');
    expect((await context.sessions.findById(session.id))?.completionKind).toBe(
      SESSION_COMPLETION_KIND.completed,
    );
  });

  it('после полуночи использует dayId-владельца и переносит вчерашний элемент на текущий день', async () => {
    const context = await createContext(NEXT_DAY, new Date('2026-08-15T00:10:00.000+09:00'));
    const action = createReadyLifeAction('midnight', DAY);
    await context.actions.save(action);
    await context.query.execute(DAY);
    const result = await context.command.execute({
      dateKey: DAY,
      entityType: OPEN_LOOP_ENTITY_TYPE.lifeAction,
      entityId: action.id,
      resolution: OPEN_LOOP_RESOLUTION.carryForward,
    });
    expect(result.ok).toBe(true);
    expect((await context.actions.findById(action.id))?.plannedDate?.equals(NEXT_DAY)).toBe(true);
  });

  it('ошибка UoW не оставляет половинчатое состояние', async () => {
    const context = await createContext();
    const action = createReadyLifeAction('rollback', DAY);
    await context.actions.save(action);
    await context.query.execute(DAY);
    context.unitOfWork.failNext = true;

    await expect(
      context.command.execute({
        dateKey: DAY,
        entityType: OPEN_LOOP_ENTITY_TYPE.lifeAction,
        entityId: action.id,
        resolution: OPEN_LOOP_RESOLUTION.carryForward,
      }),
    ).rejects.toThrow('test transaction failure');
    expect((await context.actions.findById(action.id))?.plannedDate?.equals(DAY)).toBe(true);
    expect((await context.cycles.findByDateKey(DAY))?.openLoopProgress.resolved).toBe(0);
  });
});

async function createContext(currentDate = DAY, now = EVENING) {
  const days = new FakeDayRepository();
  const decisions = new TestDecisionRepository();
  const actions = new TestLifeActionRepository();
  const sessions = new TestActionSessionRepository();
  const cycles = new TestEveningCycleRepository();
  const clock = new FakeClock(now);
  const ids = new FakeIdGenerator('open-loop');
  const day = Day.openCurrent({
    id: id('day-2026-08-14'),
    currentDate: DAY,
    occurredAt: new Date('2026-08-14T08:00:00.000+09:00'),
    createdEventId: id('day-created'),
    openedEventId: id('day-opened'),
  });
  expect(day.status).toBe(DAY_STATUS.open);
  days.seed(day);
  const cyclesService = new EveningCycleApplicationService(cycles, days, clock, ids);
  const query = new GetOpenLoopsForDay(days, decisions, actions, sessions, cyclesService);
  const unitOfWork = new MemoryOpenLoopUnitOfWork(cycles, decisions, actions, sessions);
  const command = new ResolveOpenLoop(
    query,
    decisions,
    actions,
    sessions,
    unitOfWork,
    new FakeCurrentDateProvider(currentDate),
    clock,
    ids,
  );
  return { days, decisions, actions, sessions, cycles, cyclesService, query, unitOfWork, command };
}

class MemoryOpenLoopUnitOfWork implements OpenLoopResolutionUnitOfWork {
  public failNext = false;

  public constructor(
    private readonly cycles: TestEveningCycleRepository,
    private readonly decisions: TestDecisionRepository,
    private readonly actions: TestLifeActionRepository,
    private readonly sessions: TestActionSessionRepository,
  ) {}

  public async commit(input: CommitOpenLoopResolutionInput): Promise<void> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('test transaction failure');
    }
    const saved = await this.cycles.saveIfVersionMatches(
      input.eveningCycle,
      input.expectedEveningCycleVersion,
    );
    if (!saved) throw new Error('cycle conflict');
    await Promise.all([
      ...input.decisions.map((change) => this.decisions.save(change.decision)),
      ...input.lifeActions.map((change) => this.actions.save(change.lifeAction)),
      ...input.sessions.map((change) => this.sessions.save(change.session)),
    ]);
  }
}

class TestEveningCycleRepository implements EveningCycleRepository {
  readonly #items = new Map<string, EveningCycle>();

  public async findById(id: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((item) => item.id.equals(id)) ?? null;
  }

  public async findByDayId(dayId: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((item) => item.dayId.equals(dayId)) ?? null;
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
}

function createSession(lifeActionId: EntityId): ActionSession {
  const session = ActionSession.start({
    id: id(`session-${lifeActionId.toString()}`),
    lifeActionId,
    startedAt: new Date('2026-08-14T18:00:00.000+09:00'),
    eventId: id(`session-${lifeActionId.toString()}-started`),
  });
  expect(session.status).toBe(ACTION_SESSION_STATUS.running);
  return session;
}

function itemKey(item: { readonly entityType: string; readonly entityId: string }): string {
  return `${item.entityType}:${item.entityId}`;
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
