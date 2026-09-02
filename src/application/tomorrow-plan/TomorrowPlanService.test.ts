import { beforeEach, describe, expect, it } from 'vitest';
import {
  DECISION_KIND,
  Day,
  DayDate,
  Decision,
  DecisionTitle,
  type DecisionKind,
  EntityId,
  EveningCycle,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  ExpectedResult,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_REQUIREMENT,
  OPEN_LOOP_RESOLUTION,
  OpenLoopResolution,
  OpenLoopReference,
  REFLECTION_SIGNAL_TYPE,
  ReflectionSignal,
  TomorrowPlan,
} from '../../domain';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../test/helpers/Fakes';
import {
  TestDecisionRepository,
  TestLifeActionRepository,
} from '../../test/helpers/TestRepositories';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import type { TomorrowPlanRepository } from '../ports/TomorrowPlanRepository';
import type {
  CommitTomorrowPlanInput,
  TomorrowPlanUnitOfWork,
} from '../ports/TomorrowPlanUnitOfWork';
import { TomorrowPlanService } from './TomorrowPlanService';

const SOURCE = DayDate.create('2026-08-14');
const TARGET = DayDate.create('2026-08-15');
const NOW = new Date('2026-08-14T20:00:00.000Z');

describe('TomorrowPlanService', () => {
  let context: TestContext;

  beforeEach(async () => {
    context = await createContext();
  });

  it('создаёт один план, восстанавливает частичный прогресс и отдаёт его второму UI-входу', async () => {
    const first = await context.service.getOrCreate(SOURCE);
    const again = await context.service.getOrCreate(SOURCE);
    expect(again.plan.id.equals(first.plan.id)).toBe(true);

    const decision = await context.service.createPrimaryDecision(SOURCE, {
      title: 'Завершить Tomorrow Composer',
      expectedResult: 'Рабочая модель',
    });
    await context.service.setOutcomes(
      SOURCE,
      'Рабочая модель',
      'Модель и интеграция',
      'Модель, UI и тесты',
    );

    const recovered = await context.service.getOrCreate(SOURCE);
    const secondEntry = await context.service.getByTargetDate(TARGET);
    expect(recovered.plan.primaryDecisionId?.equals(decision.plan.primaryDecisionId!)).toBe(true);
    expect(recovered.plan.minimumOutcome).toBe('Рабочая модель');
    expect(secondEntry?.plan.id.equals(first.plan.id)).toBe(true);
  });

  it('не подменяет цикл чужим TomorrowPlan с той же целевой датой', async () => {
    await context.plans.createIfAbsent(
      TomorrowPlan.create({
        id: EntityId.create('foreign-plan'),
        cycleId: EntityId.create('foreign-cycle'),
        sourceDayId: EntityId.create('foreign-day'),
        targetDayId: EntityId.create('foreign-target-day'),
        targetDateKey: TARGET,
        createdAt: NOW,
      }),
    );

    await expect(context.service.getOrCreate(SOURCE)).rejects.toMatchObject({
      code: 'tomorrow_plan.target_date_conflict',
    });
    expect(await context.plans.findByCycleId(EntityId.create('cycle-e5'))).toBeNull();
  });

  it('создаёт первый LifeAction с предметной связью на главное Решение и повторно не создаёт сущности', async () => {
    await context.service.getOrCreate(SOURCE);
    const withDecision = await context.service.createPrimaryDecision(SOURCE, {
      title: 'E5',
      expectedResult: 'Рабочий E5',
    });
    const withAction = await context.service.createFirstAction(SOURCE, {
      title: 'Открыть TomorrowPlanService',
      expectedResult: 'Проверен переход PLANNING_TOMORROW',
    });
    const action = withAction.firstAction;
    expect(action?.decisionId?.equals(withDecision.plan.primaryDecisionId!)).toBe(true);
    expect(action?.plannedDate?.equals(TARGET)).toBe(true);

    const savedAgain = await context.service.assignFirstAction(SOURCE, action!.id);
    expect(savedAgain.plan.firstActionId?.equals(action!.id)).toBe(true);
    expect(
      await context.lifeActions.findByDecisionId(withDecision.plan.primaryDecisionId!),
    ).toHaveLength(1);
  });

  it('назначает кандидата первого шага по целевой дате из Morning Center', async () => {
    await context.service.getOrCreate(SOURCE);
    await context.service.createPrimaryDecision(SOURCE, {
      title: 'Главное действие утра',
      expectedResult: 'Понятный результат',
    });
    const first = await context.service.createFirstAction(SOURCE, {
      title: 'Первый кандидат',
      expectedResult: 'Первый результат',
    });
    const second = await context.service.createFirstAction(SOURCE, {
      title: 'Второй кандидат',
      expectedResult: 'Второй результат',
    });
    expect(second.plan.firstActionId?.equals(second.firstAction!.id)).toBe(true);

    const selected = await context.service.assignFirstActionForTargetDate(
      TARGET,
      first.firstAction!.id,
    );

    expect(selected.plan.firstActionId?.equals(first.firstAction!.id)).toBe(true);
  });

  it('подхватывает CARRY_FORWARD из E3 и показывает SCOPE_TOO_LARGE из E4 без автокоррекции', async () => {
    const carried = createDecision('carried-main', DECISION_KIND.main, 1);
    const cycle = planningCycle(carried.id, true);
    context = await createContext(cycle, [carried]);

    const snapshot = await context.service.getOrCreate(SOURCE);
    expect(snapshot.plan.primaryDecisionId?.equals(carried.id)).toBe(true);
    expect(snapshot.carriedDecisionCandidate?.id.equals(carried.id)).toBe(true);
    expect(snapshot.scopeTooLargeWarning).toBe(true);
    expect(snapshot.plan.minimumOutcome).toBeNull();
  });

  it('ограничивает фокус двумя дополнительными Решениями', async () => {
    await context.service.getOrCreate(SOURCE);
    const primary = createDecision('main', DECISION_KIND.main, 1);
    const support1 = createDecision('support-1', DECISION_KIND.additional, null);
    const support2 = createDecision('support-2', DECISION_KIND.additional, null);
    const support3 = createDecision('support-3', DECISION_KIND.additional, null);
    for (const decision of [primary, support1, support2, support3])
      await context.decisions.save(decision);
    await context.service.assignPrimaryDecision(SOURCE, primary.id);
    const saved = await context.service.setSupportingDecisions(SOURCE, [support1.id, support2.id]);
    expect(saved.plan.supportingDecisionIds).toHaveLength(2);
    await expect(
      context.service.setSupportingDecisions(SOURCE, [support1.id, support2.id, support3.id]),
    ).rejects.toThrow(/не более двух/);
  });

  it('создаёт новое дополнительное Решение через то же атомарное ядро', async () => {
    await context.service.getOrCreate(SOURCE);
    const primary = createDecision('main-for-support', DECISION_KIND.main, 1);
    await context.decisions.save(primary);
    await context.service.assignPrimaryDecision(SOURCE, primary.id);
    const saved = await context.service.createSupportingDecision(SOURCE, {
      title: 'Проверить документацию',
    });
    expect(saved.supportingDecisions.map((decision) => decision.title.toString())).toEqual([
      'Проверить документацию',
    ]);
  });

  it('переводит PLANNING_TOMORROW в PREPARING только при готовом минимуме', async () => {
    await context.service.getOrCreate(SOURCE);
    await context.service.createPrimaryDecision(SOURCE, {
      title: 'E5',
      expectedResult: 'Рабочий E5',
    });
    await context.service.setOutcomes(SOURCE, 'Рабочая модель');
    await expect(context.service.complete(SOURCE)).rejects.toThrow(/первый шаг/);
    await context.service.createFirstAction(SOURCE, {
      title: 'Открыть сервис',
      expectedResult: 'Сервис открыт',
    });
    const completed = await context.service.complete(SOURCE);
    expect(completed.plan.completedAt).not.toBeNull();
    expect((await context.cycles.findByDateKey(SOURCE))?.state).toBe(EVENING_CYCLE_STATE.preparing);
  });

  it('редактирует TomorrowPlan после COMPLETED и не откатывает EveningCycle', async () => {
    context = await createContext(completedCycle());
    await context.service.getOrCreate(SOURCE);
    const primary = await context.service.createPrimaryDecision(SOURCE, {
      title: 'Уточнённое главное Решение',
      expectedResult: 'Проверяемый результат',
    });
    await context.service.setVector(SOURCE, 'Ясный вектор');
    await context.service.setOutcomes(SOURCE, 'Минимум', 'Норма', 'Максимум');
    const withAction = await context.service.createFirstAction(SOURCE, {
      title: 'Открыть первый файл',
      expectedResult: 'Первый шаг выполнен',
    });
    const withSupporting = await context.service.createSupportingDecision(SOURCE, {
      title: 'Дополнительное Решение',
    });
    const saved = await context.service.complete(SOURCE);

    expect(primary.plan.primaryDecisionId).not.toBeNull();
    expect(withAction.plan.firstActionId).not.toBeNull();
    expect(withSupporting.plan.supportingDecisionIds).toHaveLength(1);
    expect(saved.plan.minimumOutcome).toBe('Минимум');
    expect(saved.plan.targetOutcome).toBe('Норма');
    expect(saved.plan.stretchOutcome).toBe('Максимум');
    expect((await context.cycles.findByDateKey(SOURCE))?.state).toBe(EVENING_CYCLE_STATE.completed);
  });
});

