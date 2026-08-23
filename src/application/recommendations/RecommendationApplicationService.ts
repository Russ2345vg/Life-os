import type { DayDate } from '../../domain';
import { EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { PreparationPlanRepository } from '../ports/PreparationPlanRepository';
import type { RecommendationApplicationRepository } from '../ports/RecommendationApplicationRepository';
import type { TomorrowPlanService, TomorrowPlanSnapshot } from '../tomorrow-plan';
import {
  EVENING_RECOMMENDATION_TYPE,
  type EveningRecommendation,
  type GetEveningRecommendations,
} from '../queries/GetEveningRecommendations';
import type {
  EveningHistoryRange,
  ResolvedEveningHistoryRange,
} from '../queries/GetEveningHistory';
import {
  RECOMMENDATION_APPLICATION_STATUS,
  RECOMMENDATION_APPLICATION_TARGET_TYPE,
  applyRecommendationApplication,
  dismissRecommendationApplication,
  pendingRecommendationApplication,
  type RecommendationApplication,
  type RecommendationApplicationStatus,
} from './RecommendationApplication';

export const RECOMMENDATION_PREVIEW_KIND = {
  targetOutcome: 'TARGET_OUTCOME',
  firstAction: 'FIRST_ACTION',
  supportingDecisions: 'SUPPORTING_DECISIONS',
  decisionReview: 'DECISION_REVIEW',
  preparationPlan: 'PREPARATION_PLAN',
  processAcknowledgement: 'PROCESS_ACKNOWLEDGEMENT',
  setting: 'SETTING',
  resolved: 'RESOLVED',
} as const;

export type RecommendationPreviewKind =
  (typeof RECOMMENDATION_PREVIEW_KIND)[keyof typeof RECOMMENDATION_PREVIEW_KIND];

export interface RecommendationPreviewContext {
  readonly cycleDate?: DayDate;
  readonly existingSettingKey?: string;
}

export interface EveningRecommendationCard {
  readonly recommendation: EveningRecommendation;
  readonly status: RecommendationApplicationStatus;
  readonly resultMessage: string | null;
  readonly application: RecommendationApplication | null;
}

interface PreviewBase {
  readonly recommendation: EveningRecommendation;
  readonly application: RecommendationApplication;
  readonly confirmationRequired: true;
}

export type EveningRecommendationPreview =
  | (PreviewBase & {
      readonly kind: typeof RECOMMENDATION_PREVIEW_KIND.targetOutcome;
      readonly currentValue: string | null;
      readonly proposedValue: string | null;
      readonly opensExistingEditor: boolean;
    })
  | (PreviewBase & {
      readonly kind: typeof RECOMMENDATION_PREVIEW_KIND.firstAction;
      readonly currentValue: string | null;
      readonly candidateActions: readonly Readonly<{ id: string; title: string }>[];
    })
  | (PreviewBase & {
      readonly kind: typeof RECOMMENDATION_PREVIEW_KIND.supportingDecisions;
      readonly decisions: readonly Readonly<{ id: string; title: string }>[];
    })
  | (PreviewBase & {
      readonly kind: typeof RECOMMENDATION_PREVIEW_KIND.decisionReview;
      readonly decisionId: string;
      readonly currentValue: string | null;
      readonly availableChoices: readonly ['LEAVE', 'EDIT', 'RESCHEDULE', 'CANCEL'];
    })
  | (PreviewBase & {
      readonly kind: typeof RECOMMENDATION_PREVIEW_KIND.preparationPlan;
      readonly preparationPlanId: string | null;
      readonly section: 'REQUIREMENTS';
    })
  | (PreviewBase & {
      readonly kind: typeof RECOMMENDATION_PREVIEW_KIND.processAcknowledgement;
      readonly acknowledgementLabel: 'Принять к сведению';
    })
  | (PreviewBase & {
      readonly kind: typeof RECOMMENDATION_PREVIEW_KIND.setting;
      readonly settingKey: string;
    })
  | (PreviewBase & {
      readonly kind: typeof RECOMMENDATION_PREVIEW_KIND.resolved;
      readonly resultMessage: string | null;
    });

export type ApplyRecommendationInput =
  | Readonly<{ kind: 'SET_TARGET_OUTCOME'; targetOutcome: string }>
  | Readonly<{
      kind: 'CREATE_FIRST_ACTION';
      title: string;
      expectedResult: string;
      description?: string;
    }>
  | Readonly<{ kind: 'ASSIGN_FIRST_ACTION'; actionId: string }>
  | Readonly<{ kind: 'KEEP_SUPPORTING_DECISIONS'; decisionIds: readonly string[] }>
  | Readonly<{ kind: 'ACKNOWLEDGE' }>;

type RecommendationCommands = Pick<
  TomorrowPlanService,
  | 'getOrCreate'
  | 'getExistingForCycleDate'
  | 'setOutcomes'
  | 'createFirstAction'
  | 'assignFirstAction'
  | 'setSupportingDecisions'
>;

export class RecommendationApplicationService {
  public constructor(
    private readonly recommendations: Pick<GetEveningRecommendations, 'execute'>,
    private readonly applications: RecommendationApplicationRepository,
    private readonly tomorrowPlan: RecommendationCommands,
    private readonly preparationPlans: PreparationPlanRepository,
    private readonly decisions: DecisionRepository,
    private readonly clock: Clock,
  ) {}

  public async getRecommendations(range: EveningHistoryRange): Promise<
    Readonly<{
      analysisRange: ResolvedEveningHistoryRange;
      recommendations: readonly EveningRecommendationCard[];
    }>
  > {
    const result = await this.recommendations.execute(range);
    const applications = await this.applications.findByRecommendationIds(
      result.recommendations.map((recommendation) => recommendation.id),
    );
    return Object.freeze({
      analysisRange: result.analysisRange,
      recommendations: buildEveningRecommendationCards(result.recommendations, applications),
    });
  }

  public async preview(
    recommendation: EveningRecommendation,
    context: RecommendationPreviewContext = {},
  ): Promise<EveningRecommendationPreview> {
    const application = await this.ensurePending(recommendation.id);
    if (application.status !== RECOMMENDATION_APPLICATION_STATUS.pending) {
      return {
        recommendation,
        application,
        confirmationRequired: true,
        kind: RECOMMENDATION_PREVIEW_KIND.resolved,
        resultMessage: application.resultMessage,
      };
    }
    return this.buildPreview(recommendation, application, context);
  }

  public async apply(
    recommendation: EveningRecommendation,
    context: RecommendationPreviewContext,
    input: ApplyRecommendationInput,
  ): Promise<RecommendationApplication> {
    const stored = await this.applications.findByRecommendationId(recommendation.id);
    if (stored === null) {
      throw new DomainError(
        'recommendation.preview_required',
        'Сначала откройте предпросмотр рекомендации.',
      );
    }
    if (stored.status !== RECOMMENDATION_APPLICATION_STATUS.pending) return stored;

    const preview = await this.buildPreview(recommendation, stored, context);
    if (preview.kind === RECOMMENDATION_PREVIEW_KIND.resolved) return preview.application;
    const now = this.clock.now();

    if (input.kind === 'ACKNOWLEDGE') {
      if (!isAcknowledgementPreview(preview.kind)) throw confirmationMismatch();
      const target = targetForAcknowledgement(preview);
      const applied = applyRecommendationApplication(
        stored,
        target.type,
        target.id,
        resultForAcknowledgement(preview.kind),
        now,
      );
      return this.saveResolved(applied);
    }

    const cycleDate = requireCycleDate(context);
    const snapshot = await this.tomorrowPlan.getOrCreate(cycleDate);

    if (input.kind === 'SET_TARGET_OUTCOME') {
      if (preview.kind !== RECOMMENDATION_PREVIEW_KIND.targetOutcome) throw confirmationMismatch();
      if (snapshot.plan.minimumOutcome === null) {
        throw new DomainError(
          'recommendation.minimum_outcome_required',
          'Сначала укажите минимальный результат главного Решения.',
        );
      }
      const applied = applyRecommendationApplication(
        stored,
        RECOMMENDATION_APPLICATION_TARGET_TYPE.tomorrowPlan,
        snapshot.plan.id.toString(),
        'Норма главного Решения обновлена.',
        now,
      );
      await this.tomorrowPlan.setOutcomes(
        cycleDate,
        snapshot.plan.minimumOutcome,
        input.targetOutcome,
        snapshot.plan.stretchOutcome,
        { application: applied, expectedStatus: RECOMMENDATION_APPLICATION_STATUS.pending },
      );
      return applied;
    }

    if (input.kind === 'CREATE_FIRST_ACTION') {
      if (preview.kind !== RECOMMENDATION_PREVIEW_KIND.firstAction) throw confirmationMismatch();
      const applied = firstActionApplied(stored, snapshot, now);
      await this.tomorrowPlan.createFirstAction(cycleDate, input, {
        application: applied,
        expectedStatus: RECOMMENDATION_APPLICATION_STATUS.pending,
      });
      return applied;
    }

    if (input.kind === 'ASSIGN_FIRST_ACTION') {
      if (preview.kind !== RECOMMENDATION_PREVIEW_KIND.firstAction) throw confirmationMismatch();
      const candidate = preview.candidateActions.find((action) => action.id === input.actionId);
      if (candidate === undefined) throw confirmationMismatch();
      const applied = firstActionApplied(stored, snapshot, now);
      await this.tomorrowPlan.assignFirstAction(cycleDate, EntityId.create(input.actionId), {
        application: applied,
        expectedStatus: RECOMMENDATION_APPLICATION_STATUS.pending,
      });
      return applied;
    }

    if (preview.kind !== RECOMMENDATION_PREVIEW_KIND.supportingDecisions) {
      throw confirmationMismatch();
    }
    const currentIds = new Set(preview.decisions.map((decision) => decision.id));
    if (input.decisionIds.some((id) => !currentIds.has(id))) throw confirmationMismatch();
    const applied = applyRecommendationApplication(
      stored,
      RECOMMENDATION_APPLICATION_TARGET_TYPE.tomorrowPlan,
      snapshot.plan.id.toString(),
      'Дополнительные Решения в вечернем фокусе сокращены.',
      now,
    );
    await this.tomorrowPlan.setSupportingDecisions(
      cycleDate,
      input.decisionIds.map((id) => EntityId.create(id)),
      { application: applied, expectedStatus: RECOMMENDATION_APPLICATION_STATUS.pending },
    );
    return applied;
  }

  public async dismiss(recommendationId: string): Promise<RecommendationApplication> {
    const stored = await this.ensurePending(recommendationId);
    if (stored.status !== RECOMMENDATION_APPLICATION_STATUS.pending) return stored;
    return this.saveResolved(dismissRecommendationApplication(stored, this.clock.now()));
  }

  private async buildPreview(
    recommendation: EveningRecommendation,
    application: RecommendationApplication,
    context: RecommendationPreviewContext,
  ): Promise<EveningRecommendationPreview> {
    if (application.status !== RECOMMENDATION_APPLICATION_STATUS.pending) {
      return {
        recommendation,
        application,
        confirmationRequired: true,
        kind: RECOMMENDATION_PREVIEW_KIND.resolved,
        resultMessage: application.resultMessage,
      };
    }

    if (recommendation.type === EVENING_RECOMMENDATION_TYPE.reviewRepeatedCarry) {
      const decisionId = recommendation.targetEntityIds?.[0];
      if (decisionId === undefined) throw unavailableTarget();
      const decision = await this.decisions.findById(EntityId.create(decisionId));
      return {
        recommendation,
        application,
        confirmationRequired: true,
        kind: RECOMMENDATION_PREVIEW_KIND.decisionReview,
        decisionId,
        currentValue: decision?.title.toString() ?? null,
        availableChoices: ['LEAVE', 'EDIT', 'RESCHEDULE', 'CANCEL'],
      };
    }

    if (isFirstActionRecommendation(recommendation)) {
      const snapshot = await this.requireTomorrowSnapshot(context);
      return {
        recommendation,
        application,
        confirmationRequired: true,
        kind: RECOMMENDATION_PREVIEW_KIND.firstAction,
        currentValue: snapshot.firstAction?.title.toString() ?? null,
        candidateActions: Object.freeze(
          snapshot.targetLifeActions
            .filter(
              (action) =>
                snapshot.plan.primaryDecisionId !== null &&
                action.decisionId?.equals(snapshot.plan.primaryDecisionId) === true,
            )
            .map((action) =>
              Object.freeze({ id: action.id.toString(), title: action.title.toString() }),
            ),
        ),
      };
    }

    if (recommendation.type === EVENING_RECOMMENDATION_TYPE.reduceTomorrowLoad) {
      const snapshot = await this.requireTomorrowSnapshot(context);
      if (snapshot.supportingDecisions.length > 0) {
        return {
          recommendation,
          application,
          confirmationRequired: true,
          kind: RECOMMENDATION_PREVIEW_KIND.supportingDecisions,
          decisions: Object.freeze(
            snapshot.supportingDecisions.map((decision) =>
              Object.freeze({ id: decision.id.toString(), title: decision.title.toString() }),
            ),
          ),
        };
      }
      return targetOutcomePreview(recommendation, application, snapshot);
    }

    if (recommendation.type === EVENING_RECOMMENDATION_TYPE.reducePrimaryDecisionTarget) {
      return targetOutcomePreview(
        recommendation,
        application,
        await this.requireTomorrowSnapshot(context),
      );
    }

    if (recommendation.type === EVENING_RECOMMENDATION_TYPE.simplifyPreparation) {
      const snapshot = await this.requireTomorrowSnapshot(context);
      const preparation = await this.preparationPlans.findByCycleId(snapshot.plan.cycleId);
      return {
        recommendation,
        application,
        confirmationRequired: true,
        kind: RECOMMENDATION_PREVIEW_KIND.preparationPlan,
        preparationPlanId: preparation?.id.toString() ?? null,
        section: 'REQUIREMENTS',
      };
    }

    if (context.existingSettingKey !== undefined && supportsExistingSetting(recommendation)) {
      return {
        recommendation,
        application,
        confirmationRequired: true,
        kind: RECOMMENDATION_PREVIEW_KIND.setting,
        settingKey: context.existingSettingKey,
      };
    }

    return {
      recommendation,
      application,
      confirmationRequired: true,
      kind: RECOMMENDATION_PREVIEW_KIND.processAcknowledgement,
      acknowledgementLabel: 'Принять к сведению',
    };
  }

  private async requireTomorrowSnapshot(
    context: RecommendationPreviewContext,
  ): Promise<TomorrowPlanSnapshot> {
    const snapshot = await this.tomorrowPlan.getExistingForCycleDate(requireCycleDate(context));
    if (snapshot !== null) return snapshot;
    throw new DomainError(
      'recommendation.tomorrow_plan_not_found',
      'Существующий план завтра не найден.',
    );
  }

  private async ensurePending(recommendationId: string): Promise<RecommendationApplication> {
    const existing = await this.applications.findByRecommendationId(recommendationId);
    if (existing !== null) return existing;
    return this.applications.createIfAbsent(
      pendingRecommendationApplication(recommendationId, this.clock.now()),
    );
  }

  private async saveResolved(
    application: RecommendationApplication,
  ): Promise<RecommendationApplication> {
    if (
      await this.applications.saveIfStatusMatches(
        application,
        RECOMMENDATION_APPLICATION_STATUS.pending,
      )
    ) {
      return application;
    }
    const existing = await this.applications.findByRecommendationId(application.recommendationId);
    if (existing !== null) return existing;
    throw new DomainError(
      'recommendation.concurrent_change',
      'Состояние рекомендации изменилось в другом окне.',
    );
  }
}

export function buildEveningRecommendationCards(
  recommendations: readonly EveningRecommendation[],
  applications: readonly RecommendationApplication[],
): readonly EveningRecommendationCard[] {
  const byId = new Map(
    applications.map((application) => [application.recommendationId, application]),
  );
  return Object.freeze(
    recommendations.flatMap((recommendation) => {
      const application = byId.get(recommendation.id) ?? null;
      if (application?.status === RECOMMENDATION_APPLICATION_STATUS.dismissed) return [];
      return [
        Object.freeze({
          recommendation,
          status: application?.status ?? RECOMMENDATION_APPLICATION_STATUS.pending,
          resultMessage: application?.resultMessage ?? null,
          application,
        }),
      ];
    }),
  );
}

function targetOutcomePreview(
  recommendation: EveningRecommendation,
  application: RecommendationApplication,
  snapshot: TomorrowPlanSnapshot,
): EveningRecommendationPreview {
  const proposedValue = concreteTargetValue(recommendation);
  return {
    recommendation,
    application,
    confirmationRequired: true,
    kind: RECOMMENDATION_PREVIEW_KIND.targetOutcome,
    currentValue: snapshot.plan.targetOutcome,
    proposedValue,
    opensExistingEditor: proposedValue === null,
  };
}

function concreteTargetValue(recommendation: EveningRecommendation): string | null {
  const action = recommendation.proposedAction;
  if ('targetValue' in action && typeof action.targetValue === 'string') {
    const value = action.targetValue.trim();
    return value.length === 0 ? null : value;
  }
  return null;
}

function firstActionApplied(
  stored: RecommendationApplication,
  snapshot: TomorrowPlanSnapshot,
  now: Date,
): RecommendationApplication {
  return applyRecommendationApplication(
    stored,
    RECOMMENDATION_APPLICATION_TARGET_TYPE.tomorrowPlan,
    snapshot.plan.id.toString(),
    'Первый шаг на завтра определён.',
    now,
  );
}

function isFirstActionRecommendation(recommendation: EveningRecommendation): boolean {
  return (
    recommendation.type === EVENING_RECOMMENDATION_TYPE.defineFirstAction ||
    recommendation.type === EVENING_RECOMMENDATION_TYPE.makeFirstActionStandard
  );
}

function supportsExistingSetting(recommendation: EveningRecommendation): boolean {
  return recommendation.type === EVENING_RECOMMENDATION_TYPE.startEveningEarlier;
}

function isAcknowledgementPreview(kind: RecommendationPreviewKind): boolean {
  return (
    kind === RECOMMENDATION_PREVIEW_KIND.decisionReview ||
    kind === RECOMMENDATION_PREVIEW_KIND.preparationPlan ||
    kind === RECOMMENDATION_PREVIEW_KIND.processAcknowledgement ||
    kind === RECOMMENDATION_PREVIEW_KIND.setting
  );
}

function targetForAcknowledgement(preview: EveningRecommendationPreview): Readonly<{
  type:
    | typeof RECOMMENDATION_APPLICATION_TARGET_TYPE.decision
    | typeof RECOMMENDATION_APPLICATION_TARGET_TYPE.preparationPlan
    | typeof RECOMMENDATION_APPLICATION_TARGET_TYPE.eveningProcess;
  id: string | null;
}> {
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.decisionReview) {
    return { type: RECOMMENDATION_APPLICATION_TARGET_TYPE.decision, id: preview.decisionId };
  }
  if (preview.kind === RECOMMENDATION_PREVIEW_KIND.preparationPlan) {
    return {
      type: RECOMMENDATION_APPLICATION_TARGET_TYPE.preparationPlan,
      id: preview.preparationPlanId,
    };
  }
  return { type: RECOMMENDATION_APPLICATION_TARGET_TYPE.eveningProcess, id: null };
}

function resultForAcknowledgement(kind: RecommendationPreviewKind): string {
  if (kind === RECOMMENDATION_PREVIEW_KIND.decisionReview)
    return 'Решение открыто для осознанного пересмотра.';
  if (kind === RECOMMENDATION_PREVIEW_KIND.preparationPlan)
    return 'План подготовки открыт для уточнения.';
  if (kind === RECOMMENDATION_PREVIEW_KIND.setting) return 'Подходящая настройка открыта.';
  return 'Рекомендация принята к сведению.';
}

function requireCycleDate(context: RecommendationPreviewContext): DayDate {
  if (context.cycleDate !== undefined) return context.cycleDate;
  throw new DomainError(
    'recommendation.cycle_date_required',
    'Для этой рекомендации нужен вечерний план.',
  );
}

function confirmationMismatch(): DomainError {
  return new DomainError(
    'recommendation.confirmation_mismatch',
    'Подтверждение не соответствует предпросмотру рекомендации.',
  );
}

function unavailableTarget(): DomainError {
  return new DomainError(
    'recommendation.target_unavailable',
    'Цель рекомендации больше недоступна.',
  );
}
