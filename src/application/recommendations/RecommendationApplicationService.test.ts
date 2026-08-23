import { describe, expect, it } from 'vitest';
import {
  DECISION_KIND,
  DayDate,
  EntityId,
  LifeActionTitle,
  ActionExpectedResult,
  LifeAction,
  PreparationPlan,
  TomorrowPlan,
  type Decision,
  type LifeAction as LifeActionEntity,
} from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import { createReadyLifeAction } from '../../test/helpers/LifeActionTestFactory';
import { FakeClock } from '../../test/helpers/Fakes';
import { TestDecisionRepository } from '../../test/helpers/TestRepositories';
import type { RecommendationApplicationRepository } from '../ports/RecommendationApplicationRepository';
import type { PreparationPlanRepository } from '../ports/PreparationPlanRepository';
import type { RecommendationApplicationCommit } from '../ports/TomorrowPlanUnitOfWork';
import type {
  NewTomorrowFirstActionInput,
  TomorrowPlanService,
  TomorrowPlanSnapshot,
} from '../tomorrow-plan';
import { cloneTomorrowPlan } from '../tomorrow-plan';
import { EVENING_HISTORY_RANGE_KIND, type EveningHistoryRange } from '../queries/GetEveningHistory';
import {
  EVENING_RECOMMENDATION_APPLICABILITY,
  EVENING_RECOMMENDATION_PRIORITY,
  EVENING_RECOMMENDATION_TYPE,
  type EveningRecommendation,
  type EveningRecommendationType,
} from '../queries/GetEveningRecommendations';
import {
  RECOMMENDATION_APPLICATION_STATUS,
  type RecommendationApplication,
  type RecommendationApplicationStatus,
} from './RecommendationApplication';
import {
  RECOMMENDATION_PREVIEW_KIND,
  RecommendationApplicationService,
} from './RecommendationApplicationService';

const SOURCE = DayDate.create('2026-08-20');
const TARGET = DayDate.create('2026-08-21');
const NOW = new Date('2026-08-20T12:00:00.000Z');
const RANGE: EveningHistoryRange = {
  kind: EVENING_HISTORY_RANGE_KIND.last7Days,
  endDate: SOURCE,
};

