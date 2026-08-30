import { describe, expect, it, vi } from 'vitest';
import type {
  CommitPreparationInput,
  EveningCycleRepository,
  PreparationPlanRepository,
  PreparationRuleRepository,
  PreparationUnitOfWork,
  ProjectRepository,
  TomorrowPlanRepository,
} from '../ports';
import {
  ActionExpectedResult,
  DECISION_KIND,
  DayDate,
  Decision,
  DecisionTitle,
  EntityId,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EveningCycle,
  ExpectedResult,
  LifeAction,
  LifeActionTitle,
  PREPARATION_CATEGORY,
  PREPARATION_ITEM_STATUS,
  PREPARATION_RULE_CONDITION,
  Project,
  type PreparationPlan,
  type PreparationRule,
  TOMORROW_PLAN_STATUS,
  TomorrowPlan,
} from '../../domain';
import { PREPARATION_AREA } from '../../domain/preparation';
import { FakeClock, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  TestDecisionRepository,
  TestLifeActionRepository,
} from '../../test/helpers/TestRepositories';
import { PreparationService } from './PreparationService';

const CYCLE_DATE = DayDate.create('2026-08-14');
const TARGET_DATE = DayDate.create('2026-08-15');
const NOW = new Date('2026-08-14T14:00:00.000Z');
const AFTER_MIDNIGHT = new Date('2026-08-15T00:10:00.000Z');