interface TestContext {
  readonly service: TomorrowPlanService;
  readonly plans: TestTomorrowPlanRepository;
  readonly days: FakeDayRepository;
  readonly decisions: TestDecisionRepository;
  readonly lifeActions: TestLifeActionRepository;
  readonly cycles: TestEveningCycleRepository;
}

async function createContext(
  cycle = planningCycle(),
  seededDecisions: readonly Decision[] = [],
): Promise<TestContext> {
  const plans = new TestTomorrowPlanRepository();
  const days = new FakeDayRepository();
  const decisions = new TestDecisionRepository();
  const lifeActions = new TestLifeActionRepository();
  const cycles = new TestEveningCycleRepository();
  await days.save(
    Day.createCurrentPlanned({
      id: cycle.dayId,
      currentDate: SOURCE,
      occurredAt: NOW,
      createdEventId: EntityId.create('event-day'),
    }),
  );
  await cycles.createIfAbsent(cycle);
  for (const decision of seededDecisions) await decisions.save(decision);
  const unitOfWork = new MemoryTomorrowPlanUnitOfWork(plans, days, decisions, lifeActions, cycles);
  const service = new TomorrowPlanService(
    cycles,
    plans,
    days,
    decisions,
    lifeActions,
    new FakeCurrentDateProvider(SOURCE),
    new FakeClock(NOW),
    new FakeIdGenerator('e5'),
    unitOfWork,
  );
  return { service, plans, days, decisions, lifeActions, cycles };
}