describe('E10.5 RecommendationApplicationService', () => {
  it('показывает targetOutcome preview без изменения данных и применяет только после confirmation', async () => {
    const context = await createContext();
    const recommendation = recommendationOf(
      EVENING_RECOMMENDATION_TYPE.reducePrimaryDecisionTarget,
    );
    const versionBefore = context.commands.snapshot.plan.version;

    const preview = await context.service.preview(recommendation, { cycleDate: SOURCE });

    expect(preview).toMatchObject({
      kind: RECOMMENDATION_PREVIEW_KIND.targetOutcome,
      currentValue: 'Полностью закончить весь модуль',
      proposedValue: null,
      opensExistingEditor: true,
    });
    expect(context.commands.snapshot.plan.version).toBe(versionBefore);
    expect(context.commands.setOutcomesCalls).toBe(0);
    expect(context.commands.getOrCreateCalls).toBe(0);

    const applied = await context.service.apply(
      recommendation,
      { cycleDate: SOURCE },
      {
        kind: 'SET_TARGET_OUTCOME',
        targetOutcome: 'Завершить рабочий сценарий и основные тесты',
      },
    );

    expect(applied).toMatchObject({
      status: RECOMMENDATION_APPLICATION_STATUS.applied,
      resultMessage: 'Норма главного Решения обновлена.',
    });
    expect(context.commands.snapshot.plan.targetOutcome).toBe(
      'Завершить рабочий сценарий и основные тесты',
    );
    expect(context.commands.setOutcomesCalls).toBe(1);

    const repeated = await context.service.apply(
      recommendation,
      { cycleDate: SOURCE },
      { kind: 'SET_TARGET_OUTCOME', targetOutcome: 'Другой текст' },
    );
    expect(repeated).toEqual(applied);
    expect(context.commands.setOutcomesCalls).toBe(1);
  });

  it('не придумывает targetOutcome, но показывает конкретное значение из Recommendation', async () => {
    const context = await createContext();
    const recommendation = recommendationOf(
      EVENING_RECOMMENDATION_TYPE.reducePrimaryDecisionTarget,
      [],
      'Завершить рабочий сценарий и основные тесты',
    );

    await expect(
      context.service.preview(recommendation, { cycleDate: SOURCE }),
    ).resolves.toMatchObject({
      proposedValue: 'Завершить рабочий сценарий и основные тесты',
      opensExistingEditor: false,
    });
    expect(context.commands.setOutcomesCalls).toBe(0);
  });

  it('создаёт firstAction через существующую команду и не создаёт дубликат при повторном apply', async () => {
    const context = await createContext();
    const recommendation = recommendationOf(EVENING_RECOMMENDATION_TYPE.defineFirstAction);

    const preview = await context.service.preview(recommendation, { cycleDate: SOURCE });
    expect(preview).toMatchObject({
      kind: RECOMMENDATION_PREVIEW_KIND.firstAction,
      currentValue: null,
    });
    expect(context.commands.createFirstActionCalls).toBe(0);

    await context.service.apply(
      recommendation,
      { cycleDate: SOURCE },
      {
        kind: 'CREATE_FIRST_ACTION',
        title: 'Открыть сценарий E10.5',
        expectedResult: 'Первый тест запущен',
      },
    );
    await context.service.apply(
      recommendation,
      { cycleDate: SOURCE },
      {
        kind: 'CREATE_FIRST_ACTION',
        title: 'Дубликат',
        expectedResult: 'Не должен появиться',
      },
    );

    expect(context.commands.createFirstActionCalls).toBe(1);
    expect(context.commands.snapshot.firstAction?.title.toString()).toBe('Открыть сценарий E10.5');
    expect(await context.applications.findByRecommendationId(recommendation.id)).toMatchObject({
      resultMessage: 'Первый шаг на завтра определён.',
    });
  });

  it('назначает выбранный существующий firstAction через assignFirstAction', async () => {
    const context = await createContext();
    const recommendation = recommendationOf(EVENING_RECOMMENDATION_TYPE.defineFirstAction);
    const preview = await context.service.preview(recommendation, { cycleDate: SOURCE });
    if (preview.kind !== RECOMMENDATION_PREVIEW_KIND.firstAction) throw new Error('preview');

    await context.service.apply(
      recommendation,
      { cycleDate: SOURCE },
      {
        kind: 'ASSIGN_FIRST_ACTION',
        actionId: preview.candidateActions[0]!.id,
      },
    );

    expect(context.commands.assignFirstActionCalls).toBe(1);
    expect(context.commands.createFirstActionCalls).toBe(0);
    expect(context.commands.snapshot.firstAction?.id.toString()).toBe(
      preview.candidateActions[0]!.id,
    );
  });

  it('сокращает только выбранные supporting Decisions через setSupportingDecisions', async () => {
    const context = await createContext({ supporting: true });
    const recommendation = recommendationOf(EVENING_RECOMMENDATION_TYPE.reduceTomorrowLoad);
    const preview = await context.service.preview(recommendation, { cycleDate: SOURCE });
    expect(preview).toMatchObject({ kind: RECOMMENDATION_PREVIEW_KIND.supportingDecisions });
    if (preview.kind !== RECOMMENDATION_PREVIEW_KIND.supportingDecisions)
      throw new Error('preview');

    await context.service.apply(
      recommendation,
      { cycleDate: SOURCE },
      {
        kind: 'KEEP_SUPPORTING_DECISIONS',
        decisionIds: [preview.decisions[0]!.id],
      },
    );

    expect(context.commands.setSupportingDecisionsCalls).toBe(1);
    expect(context.commands.snapshot.plan.supportingDecisionIds.map(String)).toEqual([
      preview.decisions[0]!.id,
    ]);
    expect(context.commands.snapshot.supportingDecisions).toHaveLength(1);
  });

  it('открывает repeated carry и PreparationPlan для осознанного выбора без автокоррекции', async () => {
    const context = await createContext({ preparation: true });
    const decision = createPlannedDecision('carried-decision', TARGET, DECISION_KIND.main);
    await context.decisions.save(decision);
    const carry = recommendationOf(EVENING_RECOMMENDATION_TYPE.reviewRepeatedCarry, [
      decision.id.toString(),
    ]);
    const preparation = recommendationOf(EVENING_RECOMMENDATION_TYPE.simplifyPreparation);
    const versionBefore = context.commands.snapshot.plan.version;

    await expect(context.service.preview(carry)).resolves.toMatchObject({
      kind: RECOMMENDATION_PREVIEW_KIND.decisionReview,
      currentValue: decision.title.toString(),
      availableChoices: ['LEAVE', 'EDIT', 'RESCHEDULE', 'CANCEL'],
    });
    await expect(
      context.service.preview(preparation, { cycleDate: SOURCE }),
    ).resolves.toMatchObject({
      kind: RECOMMENDATION_PREVIEW_KIND.preparationPlan,
      preparationPlanId: 'preparation-plan',
      section: 'REQUIREMENTS',
    });
    expect(context.commands.snapshot.plan.version).toBe(versionBefore);

    await expect(context.service.apply(carry, {}, { kind: 'ACKNOWLEDGE' })).resolves.toMatchObject({
      resultMessage: 'Решение открыто для осознанного пересмотра.',
    });
    await expect(
      context.service.apply(preparation, { cycleDate: SOURCE }, { kind: 'ACKNOWLEDGE' }),
    ).resolves.toMatchObject({ resultMessage: 'План подготовки открыт для уточнения.' });
    expect(context.commands.totalMutationCalls).toBe(0);
  });

  it('для процессной рекомендации разрешает acknowledgement или существующую настройку', async () => {
    const first = await createContext();
    const recommendation = recommendationOf(EVENING_RECOMMENDATION_TYPE.startEveningEarlier);
    await expect(first.service.preview(recommendation)).resolves.toMatchObject({
      kind: RECOMMENDATION_PREVIEW_KIND.processAcknowledgement,
      acknowledgementLabel: 'Принять к сведению',
    });
    await expect(
      first.service.apply(recommendation, {}, { kind: 'ACKNOWLEDGE' }),
    ).resolves.toMatchObject({ resultMessage: 'Рекомендация принята к сведению.' });

    const second = await createContext();
    const another = recommendationOf(EVENING_RECOMMENDATION_TYPE.startEveningEarlier);
    await expect(
      second.service.preview(another, { existingSettingKey: 'evening-start-threshold' }),
    ).resolves.toMatchObject({
      kind: RECOMMENDATION_PREVIEW_KIND.setting,
      settingKey: 'evening-start-threshold',
    });
    expect(second.commands.totalMutationCalls).toBe(0);
  });

  it('сохраняет DISMISSED, не возвращает карточку повторно и не трогает аналитику', async () => {
    const recommendation = recommendationOf(EVENING_RECOMMENDATION_TYPE.useQuickMode);
    const context = await createContext({ recommendations: [recommendation] });

    const dismissed = await context.service.dismiss(recommendation.id);
    const result = await context.service.getRecommendations(RANGE);

    expect(dismissed).toMatchObject({
      status: RECOMMENDATION_APPLICATION_STATUS.dismissed,
      appliedAt: null,
    });
    expect(dismissed.dismissedAt).not.toBeNull();
    expect(result.recommendations).toEqual([]);
    expect(context.queryExecutions).toBe(1);
    expect(context.commands.totalMutationCalls).toBe(0);
  });

  it('откатывает application state при ошибке команды и восстанавливает PENDING после restart', async () => {
    const recommendation = recommendationOf(
      EVENING_RECOMMENDATION_TYPE.reducePrimaryDecisionTarget,
    );
    const context = await createContext();
    await context.service.preview(recommendation, { cycleDate: SOURCE });
    context.commands.failNext = true;
    const before = context.commands.snapshot.plan.targetOutcome;

    await expect(
      context.service.apply(
        recommendation,
        { cycleDate: SOURCE },
        {
          kind: 'SET_TARGET_OUTCOME',
          targetOutcome: 'Не должно сохраниться',
        },
      ),
    ).rejects.toThrow(/atomic failure/);

    expect(context.commands.snapshot.plan.targetOutcome).toBe(before);
    expect(await context.applications.findByRecommendationId(recommendation.id)).toMatchObject({
      status: RECOMMENDATION_APPLICATION_STATUS.pending,
    });

    const restarted = createService(context);
    await expect(restarted.preview(recommendation, { cycleDate: SOURCE })).resolves.toMatchObject({
      kind: RECOMMENDATION_PREVIEW_KIND.targetOutcome,
      application: { status: RECOMMENDATION_APPLICATION_STATUS.pending },
    });
  });

  it('требует отдельный preview перед confirmation', async () => {
    const context = await createContext();
    const recommendation = recommendationOf(EVENING_RECOMMENDATION_TYPE.defineFirstAction);

    await expect(
      context.service.apply(
        recommendation,
        { cycleDate: SOURCE },
        {
          kind: 'CREATE_FIRST_ACTION',
          title: 'Скрытое изменение',
          expectedResult: 'Не допускается',
        },
      ),
    ).rejects.toMatchObject({ code: 'recommendation.preview_required' });
    expect(context.commands.totalMutationCalls).toBe(0);
  });
});