describe('PreparationService', () => {
  it('создаёт один план для двух UI-входов и повторно генерирует его без дублей', async () => {
    const context = await createContext();
    await context.service.createRule({
      condition: PREPARATION_RULE_CONDITION.firstActionContains,
      conditionValue: 'изучить',
      category: PREPARATION_CATEGORY.cognitive,
      title: 'Подготовить материалы исследования',
      required: false,
    });

    const first = await context.service.getOrGenerate(CYCLE_DATE);
    const second = await context.secondService.getOrGenerate(CYCLE_DATE);

    expect(second.plan.id.equals(first.plan.id)).toBe(true);
    expect(second.plan.activeItems.map((item) => item.id.toString())).toEqual(
      first.plan.activeItems.map((item) => item.id.toString()),
    );
    expect(new Set(first.plan.activeItems.map((item) => item.category))).toEqual(
      new Set([
        PREPARATION_CATEGORY.physical,
        PREPARATION_CATEGORY.digital,
        PREPARATION_CATEGORY.cognitive,
      ]),
    );
    expect(first.plan.activeItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ area: PREPARATION_AREA.sleepEnvironment }),
        expect.objectContaining({ area: PREPARATION_AREA.tomorrowStart }),
      ]),
    );
    expect(first.recommendedCoreKeys).toHaveLength(4);
  });

  it('requires explicit core confirmation and restores its persisted selection', async () => {
    const context = await createContext();
    const generated = await context.service.getOrGenerate(CYCLE_DATE);

    expect(generated.plan.coreConfigured).toBe(false);
    await expect(context.service.continueToShutdown(CYCLE_DATE)).rejects.toMatchObject({
      code: 'preparation.required_core_not_configured',
    });

    const configured = await context.service.configureRequiredCore(
      CYCLE_DATE,
      generated.recommendedCoreKeys,
    );

    expect(configured.plan.requiredCoreKeys).toEqual(generated.recommendedCoreKeys);
    expect(
      configured.plan.activeItems.filter((item) => item.required).map((item) => item.key),
    ).toEqual(generated.recommendedCoreKeys);

    const refreshed = await context.secondService.getOrGenerate(CYCLE_DATE);
    expect(refreshed.plan.requiredCoreKeys).toEqual(generated.recommendedCoreKeys);
    expect(refreshed.recommendedCoreKeys).toEqual(generated.recommendedCoreKeys);
  });

  it('восстанавливает выполненные и пропущенные пункты после пересоздания сервиса', async () => {
    const context = await createContext();
    const generated = await context.service.getOrGenerate(CYCLE_DATE);
    const [first, second] = generated.plan.activeItems;
    await context.service.completeItem(CYCLE_DATE, first!.id);
    await context.service.skipItem(CYCLE_DATE, second!.id, 'Осознанный пропуск');

    const recovered = await context.secondService.getOrGenerate(CYCLE_DATE);

    expect(recovered.plan.activeItems[0]!.status).toBe(PREPARATION_ITEM_STATUS.completed);
    expect(recovered.plan.activeItems[1]!.status).toBe(PREPARATION_ITEM_STATUS.skipped);
  });

  it('пересчитывает изменённый TomorrowPlan, не дублирует и сохраняет выполненную историю', async () => {
    const context = await createContext();
    const generated = await context.service.getOrGenerate(CYCLE_DATE);
    const workspace = generated.plan.activeItems.find((item) =>
      item.key.startsWith('FIRST_ACTION:action:DEVELOPMENT_WORKSPACE'),
    )!;
    await context.service.completeItem(CYCLE_DATE, workspace.id);

    const meeting = createAction('meeting-action', 'Встреча в офисе', context.decision.id);
    await context.actions.save(meeting);
    const stored = (await context.tomorrowPlans.findByCycleId(context.cycle.id))!;
    const changed = cloneTomorrow(stored);
    const expectedVersion = changed.version;
    changed.assignFirstAction(meeting.id, NOW);
    expect(await context.tomorrowPlans.saveIfVersionMatches(changed, expectedVersion)).toBe(true);

    const recalculated = await context.service.getOrGenerate(CYCLE_DATE);
    const historicalWorkspace = recalculated.plan.items.find((item) => item.id.equals(workspace.id));

    expect(historicalWorkspace).toMatchObject({
      active: false,
      status: PREPARATION_ITEM_STATUS.completed,
    });
    expect(new Set(recalculated.plan.items.map((item) => item.key)).size).toBe(
      recalculated.plan.items.length,
    );
    expect(recalculated.plan.sourceVersion).toBe(changed.version);
  });

  it('работает после полуночи по dateKey/dayId цикла и запрещает SHUTDOWN при PENDING REQUIRED', async () => {
    const context = await createContext(AFTER_MIDNIGHT);
    const generated = await context.service.getOrGenerate(CYCLE_DATE);
    expect(generated.plan.cycleId.equals(context.cycle.id)).toBe(true);
    expect(generated.plan.targetDayId.equals(id('target-day'))).toBe(true);

    await expect(context.service.continueToShutdown(CYCLE_DATE)).rejects.toMatchObject({
      code: 'preparation.required_core_not_configured',
    });
    const configured = await context.service.configureRequiredCore(
      CYCLE_DATE,
      generated.recommendedCoreKeys,
    );
    await expect(context.service.continueToShutdown(CYCLE_DATE)).rejects.toMatchObject({
      code: 'preparation.required_items_pending',
    });
    for (const item of configured.plan.activeItems.filter((candidate) => candidate.required)) {
      await context.service.skipItem(CYCLE_DATE, item.id, 'Осознанно');
    }
    const completed = await context.service.continueToShutdown(CYCLE_DATE);

    expect(completed.plan.completedAt).toEqual(AFTER_MIDNIGHT);
    expect((await context.cycles.findByDayId(id('source-day')))?.state).toBe(
      EVENING_CYCLE_STATE.shutdown,
    );

    const repeated = await context.secondService.continueToShutdown(CYCLE_DATE);
    expect(repeated.plan.id.equals(completed.plan.id)).toBe(true);
    expect(repeated.plan.version).toBe(completed.plan.version);
  });

  it('редактирует и повторно сохраняет PreparationPlan после COMPLETED без отката цикла', async () => {
    const context = await createContext(NOW, EVENING_CYCLE_STATE.completed);
    const generated = await context.service.getOrGenerate(CYCLE_DATE);
    const first = generated.plan.activeItems[0]!;

    await context.service.completeItem(CYCLE_DATE, first.id);
    const skipped = await context.service.skipItem(
      CYCLE_DATE,
      first.id,
      'Уточнение после завершения',
    );
    expect(skipped.plan.activeItems[0]!.status).toBe(PREPARATION_ITEM_STATUS.skipped);

    const restored = await context.service.completeItem(CYCLE_DATE, first.id);
    expect(restored.plan.activeItems[0]!.status).toBe(PREPARATION_ITEM_STATUS.completed);
    const configured = await context.service.configureRequiredCore(
      CYCLE_DATE,
      restored.recommendedCoreKeys,
    );
    for (const item of configured.plan.activeItems.filter(
      (candidate) => candidate.required && candidate.status === PREPARATION_ITEM_STATUS.pending,
    )) {
      await context.service.completeItem(CYCLE_DATE, item.id);
    }
    const saved = await context.service.continueToShutdown(CYCLE_DATE);
    const refreshed = await context.secondService.getOrGenerate(CYCLE_DATE);

    expect(saved.plan.completedAt).not.toBeNull();
    expect(refreshed.plan.completedAt).toEqual(saved.plan.completedAt);
    expect(refreshed.plan.activeItems[0]!.status).toBe(PREPARATION_ITEM_STATUS.completed);
    expect((await context.cycles.findByDateKey(CYCLE_DATE))?.state).toBe(
      EVENING_CYCLE_STATE.completed,
    );
  });

  it('returns completed history unchanged when rules and TomorrowPlan later change', async () => {
    const context = await createContext(NOW, EVENING_CYCLE_STATE.completed);
    const generated = await context.service.getOrGenerate(CYCLE_DATE);
    const configured = await context.service.configureRequiredCore(
      CYCLE_DATE,
      generated.recommendedCoreKeys,
    );
    for (const item of configured.plan.activeItems.filter((candidate) => candidate.required)) {
      await context.service.skipItem(CYCLE_DATE, item.id, 'История сохранена');
    }
    const completed = await context.service.continueToShutdown(CYCLE_DATE);

    await context.service.createRule({
      condition: PREPARATION_RULE_CONDITION.firstActionContains,
      conditionValue: 'изучить',
      category: PREPARATION_CATEGORY.cognitive,
      title: 'Новое правило',
      required: false,
    });
    const tomorrow = (await context.tomorrowPlans.findByCycleId(context.cycle.id))!;
    const changedTomorrow = cloneTomorrow(tomorrow);
    const replacement = createAction('replacement', 'Встреча в офисе', context.decision.id);
    await context.actions.save(replacement);
    changedTomorrow.assignFirstAction(replacement.id, NOW);
    expect(await context.tomorrowPlans.saveIfVersionMatches(changedTomorrow, tomorrow.version)).toBe(
      true,
    );
    const save = vi.spyOn(context.preparationPlans, 'saveIfVersionMatches');

    const recovered = await context.secondService.getOrGenerate(CYCLE_DATE);

    expect(recovered.plan.version).toBe(completed.plan.version);
    expect(recovered.plan.items).toEqual(completed.plan.items);
    expect(save).not.toHaveBeenCalled();
  });
});