class MemoryTomorrowPlanUnitOfWork implements TomorrowPlanUnitOfWork {
  public constructor(
    private readonly plans: TestTomorrowPlanRepository,
    private readonly days: FakeDayRepository,
    private readonly decisions: TestDecisionRepository,
    private readonly actions: TestLifeActionRepository,
    private readonly cycles: TestEveningCycleRepository,
  ) {}

  public async commit(input: CommitTomorrowPlanInput): Promise<void> {
    if (input.targetDay !== undefined) await this.days.save(input.targetDay);
    if (input.newDecision !== undefined) await this.decisions.save(input.newDecision);
    if (input.newLifeAction !== undefined) await this.actions.save(input.newLifeAction);
    if (input.expectedPlanVersion === null) {
      await this.plans.createIfAbsent(input.plan);
    } else if (!(await this.plans.saveIfVersionMatches(input.plan, input.expectedPlanVersion))) {
      throw new Error('plan conflict');
    }
    if (input.eveningCycle !== undefined) {
      if (
        !(await this.cycles.saveIfVersionMatches(
          input.eveningCycle,
          input.expectedEveningCycleVersion!,
        ))
      )
        throw new Error('cycle conflict');
    }
  }
}

class TestTomorrowPlanRepository implements TomorrowPlanRepository {
  readonly #items = new Map<string, TomorrowPlan>();