interface ContextOptions {
  readonly supporting?: boolean;
  readonly preparation?: boolean;
  readonly recommendations?: readonly EveningRecommendation[];
}

interface TestContext {
  readonly service: RecommendationApplicationService;
  readonly applications: MemoryRecommendationApplicationRepository;
  readonly commands: AtomicRecommendationCommands;
  readonly preparations: MemoryPreparationPlanRepository;
  readonly decisions: TestDecisionRepository;
  readonly recommendations: readonly EveningRecommendation[];
  readonly queryExecutions: number;
}

async function createContext(options: ContextOptions = {}): Promise<TestContext> {
  const applications = new MemoryRecommendationApplicationRepository();
  const decisions = new TestDecisionRepository();
  const preparations = new MemoryPreparationPlanRepository();
  const primary = createPlannedDecision('primary-decision', TARGET, DECISION_KIND.main);
  await decisions.save(primary);
  const supporting = options.supporting
    ? [
        createPlannedDecision('support-one', TARGET, DECISION_KIND.additional),
        createPlannedDecision('support-two', TARGET, DECISION_KIND.additional),
      ]
    : [];
  for (const decision of supporting) await decisions.save(decision);
  const plan = TomorrowPlan.create({
    id: EntityId.create('tomorrow-plan'),
    cycleId: EntityId.create('evening-cycle'),
    sourceDayId: EntityId.create('source-day'),
    targetDayId: EntityId.create('target-day'),
    targetDateKey: TARGET,
    createdAt: NOW,
  });
  plan.assignPrimaryDecision(primary.id, NOW);
  plan.setOutcomes('Рабочий минимум', 'Полностью закончить весь модуль', null, NOW);
  if (supporting.length > 0)
    plan.setSupportingDecisions(
      supporting.map((item) => item.id),
      NOW,
    );
  const commands = new AtomicRecommendationCommands(
    snapshot(plan, primary, supporting),
    applications,
  );
  if (options.preparation) {
    await preparations.createIfAbsent(
      PreparationPlan.create({
        id: EntityId.create('preparation-plan'),
        cycleId: plan.cycleId,
        tomorrowPlanId: plan.id,
        targetDayId: plan.targetDayId,
        sourceVersion: plan.version,
        generationSignature: 'test',
        createdAt: NOW,
      }),
    );
  }
  const context: TestContext = {
    service: undefined as never,
    applications,
    commands,
    preparations,
    decisions,
    recommendations: options.recommendations ?? [],
    queryExecutions: 0,
  };
  (context as { service: RecommendationApplicationService }).service = createService(context);
  return context;
}