async function createContext(
  now = NOW,
  cycleState:
    | typeof EVENING_CYCLE_STATE.preparing
    | typeof EVENING_CYCLE_STATE.completed = EVENING_CYCLE_STATE.preparing,
) {
  const cycles = new InMemoryEveningCycleRepository();
  const tomorrowPlans = new InMemoryTomorrowPlanRepository();
  const preparationPlans = new InMemoryPreparationPlanRepository();
  const rules = new InMemoryPreparationRuleRepository();
  const decisions = new TestDecisionRepository();
  const actions = new TestLifeActionRepository();
  const projects = new InMemoryProjectRepository();
  const clock = new FakeClock(now);
  const cycle = cycleForPreparation(cycleState);
  const project = Project.create({ id: id('project'), title: 'LifeOS', now: NOW });
  const decision = createDecision(project.id);
  const action = createAction('action', 'Изучить и продолжить разработку LifeOS', decision.id);
  const tomorrow = completedTomorrow(cycle, decision.id, action.id);
  await cycles.createIfAbsent(cycle);
  await tomorrowPlans.createIfAbsent(tomorrow);
  await projects.create(project);
  await decisions.save(decision);
  await actions.save(action);
  const unitOfWork = new MemoryPreparationUnitOfWork(preparationPlans, cycles);
  const createService = (prefix: string) =>
    new PreparationService(
      cycles,
      tomorrowPlans,
      preparationPlans,
      rules,
      decisions,
      actions,
      projects,
      clock,
      new FakeIdGenerator(prefix),
      unitOfWork,
    );
  return {
    cycles,
    tomorrowPlans,
    preparationPlans,
    actions,
    cycle,
    decision,
    service: createService('first-ui'),
    secondService: createService('second-ui'),
  };
}

class MemoryPreparationUnitOfWork implements PreparationUnitOfWork {
  public constructor(
    private readonly plans: InMemoryPreparationPlanRepository,
    private readonly cycles: InMemoryEveningCycleRepository,
  ) {}
  public async commit(input: CommitPreparationInput): Promise<void> {
    const planSaved =
      input.expectedPlanVersion === null
        ? (await this.plans.createIfAbsent(input.plan)).id.equals(input.plan.id)
        : await this.plans.saveIfVersionMatches(input.plan, input.expectedPlanVersion);
    const cycleSaved =
      input.eveningCycle === undefined || input.expectedEveningCycleVersion === undefined
        ? true
        : await this.cycles.saveIfVersionMatches(
            input.eveningCycle,
            input.expectedEveningCycleVersion,
          );
    if (!planSaved || !cycleSaved) throw new Error('conflict');
  }
}

