import { DomainError } from '../../shared/errors/DomainError';
import { DayDate } from '../day/DayDate';
import { Entity } from '../shared/Entity';
import { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';

export const TOMORROW_PLAN_STATUS = {
  inProgress: 'IN_PROGRESS',
  completed: 'COMPLETED',
} as const;

export type TomorrowPlanStatus = (typeof TOMORROW_PLAN_STATUS)[keyof typeof TOMORROW_PLAN_STATUS];

export const TOMORROW_PLANNING_QUALITY = {
  full: 'FULL',
  minimal: 'MINIMAL',
} as const;

export type TomorrowPlanningQuality =
  (typeof TOMORROW_PLANNING_QUALITY)[keyof typeof TOMORROW_PLANNING_QUALITY];

export interface TomorrowPlanRehydrationData {
  readonly id: EntityId;
  readonly cycleId: EntityId;
  readonly sourceDayId: EntityId;
  readonly targetDayId: EntityId;
  readonly targetDateKey: DayDate;
  readonly directionId: EntityId | null;
  readonly vector: string | null;
  readonly primaryDecisionId: EntityId | null;
  readonly minimumOutcome: string | null;
  readonly targetOutcome: string | null;
  readonly stretchOutcome: string | null;
  readonly firstActionId: EntityId | null;
  readonly firstAttentionItem?: string | null;
  readonly planningQuality?: TomorrowPlanningQuality;
  readonly supportingDecisionIds: readonly EntityId[];
  readonly status: TomorrowPlanStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly version: number;
}

export interface TomorrowPlanCreationData {
  readonly id: EntityId;
  readonly cycleId: EntityId;
  readonly sourceDayId: EntityId;
  readonly targetDayId: EntityId;
  readonly targetDateKey: DayDate;
  readonly createdAt: Date;
  readonly carriedPrimaryDecisionId?: EntityId | null;
}

export class TomorrowPlan extends Entity {
  readonly #cycleId: EntityId;
  readonly #sourceDayId: EntityId;
  readonly #targetDayId: EntityId;
  readonly #targetDateKey: DayDate;
  readonly #createdAt: Date;
  #directionId: EntityId | null;
  #vector: string | null;
  #primaryDecisionId: EntityId | null;
  #minimumOutcome: string | null;
  #targetOutcome: string | null;
  #stretchOutcome: string | null;
  #firstActionId: EntityId | null;
  #firstAttentionItem: string | null;
  #planningQuality: TomorrowPlanningQuality;
  #supportingDecisionIds: readonly EntityId[];
  #status: TomorrowPlanStatus;
  #updatedAt: Date;
  #completedAt: Date | null;
  #version: number;

  private constructor(data: TomorrowPlanRehydrationData) {
    super(data.id);
    this.#cycleId = data.cycleId;
    this.#sourceDayId = data.sourceDayId;
    this.#targetDayId = data.targetDayId;
    this.#targetDateKey = data.targetDateKey;
    this.#directionId = data.directionId;
    this.#vector = normalizeOptionalOutcome(data.vector);
    this.#primaryDecisionId = data.primaryDecisionId;
    this.#minimumOutcome = normalizeOptionalOutcome(data.minimumOutcome);
    this.#targetOutcome = normalizeOptionalOutcome(data.targetOutcome);
    this.#stretchOutcome = normalizeOptionalOutcome(data.stretchOutcome);
    this.#firstActionId = data.firstActionId;
    this.#firstAttentionItem = normalizeOptionalOutcome(data.firstAttentionItem ?? null);
    this.#planningQuality = data.planningQuality ?? TOMORROW_PLANNING_QUALITY.full;
    this.#supportingDecisionIds = uniqueSupportingIds(
      data.supportingDecisionIds,
      data.primaryDecisionId,
    );
    this.#status = data.status;
    this.#createdAt = copyDate(data.createdAt);
    this.#updatedAt = copyDate(data.updatedAt);
    this.#completedAt = copyOptionalDate(data.completedAt);
    this.#version = data.version;
    assertInvariants(this);
  }

  public static create(data: TomorrowPlanCreationData): TomorrowPlan {
    return new TomorrowPlan({
      ...data,
      directionId: null,
      vector: null,
      primaryDecisionId: data.carriedPrimaryDecisionId ?? null,
      minimumOutcome: null,
      targetOutcome: null,
      stretchOutcome: null,
      firstActionId: null,
      firstAttentionItem: null,
      planningQuality: TOMORROW_PLANNING_QUALITY.full,
      supportingDecisionIds: [],
      status: TOMORROW_PLAN_STATUS.inProgress,
      updatedAt: data.createdAt,
      completedAt: null,
      version: 1,
    });
  }

  public static rehydrate(data: TomorrowPlanRehydrationData): TomorrowPlan {
    return new TomorrowPlan(data);
  }

  public get cycleId(): EntityId {
    return this.#cycleId;
  }
  public get sourceDayId(): EntityId {
    return this.#sourceDayId;
  }
  public get targetDayId(): EntityId {
    return this.#targetDayId;
  }
  public get targetDateKey(): DayDate {
    return this.#targetDateKey;
  }
  public get directionId(): EntityId | null {
    return this.#directionId;
  }
  public get vector(): string | null {
    return this.#vector;
  }
  public get primaryDecisionId(): EntityId | null {
    return this.#primaryDecisionId;
  }
  public get minimumOutcome(): string | null {
    return this.#minimumOutcome;
  }
  public get targetOutcome(): string | null {
    return this.#targetOutcome;
  }
  public get stretchOutcome(): string | null {
    return this.#stretchOutcome;
  }
  public get firstActionId(): EntityId | null {
    return this.#firstActionId;
  }
  public get firstAttentionItem(): string | null {
    return this.#firstAttentionItem;
  }
  public get planningQuality(): TomorrowPlanningQuality {
    return this.#planningQuality;
  }
  public get supportingDecisionIds(): readonly EntityId[] {
    return [...this.#supportingDecisionIds];
  }
  public get status(): TomorrowPlanStatus {
    return this.#status;
  }
  public get createdAt(): Date {
    return copyDate(this.#createdAt);
  }
  public get updatedAt(): Date {
    return copyDate(this.#updatedAt);
  }
  public get completedAt(): Date | null {
    return copyOptionalDate(this.#completedAt);
  }
  public get version(): number {
    return this.#version;
  }

  public get isReady(): boolean {
    return (
      this.#primaryDecisionId !== null &&
      this.#minimumOutcome !== null &&
      this.#firstActionId !== null
    );
  }

  public get isMinimallyReady(): boolean {
    return this.#primaryDecisionId !== null || this.#firstAttentionItem !== null;
  }

  public setDirection(directionId: EntityId | null, occurredAt: Date): boolean {
    return this.change(
      sameOptionalId(this.#directionId, directionId),
      () => {
        this.#directionId = directionId;
      },
      occurredAt,
    );
  }

  public setVector(vector: string | null, occurredAt: Date): boolean {
    const normalized = normalizeOptionalOutcome(vector);
    return this.change(
      this.#vector === normalized,
      () => {
        this.#vector = normalized;
      },
      occurredAt,
    );
  }

  public assignPrimaryDecision(decisionId: EntityId, occurredAt: Date): boolean {
    const supporting = this.#supportingDecisionIds.filter((id) => !id.equals(decisionId));
    const unchanged =
      this.#primaryDecisionId?.equals(decisionId) === true &&
      supporting.length === this.#supportingDecisionIds.length;
    return this.change(
      unchanged,
      () => {
        this.#primaryDecisionId = decisionId;
        this.#supportingDecisionIds = Object.freeze(supporting);
      },
      occurredAt,
    );
  }

  public setOutcomes(
    minimumOutcome: string,
    targetOutcome: string | null | undefined,
    stretchOutcome: string | null | undefined,
    occurredAt: Date,
  ): boolean {
    const minimum = normalizeRequiredOutcome(
      minimumOutcome,
      'tomorrow_plan.minimum_outcome_required',
    );
    const target = normalizeOptionalOutcome(targetOutcome ?? null);
    const stretch = normalizeOptionalOutcome(stretchOutcome ?? null);
    return this.change(
      this.#minimumOutcome === minimum &&
        this.#targetOutcome === target &&
        this.#stretchOutcome === stretch,
      () => {
        this.#minimumOutcome = minimum;
        this.#targetOutcome = target;
        this.#stretchOutcome = stretch;
      },
      occurredAt,
    );
  }

  public assignFirstAction(actionId: EntityId, occurredAt: Date): boolean {
    return this.change(
      this.#firstActionId?.equals(actionId) === true,
      () => {
        this.#firstActionId = actionId;
      },
      occurredAt,
    );
  }

  public setFirstAttentionItem(value: string | null, occurredAt: Date): boolean {
    const normalized = normalizeOptionalOutcome(value);
    return this.change(
      this.#firstAttentionItem === normalized,
      () => {
        this.#firstAttentionItem = normalized;
      },
      occurredAt,
    );
  }

  public setSupportingDecisions(decisionIds: readonly EntityId[], occurredAt: Date): boolean {
    const normalized = uniqueSupportingIds(decisionIds, this.#primaryDecisionId);
    const unchanged = sameIds(this.#supportingDecisionIds, normalized);
    return this.change(
      unchanged,
      () => {
        this.#supportingDecisionIds = normalized;
      },
      occurredAt,
    );
  }

  public complete(occurredAt: Date): boolean {
    if (this.#status === TOMORROW_PLAN_STATUS.completed) return false;
    if (!this.isReady) {
      throw new DomainError(
        'tomorrow_plan.incomplete',
        'Для подготовки завтра нужны целевой день, главное Решение, минимальный результат и первый шаг.',
      );
    }
    assertDate(occurredAt);
    this.#status = TOMORROW_PLAN_STATUS.completed;
    this.#planningQuality = TOMORROW_PLANNING_QUALITY.full;
    this.#completedAt = copyDate(occurredAt);
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }

  public completeMinimal(occurredAt: Date): boolean {
    if (this.#status === TOMORROW_PLAN_STATUS.completed) return false;
    if (!this.isMinimallyReady) {
      throw new DomainError(
        'tomorrow_plan.minimal_attention_required',
        'Для аварийного завершения укажите главное Решение или первый объект внимания.',
      );
    }
    assertDate(occurredAt);
    this.#status = TOMORROW_PLAN_STATUS.completed;
    this.#planningQuality = TOMORROW_PLANNING_QUALITY.minimal;
    this.#completedAt = copyDate(occurredAt);
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }

  private change(unchanged: boolean, mutation: () => void, occurredAt: Date): boolean {
    if (unchanged) return false;
    assertDate(occurredAt);
    mutation();
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }
}

export function isTomorrowPlanStatus(value: string): value is TomorrowPlanStatus {
  return (Object.values(TOMORROW_PLAN_STATUS) as readonly string[]).includes(value);
}

export function isTomorrowPlanningQuality(value: string): value is TomorrowPlanningQuality {
  return (Object.values(TOMORROW_PLANNING_QUALITY) as readonly string[]).includes(value);
}

function assertInvariants(plan: TomorrowPlan): void {
  if (plan.version < 1 || !Number.isInteger(plan.version)) {
    throw new DomainError('tomorrow_plan.invalid_version', 'Версия плана завтра некорректна.');
  }
  if (
    plan.status === TOMORROW_PLAN_STATUS.completed &&
    (plan.completedAt === null ||
      (plan.planningQuality === TOMORROW_PLANNING_QUALITY.full
        ? !plan.isReady
        : !plan.isMinimallyReady))
  ) {
    throw new DomainError(
      'tomorrow_plan.invalid_completed_state',
      'Завершённый план завтра неполон.',
    );
  }
  if (plan.status === TOMORROW_PLAN_STATUS.inProgress && plan.completedAt !== null) {
    throw new DomainError(
      'tomorrow_plan.invalid_completed_state',
      'Незавершённый план не может иметь время завершения.',
    );
  }
}

function uniqueSupportingIds(
  ids: readonly EntityId[],
  primaryId: EntityId | null,
): readonly EntityId[] {
  const unique = new Map<string, EntityId>();
  for (const id of ids) {
    if (primaryId?.equals(id) === true) continue;
    unique.set(id.toString(), id);
  }
  if (unique.size > 2) {
    throw new DomainError(
      'tomorrow_plan.supporting_limit',
      'Можно выбрать не более двух дополнительных Решений.',
    );
  }
  return Object.freeze([...unique.values()]);
}

function sameIds(left: readonly EntityId[], right: readonly EntityId[]): boolean {
  return left.length === right.length && left.every((id, index) => id.equals(right[index]!));
}

function sameOptionalId(left: EntityId | null, right: EntityId | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
}

function normalizeRequiredOutcome(value: string, code: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 1_000) {
    throw new DomainError(code, 'Граница результата должна содержать от 1 до 1000 символов.');
  }
  return normalized;
}

function normalizeOptionalOutcome(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0
    ? null
    : normalizeRequiredOutcome(normalized, 'tomorrow_plan.invalid_outcome');
}

function assertDate(value: Date): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError(
      'tomorrow_plan.invalid_time',
      'Время изменения плана завтра некорректно.',
    );
  }
}