function createService(context: TestContext): RecommendationApplicationService {
  const query = {
    execute: async () => {
      (context as { queryExecutions: number }).queryExecutions += 1;
      return {
        analysisRange: {
          kind: EVENING_HISTORY_RANGE_KIND.last7Days,
          startDate: '2026-08-14',
          endDate: '2026-08-20',
          dayCount: 7,
        },
        recommendations: context.recommendations,
      };
    },
  };
  return new RecommendationApplicationService(
    query,
    context.applications,
    context.commands,
    context.preparations,
    context.decisions,
    new FakeClock(NOW),
  );
}

class AtomicRecommendationCommands implements Pick<
  TomorrowPlanService,
  | 'getOrCreate'
  | 'getExistingForCycleDate'
  | 'setOutcomes'
  | 'createFirstAction'
  | 'assignFirstAction'
  | 'setSupportingDecisions'
> {
  public setOutcomesCalls = 0;
  public getOrCreateCalls = 0;
  public createFirstActionCalls = 0;
  public assignFirstActionCalls = 0;
  public setSupportingDecisionsCalls = 0;
  public failNext = false;

  public constructor(
    public snapshot: TomorrowPlanSnapshot,
    private readonly applications: MemoryRecommendationApplicationRepository,
  ) {}

  public get totalMutationCalls(): number {
    return (
      this.setOutcomesCalls +
      this.createFirstActionCalls +
      this.assignFirstActionCalls +
      this.setSupportingDecisionsCalls
    );
  }

  public async getOrCreate(cycleDate: DayDate): Promise<TomorrowPlanSnapshot> {
    void cycleDate;
    this.getOrCreateCalls += 1;
    return this.snapshot;
  }

  public async getExistingForCycleDate(cycleDate: DayDate): Promise<TomorrowPlanSnapshot> {
    void cycleDate;
    return this.snapshot;
  }

  public async setOutcomes(
    _cycleDate: DayDate,
    minimumOutcome: string,
    targetOutcome?: string | null,
    stretchOutcome?: string | null,
    completion?: RecommendationApplicationCommit,
  ): Promise<TomorrowPlanSnapshot> {
    this.setOutcomesCalls += 1;
    this.throwIfRequested();
    const plan = cloneTomorrowPlan(this.snapshot.plan);
    plan.setOutcomes(minimumOutcome, targetOutcome, stretchOutcome, NOW);
    await this.finalize(completion);
    this.snapshot = { ...this.snapshot, plan };
    return this.snapshot;
  }

  public async createFirstAction(
    _cycleDate: DayDate,
    input: NewTomorrowFirstActionInput,
    completion?: RecommendationApplicationCommit,
  ): Promise<TomorrowPlanSnapshot> {
    this.createFirstActionCalls += 1;
    this.throwIfRequested();
    const action = LifeAction.createDraft({
      id: EntityId.create('created-first-action'),
      title: LifeActionTitle.create(input.title),
      ...(input.description === undefined ? {} : { description: input.description }),
      decisionId: this.snapshot.plan.primaryDecisionId!,
      createdAt: NOW,
      eventId: EntityId.create('created-first-action-event'),
    });
    action.makeReady({
      expectedResult: ActionExpectedResult.create(input.expectedResult),
      plannedDate: TARGET,
      occurredAt: NOW,
      eventId: EntityId.create('ready-first-action-event'),
    });
    const plan = cloneTomorrowPlan(this.snapshot.plan);
    plan.assignFirstAction(action.id, NOW);
    await this.finalize(completion);
    this.snapshot = {
      ...this.snapshot,
      plan,
      firstAction: action,
      targetLifeActions: Object.freeze([...this.snapshot.targetLifeActions, action]),
    };
    return this.snapshot;
  }

  public async assignFirstAction(
    _cycleDate: DayDate,
    actionId: EntityId,
    completion?: RecommendationApplicationCommit,
  ): Promise<TomorrowPlanSnapshot> {
    this.assignFirstActionCalls += 1;
    this.throwIfRequested();
    const action = this.snapshot.targetLifeActions.find((candidate) =>
      candidate.id.equals(actionId),
    );
    if (action === undefined) throw new Error('action unavailable');
    const plan = cloneTomorrowPlan(this.snapshot.plan);
    plan.assignFirstAction(action.id, NOW);
    await this.finalize(completion);
    this.snapshot = { ...this.snapshot, plan, firstAction: action };
    return this.snapshot;
  }

  public async setSupportingDecisions(
    _cycleDate: DayDate,
    decisionIds: readonly EntityId[],
    completion?: RecommendationApplicationCommit,
  ): Promise<TomorrowPlanSnapshot> {
    this.setSupportingDecisionsCalls += 1;
    this.throwIfRequested();
    const plan = cloneTomorrowPlan(this.snapshot.plan);
    plan.setSupportingDecisions(decisionIds, NOW);
    const supportingDecisions = this.snapshot.supportingDecisions.filter((decision) =>
      decisionIds.some((id) => id.equals(decision.id)),
    );
    await this.finalize(completion);
    this.snapshot = { ...this.snapshot, plan, supportingDecisions };
    return this.snapshot;
  }

  private throwIfRequested(): void {
    if (!this.failNext) return;
    this.failNext = false;
    throw new Error('atomic failure');
  }

  private async finalize(completion?: RecommendationApplicationCommit): Promise<void> {
    if (completion === undefined) return;
    const saved = await this.applications.saveIfStatusMatches(
      completion.application,
      completion.expectedStatus,
    );
    if (!saved) throw new Error('application conflict');
  }
}