class InMemoryEveningCycleRepository implements EveningCycleRepository {
  readonly #items = new Map<string, EveningCycle>();
  public async findById(value: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((item) => item.id.equals(value)) ?? null;
  }
  public async findByDayId(value: EntityId): Promise<EveningCycle | null> {
    return [...this.#items.values()].find((item) => item.dayId.equals(value)) ?? null;
  }
  public async findByDateKey(value: DayDate): Promise<EveningCycle | null> {
    return this.#items.get(value.toString()) ?? null;
  }
  public async createIfAbsent(cycle: EveningCycle): Promise<EveningCycle> {
    const stored = await this.findByDateKey(cycle.dateKey);
    if (stored !== null) return stored;
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

class InMemoryTomorrowPlanRepository implements TomorrowPlanRepository {
  readonly #items = new Map<string, TomorrowPlan>();
  public async findById(value: EntityId): Promise<TomorrowPlan | null> {
    return this.#items.get(value.toString()) ?? null;
  }
  public async findByCycleId(value: EntityId): Promise<TomorrowPlan | null> {
    return [...this.#items.values()].find((item) => item.cycleId.equals(value)) ?? null;
  }
  public async findByTargetDate(value: DayDate): Promise<TomorrowPlan | null> {
    return [...this.#items.values()].find((item) => item.targetDateKey.equals(value)) ?? null;
  }
  public async createIfAbsent(plan: TomorrowPlan): Promise<TomorrowPlan> {
    const stored = await this.findByCycleId(plan.cycleId);
    if (stored !== null) return stored;
    this.#items.set(plan.id.toString(), plan);
    return plan;
  }
  public async saveIfVersionMatches(plan: TomorrowPlan, expectedVersion: number): Promise<boolean> {
    const stored = await this.findById(plan.id);
    if (stored === null || stored.version !== expectedVersion) return false;
    this.#items.set(plan.id.toString(), plan);
    return true;
  }
}

class InMemoryPreparationPlanRepository implements PreparationPlanRepository {
  readonly #items = new Map<string, PreparationPlan>();
  public async findById(value: EntityId): Promise<PreparationPlan | null> {
    return this.#items.get(value.toString()) ?? null;
  }
  public async findByCycleId(value: EntityId): Promise<PreparationPlan | null> {
    return [...this.#items.values()].find((item) => item.cycleId.equals(value)) ?? null;
  }
  public async findByTomorrowPlanId(value: EntityId): Promise<PreparationPlan | null> {
    return [...this.#items.values()].find((item) => item.tomorrowPlanId.equals(value)) ?? null;
  }
  public async findByTargetDayId(value: EntityId): Promise<PreparationPlan | null> {
    return [...this.#items.values()].find((item) => item.targetDayId.equals(value)) ?? null;
  }
  public async createIfAbsent(plan: PreparationPlan): Promise<PreparationPlan> {
    const stored = await this.findByCycleId(plan.cycleId);
    if (stored !== null) return stored;
    this.#items.set(plan.id.toString(), plan);
    return plan;
  }
  public async saveIfVersionMatches(
    plan: PreparationPlan,
    expectedVersion: number,
  ): Promise<boolean> {
    const stored = await this.findById(plan.id);
    if (stored === null || stored.version !== expectedVersion) return false;
    this.#items.set(plan.id.toString(), plan);
    return true;
  }
}

class InMemoryPreparationRuleRepository implements PreparationRuleRepository {
  readonly #items = new Map<string, PreparationRule>();
  public async findActive(): Promise<readonly PreparationRule[]> {
    return [...this.#items.values()].filter((item) => item.active);
  }
  public async save(rule: PreparationRule): Promise<void> {
    this.#items.set(rule.id.toString(), rule);
  }
}

class InMemoryProjectRepository implements ProjectRepository {
  readonly #items = new Map<string, Project>();
  public async findById(value: EntityId): Promise<Project | null> {
    return this.#items.get(value.toString()) ?? null;
  }
  public async findAll(): Promise<readonly Project[]> {
    return [...this.#items.values()];
  }
  public async findBySphereId(value: EntityId): Promise<readonly Project[]> {
    return [...this.#items.values()].filter((item) => item.sphereId?.equals(value));
  }
  public async findByDirectionId(value: EntityId): Promise<readonly Project[]> {
    return [...this.#items.values()].filter((item) => item.directionId?.equals(value));
  }
  public async create(project: Project): Promise<boolean> {
    if (this.#items.has(project.id.toString())) return false;
    this.#items.set(project.id.toString(), project);
    return true;
  }
  public async createAndReplaceMain(project: Project, updatedAt: Date): Promise<boolean> {
    void updatedAt;
    return this.create(project);
  }
  public async updateIfVersionMatches(project: Project, expectedVersion: number): Promise<boolean> {
    if ((await this.findById(project.id))?.version !== expectedVersion) return false;
    this.#items.set(project.id.toString(), project);
    return true;
  }
  public async replaceMain(
    project: Project,
    expectedVersion: number,
    updatedAt: Date,
  ): Promise<boolean> {
    void updatedAt;
    return this.updateIfVersionMatches(project, expectedVersion);
  }
}

function cycleForPreparation(
  state: typeof EVENING_CYCLE_STATE.preparing | typeof EVENING_CYCLE_STATE.completed,
): EveningCycle {
  return EveningCycle.rehydrate({
    id: id('cycle'),
    dayId: id('source-day'),
    dateKey: CYCLE_DATE,
    state,
    mode: EVENING_CYCLE_MODE.normal,
    startedAt: NOW,
    updatedAt: NOW,
    completedAt: state === EVENING_CYCLE_STATE.completed ? NOW : null,
    version: 6,
  });
}

function completedTomorrow(
  cycle: EveningCycle,
  decisionId: EntityId,
  actionId: EntityId,
): TomorrowPlan {
  return TomorrowPlan.rehydrate({
    id: id('tomorrow'),
    cycleId: cycle.id,
    sourceDayId: cycle.dayId,
    targetDayId: id('target-day'),
    targetDateKey: TARGET_DATE,
    directionId: null,
    vector: null,
    primaryDecisionId: decisionId,
    minimumOutcome: 'Продвинуть LifeOS',
    targetOutcome: null,
    stretchOutcome: null,
    firstActionId: actionId,
    supportingDecisionIds: [],
    status: TOMORROW_PLAN_STATUS.completed,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: NOW,
    version: 5,
  });
}

function createDecision(projectId: EntityId): Decision {
  const decision = Decision.createDraft({
    id: id('decision'),
    title: DecisionTitle.create('Разработка LifeOS'),
    kind: DECISION_KIND.main,
    expectedResult: ExpectedResult.create('Готов этап'),
    projectId,
    occurredAt: NOW,
    eventId: id('decision-created'),
  });
  decision.plan({
    plannedDate: TARGET_DATE,
    kind: DECISION_KIND.main,
    order: 1,
    expectedResult: ExpectedResult.create('Готов этап'),
    occurredAt: NOW,
    eventId: id('decision-planned'),
  });
  return decision;
}

function createAction(value: string, title: string, decisionId: EntityId): LifeAction {
  const action = LifeAction.createDraft({
    id: id(value),
    title: LifeActionTitle.create(title),
    decisionId,
    createdAt: NOW,
    eventId: id(`${value}-created`),
  });
  action.makeReady({
    expectedResult: ActionExpectedResult.create('Первый шаг сделан'),
    plannedDate: TARGET_DATE,
    occurredAt: NOW,
    eventId: id(`${value}-ready`),
  });
  return action;
}

function cloneTomorrow(plan: TomorrowPlan): TomorrowPlan {
  return TomorrowPlan.rehydrate({
    id: plan.id,
    cycleId: plan.cycleId,
    sourceDayId: plan.sourceDayId,
    targetDayId: plan.targetDayId,
    targetDateKey: plan.targetDateKey,
    directionId: plan.directionId,
    vector: plan.vector,
    primaryDecisionId: plan.primaryDecisionId,
    minimumOutcome: plan.minimumOutcome,
    targetOutcome: plan.targetOutcome,
    stretchOutcome: plan.stretchOutcome,
    firstActionId: plan.firstActionId,
    supportingDecisionIds: plan.supportingDecisionIds,
    status: plan.status,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    completedAt: plan.completedAt,
    version: plan.version,
  });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
