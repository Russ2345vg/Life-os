import { DomainError } from '../../shared/errors/DomainError';
import { Entity } from '../shared/Entity';
import { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';

export const PREPARATION_CATEGORY = {
  physical: 'PHYSICAL',
  digital: 'DIGITAL',
  cognitive: 'COGNITIVE',
} as const;
export type PreparationCategory = (typeof PREPARATION_CATEGORY)[keyof typeof PREPARATION_CATEGORY];

export const PREPARATION_AREA = {
  sleepEnvironment: 'SLEEP_ENVIRONMENT',
  tomorrowStart: 'TOMORROW_START',
} as const;
export type PreparationArea = (typeof PREPARATION_AREA)[keyof typeof PREPARATION_AREA];

export const PREPARATION_ITEM_STATUS = {
  pending: 'PENDING',
  completed: 'COMPLETED',
  skipped: 'SKIPPED',
} as const;
export type PreparationItemStatus =
  (typeof PREPARATION_ITEM_STATUS)[keyof typeof PREPARATION_ITEM_STATUS];

export const PREPARATION_PLAN_STATUS = {
  inProgress: 'IN_PROGRESS',
  completed: 'COMPLETED',
} as const;
export type PreparationPlanStatus =
  (typeof PREPARATION_PLAN_STATUS)[keyof typeof PREPARATION_PLAN_STATUS];

export const PREPARATION_SOURCE_TYPE = {
  firstAction: 'FIRST_ACTION',
  project: 'PROJECT',
  rule: 'RULE',
  reflection: 'REFLECTION',
} as const;
export type PreparationSourceType =
  (typeof PREPARATION_SOURCE_TYPE)[keyof typeof PREPARATION_SOURCE_TYPE];

export interface PreparationRequirement {
  readonly key: string;
  readonly area: PreparationArea;
  readonly category: PreparationCategory;
  readonly title: string;
  readonly sourceType: PreparationSourceType;
  readonly sourceId: EntityId | null;
  readonly required: boolean;
}

export interface PreparationItemData extends PreparationRequirement {
  readonly id: EntityId;
  readonly planId: EntityId;
  readonly status: PreparationItemStatus;
  readonly active: boolean;
  readonly completedAt: Date | null;
  readonly skippedAt: Date | null;
  readonly skipReason: string | null;
}

export class PreparationItem {
  public readonly id: EntityId;
  public readonly planId: EntityId;
  public readonly key: string;
  public readonly area: PreparationArea;
  public readonly category: PreparationCategory;
  public readonly title: string;
  public readonly sourceType: PreparationSourceType;
  public readonly sourceId: EntityId | null;
  public readonly required: boolean;
  public readonly status: PreparationItemStatus;
  public readonly active: boolean;
  public readonly completedAt: Date | null;
  public readonly skippedAt: Date | null;
  public readonly skipReason: string | null;

  private constructor(data: PreparationItemData) {
    assertItemData(data);
    this.id = data.id;
    this.planId = data.planId;
    this.key = normalizeKey(data.key);
    this.area = data.area;
    this.category = data.category;
    this.title = normalizeTitle(data.title);
    this.sourceType = data.sourceType;
    this.sourceId = data.sourceId;
    this.required = data.required;
    this.status = data.status;
    this.active = data.active;
    this.completedAt = copyOptionalDate(data.completedAt);
    this.skippedAt = copyOptionalDate(data.skippedAt);
    this.skipReason = normalizeOptionalText(data.skipReason);
  }

  public static create(
    data: PreparationRequirement & { readonly id: EntityId; readonly planId: EntityId },
  ): PreparationItem {
    return new PreparationItem({
      ...data,
      status: PREPARATION_ITEM_STATUS.pending,
      active: true,
      completedAt: null,
      skippedAt: null,
      skipReason: null,
    });
  }

  public static rehydrate(data: PreparationItemData): PreparationItem {
    return new PreparationItem(data);
  }

  public complete(occurredAt: Date): PreparationItem {
    if (this.status === PREPARATION_ITEM_STATUS.completed && this.active) return this;
    assertDate(occurredAt, 'preparation.invalid_completion_time');
    return this.copy({
      status: PREPARATION_ITEM_STATUS.completed,
      active: true,
      completedAt: occurredAt,
      skippedAt: null,
      skipReason: null,
    });
  }

  public skip(occurredAt: Date, reason?: string | null): PreparationItem {
    if (this.status === PREPARATION_ITEM_STATUS.skipped && this.active) return this;
    assertDate(occurredAt, 'preparation.invalid_skip_time');
    return this.copy({
      status: PREPARATION_ITEM_STATUS.skipped,
      active: true,
      completedAt: null,
      skippedAt: occurredAt,
      skipReason: reason ?? null,
    });
  }

  public reactivate(requirement: PreparationRequirement): PreparationItem {
    return new PreparationItem({
      ...this.toData(),
      ...requirement,
      id: this.id,
      planId: this.planId,
      active: true,
    });
  }

  public deactivate(): PreparationItem {
    return this.active ? this.copy({ active: false }) : this;
  }

  public withRequired(required: boolean): PreparationItem {
    return this.required === required ? this : this.copy({ required });
  }

  public toData(): PreparationItemData {
    return {
      id: this.id,
      planId: this.planId,
      key: this.key,
      area: this.area,
      category: this.category,
      title: this.title,
      sourceType: this.sourceType,
      sourceId: this.sourceId,
      required: this.required,
      status: this.status,
      active: this.active,
      completedAt: this.completedAt,
      skippedAt: this.skippedAt,
      skipReason: this.skipReason,
    };
  }

  private copy(patch: Partial<PreparationItemData>): PreparationItem {
    return new PreparationItem({ ...this.toData(), ...patch });
  }
}

export interface PreparationPlanCreationData {
  readonly id: EntityId;
  readonly cycleId: EntityId;
  readonly tomorrowPlanId: EntityId;
  readonly targetDayId: EntityId;
  readonly sourceVersion: number;
  readonly generationSignature: string;
  readonly createdAt: Date;
}

export interface PreparationPlanRehydrationData extends PreparationPlanCreationData {
  readonly items: readonly PreparationItem[];
  readonly requiredCoreKeys?: readonly string[] | null;
  readonly status: PreparationPlanStatus;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly version: number;
}

export class PreparationPlan extends Entity {
  public readonly cycleId: EntityId;
  public readonly tomorrowPlanId: EntityId;
  public readonly targetDayId: EntityId;
  public readonly createdAt: Date;
  #items: readonly PreparationItem[];
  #sourceVersion: number;
  #generationSignature: string;
  #status: PreparationPlanStatus;
  #updatedAt: Date;
  #completedAt: Date | null;
  #version: number;
  #requiredCoreKeys: readonly string[] | null;

  private constructor(data: PreparationPlanRehydrationData) {
    super(data.id);
    assertPlanData(data);
    const requiredCoreKeys = normalizeRequiredCoreKeys(data.requiredCoreKeys, data.items);
    const selectedCore = new Set(requiredCoreKeys ?? []);
    this.cycleId = data.cycleId;
    this.tomorrowPlanId = data.tomorrowPlanId;
    this.targetDayId = data.targetDayId;
    this.#items = Object.freeze(
      requiredCoreKeys === null
        ? [...data.items]
        : data.items.map((item) => item.withRequired(selectedCore.has(item.key))),
    );
    this.#sourceVersion = data.sourceVersion;
    this.#generationSignature = normalizeKey(data.generationSignature);
    this.#status = data.status;
    this.createdAt = copyDate(data.createdAt);
    this.#updatedAt = copyDate(data.updatedAt);
    this.#completedAt = copyOptionalDate(data.completedAt);
    this.#version = data.version;
    this.#requiredCoreKeys = requiredCoreKeys;
  }

  public static create(data: PreparationPlanCreationData): PreparationPlan {
    return new PreparationPlan({
      ...data,
      items: [],
      requiredCoreKeys: null,
      status: PREPARATION_PLAN_STATUS.inProgress,
      updatedAt: data.createdAt,
      completedAt: null,
      version: 1,
    });
  }

  public static rehydrate(data: PreparationPlanRehydrationData): PreparationPlan {
    return new PreparationPlan(data);
  }

  public get items(): readonly PreparationItem[] {
    return [...this.#items];
  }
  public get activeItems(): readonly PreparationItem[] {
    return this.#items.filter((item) => item.active);
  }
  public get sourceVersion(): number {
    return this.#sourceVersion;
  }
  public get generationSignature(): string {
    return this.#generationSignature;
  }
  public get status(): PreparationPlanStatus {
    return this.#status;
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
  public get requiredCoreKeys(): readonly string[] | null {
    return this.#requiredCoreKeys === null ? null : [...this.#requiredCoreKeys];
  }
  public get coreConfigured(): boolean {
    return this.#requiredCoreKeys !== null;
  }

  public get progress(): Readonly<{ total: number; processed: number; requiredPending: number }> {
    const active = this.activeItems;
    return Object.freeze({
      total: active.length,
      processed: active.filter((item) => item.status !== PREPARATION_ITEM_STATUS.pending).length,
      requiredPending: active.filter(
        (item) => item.required && item.status === PREPARATION_ITEM_STATUS.pending,
      ).length,
    });
  }

  public synchronize(
    requirements: readonly PreparationRequirement[],
    sourceVersion: number,
    generationSignature: string,
    occurredAt: Date,
    createId: () => EntityId,
  ): boolean {
    if (this.#generationSignature === generationSignature) return false;
    assertDate(occurredAt, 'preparation.invalid_update_time');
    const unique = uniqueRequirements(requirements);
    const existingByKey = new Map(this.#items.map((item) => [item.key, item]));
    const activeKeys = new Set(unique.map((requirement) => requirement.key));
    const generated = unique.map((requirement) => {
      const existing = existingByKey.get(requirement.key);
      return (
        existing?.reactivate(requirement) ??
        PreparationItem.create({ ...requirement, id: createId(), planId: this.id })
      );
    });
    const selectedCore = new Set(this.#requiredCoreKeys ?? []);
    const selectedExisting = this.#items.filter(
      (item) => selectedCore.has(item.key) && !activeKeys.has(item.key),
    );
    const historical = this.#items
      .filter((item) => !activeKeys.has(item.key) && !selectedCore.has(item.key))
      .map((item) => item.deactivate());
    const merged = [...generated, ...selectedExisting, ...historical];
    this.#items = Object.freeze(
      this.#requiredCoreKeys === null
        ? merged
        : merged.map((item) => item.withRequired(selectedCore.has(item.key))),
    );
    this.#sourceVersion = sourceVersion;
    this.#generationSignature = normalizeKey(generationSignature);
    this.#status = PREPARATION_PLAN_STATUS.inProgress;
    this.#completedAt = null;
    this.touch(occurredAt);
    return true;
  }

  public completeItem(itemId: EntityId, occurredAt: Date): boolean {
    return this.replaceItem(itemId, (item) => item.complete(occurredAt), occurredAt);
  }

  public skipItem(itemId: EntityId, occurredAt: Date, reason?: string | null): boolean {
    return this.replaceItem(itemId, (item) => item.skip(occurredAt, reason), occurredAt);
  }

  public configureRequiredCore(itemKeys: readonly string[], occurredAt: Date): boolean {
    assertDate(occurredAt, 'preparation.invalid_update_time');
    const normalized = normalizeRequiredCoreKeys(itemKeys, this.#items)!;
    const unchanged =
      this.#requiredCoreKeys !== null &&
      normalized.length === this.#requiredCoreKeys.length &&
      normalized.every((key, index) => key === this.#requiredCoreKeys?.[index]);
    if (unchanged) return false;
    const selected = new Set(normalized);
    this.#items = Object.freeze(
      this.#items.map((item) => (item.active ? item.withRequired(selected.has(item.key)) : item)),
    );
    this.#requiredCoreKeys = Object.freeze(normalized);
    this.#status = PREPARATION_PLAN_STATUS.inProgress;
    this.#completedAt = null;
    this.touch(occurredAt);
    return true;
  }

  public complete(occurredAt: Date): boolean {
    if (this.#status === PREPARATION_PLAN_STATUS.completed) return false;
    if (this.#requiredCoreKeys === null) {
      throw new DomainError(
        'preparation.required_core_not_configured',
        'Сначала настройте обязательное ядро подготовки.',
      );
    }
    if (this.progress.requiredPending > 0) {
      throw new DomainError(
        'preparation.required_items_pending',
        'Сначала завершите или сознательно пропустите обязательные пункты подготовки.',
      );
    }
    assertDate(occurredAt, 'preparation.invalid_completion_time');
    this.#status = PREPARATION_PLAN_STATUS.completed;
    this.#completedAt = copyDate(occurredAt);
    this.touch(occurredAt);
    return true;
  }

  private replaceItem(
    itemId: EntityId,
    mutation: (item: PreparationItem) => PreparationItem,
    occurredAt: Date,
  ): boolean {
    const index = this.#items.findIndex((item) => item.id.equals(itemId) && item.active);
    if (index < 0) {
      throw new DomainError('preparation.item_not_found', 'Пункт подготовки не найден.');
    }
    const current = this.#items[index]!;
    const changed = mutation(current);
    if (changed === current) return false;
    const items = [...this.#items];
    items[index] = changed;
    this.#items = Object.freeze(items);
    this.#status = PREPARATION_PLAN_STATUS.inProgress;
    this.#completedAt = null;
    this.touch(occurredAt);
    return true;
  }

  private touch(occurredAt: Date): void {
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
  }
}

export const PREPARATION_RULE_CONDITION = {
  hasLinkedProject: 'HAS_LINKED_PROJECT',
  firstActionContains: 'FIRST_ACTION_CONTAINS',
  primaryDecisionKind: 'PRIMARY_DECISION_KIND',
} as const;
export type PreparationRuleCondition =
  (typeof PREPARATION_RULE_CONDITION)[keyof typeof PREPARATION_RULE_CONDITION];

export interface PreparationRuleData {
  readonly id: EntityId;
  readonly condition: PreparationRuleCondition;
  readonly conditionValue: string | null;
  readonly category: PreparationCategory;
  readonly title: string;
  readonly required: boolean;
  readonly active: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly version: number;
}

export class PreparationRule extends Entity {
  public readonly condition: PreparationRuleCondition;
  public readonly conditionValue: string | null;
  public readonly category: PreparationCategory;
  public readonly title: string;
  public readonly required: boolean;
  public readonly active: boolean;
  public readonly createdAt: Date;
  public readonly updatedAt: Date;
  public readonly version: number;

  private constructor(data: PreparationRuleData) {
    super(data.id);
    if (!isPreparationRuleCondition(data.condition)) {
      throw new DomainError('preparation_rule.invalid_condition', 'Неизвестное условие правила.');
    }
    const value = normalizeOptionalText(data.conditionValue);
    if (data.condition !== PREPARATION_RULE_CONDITION.hasLinkedProject && value === null) {
      throw new DomainError(
        'preparation_rule.condition_value_required',
        'Для этого условия нужно указать значение.',
      );
    }
    if (data.version < 1 || !Number.isInteger(data.version)) {
      throw new DomainError('preparation_rule.invalid_version', 'Версия правила некорректна.');
    }
    assertDate(data.createdAt, 'preparation_rule.invalid_time');
    assertDate(data.updatedAt, 'preparation_rule.invalid_time');
    this.condition = data.condition;
    this.conditionValue = value;
    this.category = data.category;
    this.title = normalizeTitle(data.title);
    this.required = data.required;
    this.active = data.active;
    this.createdAt = copyDate(data.createdAt);
    this.updatedAt = copyDate(data.updatedAt);
    this.version = data.version;
  }

  public static create(
    data: Omit<PreparationRuleData, 'active' | 'updatedAt' | 'version'>,
  ): PreparationRule {
    return new PreparationRule({ ...data, active: true, updatedAt: data.createdAt, version: 1 });
  }

  public static rehydrate(data: PreparationRuleData): PreparationRule {
    return new PreparationRule(data);
  }
}

export function isPreparationCategory(value: string): value is PreparationCategory {
  return (Object.values(PREPARATION_CATEGORY) as readonly string[]).includes(value);
}
export function isPreparationArea(value: string): value is PreparationArea {
  return (Object.values(PREPARATION_AREA) as readonly string[]).includes(value);
}
export function isPreparationItemStatus(value: string): value is PreparationItemStatus {
  return (Object.values(PREPARATION_ITEM_STATUS) as readonly string[]).includes(value);
}
export function isPreparationPlanStatus(value: string): value is PreparationPlanStatus {
  return (Object.values(PREPARATION_PLAN_STATUS) as readonly string[]).includes(value);
}
export function isPreparationSourceType(value: string): value is PreparationSourceType {
  return (Object.values(PREPARATION_SOURCE_TYPE) as readonly string[]).includes(value);
}
export function isPreparationRuleCondition(value: string): value is PreparationRuleCondition {
  return (Object.values(PREPARATION_RULE_CONDITION) as readonly string[]).includes(value);
}

function uniqueRequirements(
  requirements: readonly PreparationRequirement[],
): readonly PreparationRequirement[] {
  const unique = new Map<string, PreparationRequirement>();
  for (const item of requirements) {
    const normalized = { ...item, key: normalizeKey(item.key), title: normalizeTitle(item.title) };
    if (!unique.has(normalized.key)) unique.set(normalized.key, normalized);
  }
  return [...unique.values()];
}

function assertPlanData(data: PreparationPlanRehydrationData): void {
  if (data.version < 1 || !Number.isInteger(data.version)) {
    throw new DomainError('preparation.invalid_version', 'Версия плана подготовки некорректна.');
  }
  if (data.sourceVersion < 1 || !Number.isInteger(data.sourceVersion)) {
    throw new DomainError(
      'preparation.invalid_source_version',
      'Версия исходного плана некорректна.',
    );
  }
  assertDate(data.createdAt, 'preparation.invalid_time');
  assertDate(data.updatedAt, 'preparation.invalid_time');
  if (data.items.some((item) => !item.planId.equals(data.id))) {
    throw new DomainError('preparation.item_plan_mismatch', 'Пункт относится к другому плану.');
  }
  if (data.status === PREPARATION_PLAN_STATUS.completed && data.completedAt === null) {
    throw new DomainError(
      'preparation.invalid_completed_state',
      'Нет времени завершения подготовки.',
    );
  }
  if (data.status === PREPARATION_PLAN_STATUS.inProgress && data.completedAt !== null) {
    throw new DomainError('preparation.invalid_completed_state', 'Незавершённый план не завершён.');
  }
}

function normalizeRequiredCoreKeys(
  requiredCoreKeys: readonly string[] | null | undefined,
  items: readonly PreparationItem[],
): readonly string[] | null {
  if (requiredCoreKeys === undefined || requiredCoreKeys === null) return null;
  if (requiredCoreKeys.length < 3 || requiredCoreKeys.length > 6) {
    throw new DomainError(
      'preparation.invalid_required_core_size',
      'Выберите от трёх до шести обязательных пунктов.',
    );
  }
  if (new Set(requiredCoreKeys).size !== requiredCoreKeys.length) {
    throw new DomainError(
      'preparation.duplicate_required_core_item',
      'Обязательные пункты не должны повторяться.',
    );
  }
  const selected = new Set(requiredCoreKeys);
  const activeByKey = new Map(
    items.filter((item) => item.active).map((item) => [item.key, item]),
  );
  if (requiredCoreKeys.some((key) => !activeByKey.has(key))) {
    throw new DomainError(
      'preparation.required_core_item_not_found',
      'Обязательный пункт не входит в активную подготовку.',
    );
  }
  return Object.freeze(
    items.filter((item) => item.active && selected.has(item.key)).map((item) => item.key),
  );
}

function assertItemData(data: PreparationItemData): void {
  if (!isPreparationArea(data.area)) {
    throw new DomainError('preparation.invalid_area', 'Неизвестная область подготовки.');
  }
  if (!isPreparationCategory(data.category)) {
    throw new DomainError('preparation.invalid_category', 'Неизвестная категория подготовки.');
  }
  if (!isPreparationItemStatus(data.status)) {
    throw new DomainError('preparation.invalid_item_status', 'Неизвестный статус пункта.');
  }
  if (!isPreparationSourceType(data.sourceType)) {
    throw new DomainError('preparation.invalid_source_type', 'Неизвестный источник пункта.');
  }
  if (data.status === PREPARATION_ITEM_STATUS.completed && data.completedAt === null) {
    throw new DomainError('preparation.invalid_item_state', 'Нет времени завершения пункта.');
  }
  if (data.status === PREPARATION_ITEM_STATUS.skipped && data.skippedAt === null) {
    throw new DomainError('preparation.invalid_item_state', 'Нет факта пропуска пункта.');
  }
  if (
    data.status === PREPARATION_ITEM_STATUS.pending &&
    (data.completedAt !== null || data.skippedAt !== null)
  ) {
    throw new DomainError('preparation.invalid_item_state', 'Ожидающий пункт уже обработан.');
  }
}

function normalizeTitle(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 300) {
    throw new DomainError(
      'preparation.invalid_title',
      'Название пункта должно содержать от 1 до 300 символов.',
    );
  }
  return normalized;
}

function normalizeKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length === 0 || normalized.length > 600) {
    throw new DomainError('preparation.invalid_key', 'Ключ подготовки некорректен.');
  }
  return normalized;
}

function normalizeOptionalText(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized.slice(0, 1_000);
}

function assertDate(value: Date, code: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError(code, 'Время подготовки некорректно.');
  }
}