class MemoryRecommendationApplicationRepository implements RecommendationApplicationRepository {
  readonly #items = new Map<string, RecommendationApplication>();

  public async findByRecommendationId(id: string): Promise<RecommendationApplication | null> {
    return this.#items.get(id) ?? null;
  }

  public async findByRecommendationIds(
    ids: readonly string[],
  ): Promise<readonly RecommendationApplication[]> {
    return ids.flatMap((id) => {
      const item = this.#items.get(id);
      return item === undefined ? [] : [item];
    });
  }

  public async createIfAbsent(
    application: RecommendationApplication,
  ): Promise<RecommendationApplication> {
    const existing = this.#items.get(application.recommendationId);
    if (existing !== undefined) return existing;
    this.#items.set(application.recommendationId, application);
    return application;
  }

  public async saveIfStatusMatches(
    application: RecommendationApplication,
    expectedStatus: RecommendationApplicationStatus,
  ): Promise<boolean> {
    const stored = this.#items.get(application.recommendationId);
    if (stored?.status !== expectedStatus) return false;
    this.#items.set(application.recommendationId, application);
    return true;
  }
}

class MemoryPreparationPlanRepository implements PreparationPlanRepository {
  readonly #items = new Map<string, PreparationPlan>();

  public async findById(id: EntityId): Promise<PreparationPlan | null> {
    return this.#items.get(id.toString()) ?? null;
  }