  public async findById(id: EntityId): Promise<TomorrowPlan | null> {
    return this.#items.get(id.toString()) ?? null;
  }

  public async findByCycleId(cycleId: EntityId): Promise<TomorrowPlan | null> {
    return [...this.#items.values()].find((plan) => plan.cycleId.equals(cycleId)) ?? null;
  }

  public async findByTargetDate(date: DayDate): Promise<TomorrowPlan | null> {
    return [...this.#items.values()].find((plan) => plan.targetDateKey.equals(date)) ?? null;
  }

  public async createIfAbsent(plan: TomorrowPlan): Promise<TomorrowPlan> {
    const existing = await this.findByCycleId(plan.cycleId);
    if (existing !== null) return existing;
    this.#items.set(plan.id.toString(), plan);
    return plan;
  }

  public async saveIfVersionMatches(plan: TomorrowPlan, expectedVersion: number): Promise<boolean> {
    const stored = this.#items.get(plan.id.toString());
    if (stored?.version !== expectedVersion) return false;
    this.#items.set(plan.id.toString(), plan);
    return true;
  }
}

class TestEveningCycleRepository implements EveningCycleRepository {
  readonly #items = new Map<string, EveningCycle>();

  public async findById(id: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((cycle) => cycle.id.equals(id)) ?? null;
  }

  public async findByDayId(dayId: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null;
  }

  public async findByDateKey(date: DayDate): Promise<EveningCycle | null> {
    return this.#items.get(date.toString()) ?? null;
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
    if (stored?.version !== expectedVersion) return false;
    this.#items.set(cycle.dateKey.toString(), cycle);
    return true;
  }
}

function planningCycle(carriedDecisionId?: EntityId, scopeTooLarge = false): EveningCycle {
  const cycleId = EntityId.create('cycle-e5');
  return EveningCycle.rehydrate({
    id: cycleId,
    dayId: EntityId.create('day-source'),
    dateKey: SOURCE,
    state: EVENING_CYCLE_STATE.planningTomorrow,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    openLoopReferences:
      carriedDecisionId === undefined
        ? []
        : [
            OpenLoopReference.create({
              entityType: OPEN_LOOP_ENTITY_TYPE.decision,
              entityId: carriedDecisionId,
              requirement: OPEN_LOOP_REQUIREMENT.requiresResolution,
              sourceVersion: 1,
            }),
          ],
    openLoopResolutions:
      carriedDecisionId === undefined
        ? []
        : [
            OpenLoopResolution.create({
              entityType: OPEN_LOOP_ENTITY_TYPE.decision,
              entityId: carriedDecisionId,
              resolution: OPEN_LOOP_RESOLUTION.carryForward,
              resolvedAt: NOW,
            }),
          ],
    reflectionSignals:
      scopeTooLarge && carriedDecisionId !== undefined
        ? [
            ReflectionSignal.create({
              type: REFLECTION_SIGNAL_TYPE.scopeTooLarge,
              sourceEntityId: carriedDecisionId,
              cycleId,
              createdAt: NOW,
            }),
          ]
        : [],
    version: 5,
  });
}

function completedCycle(): EveningCycle {
  return EveningCycle.rehydrate({
    id: EntityId.create('cycle-e5-completed'),
    dayId: EntityId.create('day-source'),
    dateKey: SOURCE,
    state: EVENING_CYCLE_STATE.completed,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    version: 10,
  });
}

function createDecision(id: string, kind: DecisionKind, order: number | null): Decision {
  const decision = Decision.createDraft({
    id: EntityId.create(id),
    title: DecisionTitle.create(id),
    kind,
    occurredAt: NOW,
    eventId: EntityId.create(`${id}-draft`),
  });
  decision.plan({
    plannedDate: TARGET,
    kind,
    order,
    expectedResult: ExpectedResult.create('Результат'),
    occurredAt: NOW,
    eventId: EntityId.create(`${id}-planned`),
  });
  return decision;
}