  public async findByCycleId(cycleId: EntityId): Promise<PreparationPlan | null> {
    return [...this.#items.values()].find((plan) => plan.cycleId.equals(cycleId)) ?? null;
  }

  public async findByTomorrowPlanId(tomorrowPlanId: EntityId): Promise<PreparationPlan | null> {
    return (
      [...this.#items.values()].find((plan) => plan.tomorrowPlanId.equals(tomorrowPlanId)) ?? null
    );
  }

  public async findByTargetDayId(targetDayId: EntityId): Promise<PreparationPlan | null> {
    return [...this.#items.values()].find((plan) => plan.targetDayId.equals(targetDayId)) ?? null;
  }

  public async createIfAbsent(plan: PreparationPlan): Promise<PreparationPlan> {
    const existing = await this.findByCycleId(plan.cycleId);
    if (existing !== null) return existing;
    this.#items.set(plan.id.toString(), plan);
    return plan;
  }

  public async saveIfVersionMatches(
    plan: PreparationPlan,
    expectedVersion: number,
  ): Promise<boolean> {
    const stored = this.#items.get(plan.id.toString());
    if (stored?.version !== expectedVersion) return false;
    this.#items.set(plan.id.toString(), plan);
    return true;
  }
}

function snapshot(
  plan: TomorrowPlan,
  primaryDecision: Decision,
  supportingDecisions: readonly Decision[],
  firstAction: LifeActionEntity | null = null,
): TomorrowPlanSnapshot {
  const candidate = createReadyLifeAction('candidate-action', TARGET, {
    decisionId: primaryDecision.id,
  });
  return Object.freeze({
    plan,
    primaryDecision,
    firstAction,
    supportingDecisions: Object.freeze([...supportingDecisions]),
    carriedDecisionCandidate: null,
    scopeTooLargeWarning: false,
    targetDecisionCount: 1 + supportingDecisions.length,
    targetLifeActionCount: 1,
    targetDecisions: Object.freeze([primaryDecision, ...supportingDecisions]),
    targetLifeActions: Object.freeze([candidate]),
    overloaded: false,
  });
}

function recommendationOf(
  type: EveningRecommendationType,
  targetEntityIds: readonly string[] = [],
  targetValue?: string,
): EveningRecommendation {
  const proposedAction = Object.freeze({
    description: 'Предлагаемое действие',
    requiresUserConfirmation: true as const,
    ...(targetValue === undefined ? {} : { targetValue }),
  });
  return Object.freeze({
    id: `recommendation-${type.toLowerCase()}`,
    type,
    priority: EVENING_RECOMMENDATION_PRIORITY.medium,
    title: 'Рекомендация',
    rationale: 'Устойчивая закономерность',
    proposedAction,
    sourceSignalIds: Object.freeze(['signal-1']),
    ...(targetEntityIds.length === 0
      ? {}
      : { targetEntityIds: Object.freeze([...targetEntityIds]) }),
    applicability: EVENING_RECOMMENDATION_APPLICABILITY.tomorrowPlan,
  });
}
