import { DomainError } from '../../shared/errors/DomainError';
import { Entity } from '../shared/Entity';
import { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';
import { DayDate } from '../day/DayDate';
import {
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  EVENING_STAGE_SKIP_REASON,
  type EveningCycleCompletion,
  type EveningCycleMode,
  type EveningModeReason,
  type EveningStageSkipReason,
} from './EveningCycleMode';
import { EVENING_CYCLE_STATE, type EveningCycleState } from './EveningCycleState';
import {
  OPEN_LOOP_REQUIREMENT,
  OpenLoopReference,
  OpenLoopResolution,
  openLoopKey,
  type OpenLoopEntityType,
  type OpenLoopResolutionKind,
} from './OpenLoop';
import {
  ReflectionCorrection,
  ReflectionQuestion,
  ReflectionResult,
  ReflectionSignal,
  REFLECTION_RESULT_STATUS,
} from '../reflection';

export interface EveningCycleCreationData {
  readonly id: EntityId;
  readonly dayId: EntityId;
  readonly dateKey: DayDate;
  readonly occurredAt: Date;
  readonly mode?: EveningCycleMode;
  readonly modeReason?: EveningModeReason | null;
}

export interface EveningStageSkip {
  readonly stage: EveningCycleState;
  readonly reason: EveningStageSkipReason;
  readonly skippedAt: Date;
}

export interface EveningCycleRehydrationData {
  readonly id: EntityId;
  readonly dayId: EntityId;
  readonly dateKey: DayDate;
  readonly state: EveningCycleState;
  readonly mode: EveningCycleMode;
  readonly modeReason?: EveningModeReason | null;
  readonly completion?: EveningCycleCompletion;
  readonly skippedStages?: readonly EveningStageSkip[];
  readonly startedAt: Date | null;
  readonly updatedAt: Date;
  readonly completedAt: Date | null;
  readonly decisionIds?: readonly EntityId[];
  readonly lifeActionIds?: readonly EntityId[];
  readonly openLoopReferences?: readonly OpenLoopReference[];
  readonly openLoopResolutions?: readonly OpenLoopResolution[];
  readonly reflectionQuestions?: readonly ReflectionQuestion[];
  readonly reflectionResults?: readonly ReflectionResult[];
  readonly reflectionSignals?: readonly ReflectionSignal[];
  readonly reflectionCorrections?: readonly ReflectionCorrection[];
  readonly version: number;
}

export class EveningCycle extends Entity {
  readonly #dayId: EntityId;
  readonly #dateKey: DayDate;
  #state: EveningCycleState;
  #mode: EveningCycleMode;
  #modeReason: EveningModeReason | null;
  #completion: EveningCycleCompletion;
  #skippedStages: readonly EveningStageSkip[];
  #startedAt: Date | null;
  #updatedAt: Date;
  #completedAt: Date | null;
  #decisionIds: readonly EntityId[];
  #lifeActionIds: readonly EntityId[];
  #openLoopReferences: readonly OpenLoopReference[];
  #openLoopResolutions: readonly OpenLoopResolution[];
  #reflectionQuestions: readonly ReflectionQuestion[];
  #reflectionResults: readonly ReflectionResult[];
  #reflectionSignals: readonly ReflectionSignal[];
  #reflectionCorrections: readonly ReflectionCorrection[];
  #version: number;

  private constructor(data: EveningCycleRehydrationData) {
    super(data.id);
    this.#dayId = data.dayId;
    this.#dateKey = data.dateKey;
    this.#state = data.state;
    this.#mode = data.mode;
    this.#modeReason = data.modeReason ?? null;
    this.#completion = data.completion ?? EVENING_CYCLE_COMPLETION.completed;
    this.#skippedStages = Object.freeze((data.skippedStages ?? []).map(copySkippedStage));
    this.#startedAt = copyOptionalDate(data.startedAt);
    this.#updatedAt = copyDate(data.updatedAt);
    this.#completedAt = copyOptionalDate(data.completedAt);
    this.#decisionIds = Object.freeze([...(data.decisionIds ?? [])]);
    this.#lifeActionIds = Object.freeze([...(data.lifeActionIds ?? [])]);
    this.#openLoopReferences = Object.freeze([...(data.openLoopReferences ?? [])]);
    this.#openLoopResolutions = Object.freeze([...(data.openLoopResolutions ?? [])]);
    this.#reflectionQuestions = Object.freeze([...(data.reflectionQuestions ?? [])]);
    this.#reflectionResults = Object.freeze([...(data.reflectionResults ?? [])]);
    this.#reflectionSignals = Object.freeze([...(data.reflectionSignals ?? [])]);
    this.#reflectionCorrections = Object.freeze([...(data.reflectionCorrections ?? [])]);
    this.#version = data.version;
  }

  public static create(data: EveningCycleCreationData): EveningCycle {
    assertIdentity(data.id, data.dayId, data.dateKey);
    assertDate(data.occurredAt, 'Время создания вечернего цикла');
    return new EveningCycle({
      ...data,
      state: EVENING_CYCLE_STATE.notStarted,
      mode: data.mode ?? EVENING_CYCLE_MODE.normal,
      modeReason: data.modeReason ?? null,
      completion: EVENING_CYCLE_COMPLETION.completed,
      skippedStages: [],
      startedAt: null,
      updatedAt: data.occurredAt,
      completedAt: null,
      decisionIds: [],
      lifeActionIds: [],
      openLoopReferences: [],
      openLoopResolutions: [],
      reflectionQuestions: [],
      reflectionResults: [],
      reflectionSignals: [],
      reflectionCorrections: [],
      version: 1,
    });
  }

  public static rehydrate(data: EveningCycleRehydrationData): EveningCycle {
    assertRehydrationInvariants(data);
    return new EveningCycle(data);
  }

  public get dayId(): EntityId {
    return this.#dayId;
  }

  public get dateKey(): DayDate {
    return this.#dateKey;
  }

  public get state(): EveningCycleState {
    return this.#state;
  }

  public get mode(): EveningCycleMode {
    return this.#mode;
  }

  public get modeReason(): EveningModeReason | null {
    return this.#modeReason;
  }

  public get completion(): EveningCycleCompletion {
    return this.#completion;
  }

  public get skippedStages(): readonly EveningStageSkip[] {
    return this.#skippedStages.map(copySkippedStage);
  }

  public get startedAt(): Date | null {
    return copyOptionalDate(this.#startedAt);
  }

  public get updatedAt(): Date {
    return copyDate(this.#updatedAt);
  }

  public get completedAt(): Date | null {
    return copyOptionalDate(this.#completedAt);
  }

  public get decisionIds(): readonly EntityId[] {
    return [...this.#decisionIds];
  }

  public get lifeActionIds(): readonly EntityId[] {
    return [...this.#lifeActionIds];
  }

  public get openLoopReferences(): readonly OpenLoopReference[] {
    return [...this.#openLoopReferences];
  }

  public get openLoopResolutions(): readonly OpenLoopResolution[] {
    return [...this.#openLoopResolutions];
  }

  public get reflectionQuestions(): readonly ReflectionQuestion[] {
    return [...this.#reflectionQuestions];
  }

  public get reflectionResults(): readonly ReflectionResult[] {
    return [...this.#reflectionResults];
  }

  public get reflectionSignals(): readonly ReflectionSignal[] {
    return [...this.#reflectionSignals];
  }

  public get reflectionCorrections(): readonly ReflectionCorrection[] {
    return [...this.#reflectionCorrections];
  }

  public get reflectionProgress(): Readonly<{
    total: number;
    processed: number;
    remaining: number;
    complete: boolean;
  }> {
    const processedQuestionIds = new Set(
      this.#reflectionResults.map((result) => result.questionId),
    );
    const processed = this.#reflectionQuestions.filter((question) =>
      processedQuestionIds.has(question.id),
    ).length;
    const remaining = this.#reflectionQuestions.length - processed;
    return Object.freeze({
      total: this.#reflectionQuestions.length,
      processed,
      remaining,
      complete: this.#reflectionQuestions.length > 0 && remaining === 0,
    });
  }

  public get openLoopProgress(): Readonly<{
    total: number;
    resolved: number;
    remaining: number;
  }> {
    const requiredKeys = new Set(
      this.#openLoopReferences
        .filter((reference) => reference.requirement === OPEN_LOOP_REQUIREMENT.requiresResolution)
        .map((reference) => reference.key()),
    );
    const resolved = new Set(
      this.#openLoopResolutions
        .map((resolution) => resolution.key())
        .filter((key) => requiredKeys.has(key)),
    ).size;
    const total = requiredKeys.size;
    return Object.freeze({ total, resolved, remaining: total - resolved });
  }

  public get version(): number {
    return this.#version;
  }

  public switchMode(
    target: EveningCycleMode,
    reason: EveningModeReason,
    occurredAt: Date,
  ): boolean {
    if (this.#state === EVENING_CYCLE_STATE.completed) {
      throw new DomainError(
        'evening_cycle.completed_mode_immutable',
        'Режим завершённого вечернего цикла изменить нельзя.',
      );
    }
    if (target === this.#mode) return false;
    const allowed =
      (this.#mode === EVENING_CYCLE_MODE.normal &&
        (target === EVENING_CYCLE_MODE.quick || target === EVENING_CYCLE_MODE.emergency)) ||
      (this.#mode === EVENING_CYCLE_MODE.quick && target === EVENING_CYCLE_MODE.normal);
    if (!allowed) {
      throw new DomainError(
        'evening_cycle.mode_transition_forbidden',
        `Переключение режима ${this.#mode} → ${target} запрещено.`,
      );
    }
    assertDate(occurredAt, 'Время переключения режима');
    this.#mode = target;
    this.#modeReason = reason;
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }

  public start(occurredAt: Date): void {
    if (this.#state !== EVENING_CYCLE_STATE.notStarted) return;
    this.#startedAt = copyDate(occurredAt);
    this.transition(EVENING_CYCLE_STATE.notStarted, EVENING_CYCLE_STATE.windingDown, occurredAt);
  }

  public beginResolving(occurredAt: Date): void {
    this.transition(EVENING_CYCLE_STATE.windingDown, EVENING_CYCLE_STATE.resolving, occurredAt);
  }

  public initializeOpenLoops(references: readonly OpenLoopReference[], occurredAt: Date): void {
    if (this.#state !== EVENING_CYCLE_STATE.resolving) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.resolving);
    }
    assertDate(occurredAt, 'Время фиксации незавершённых элементов');
    const normalized = uniqueReferences(references);
    if (this.#openLoopReferences.length > 0) {
      if (sameReferences(this.#openLoopReferences, normalized)) return;
      throw new DomainError(
        'evening_cycle.open_loops_already_initialized',
        'Список незавершённых элементов этого вечернего цикла уже зафиксирован.',
      );
    }
    this.#openLoopReferences = normalized;
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
  }

  public recordOpenLoopResolution(
    entityType: OpenLoopEntityType,
    entityId: EntityId,
    resolution: OpenLoopResolutionKind,
    resolvedAt: Date,
    note?: string | null,
  ): boolean {
    if (this.#state !== EVENING_CYCLE_STATE.resolving) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.resolving);
    }
    const key = openLoopKey(entityType, entityId);
    if (resolution === 'REVISE') {
      throw new DomainError(
        'open_loop.revise_is_not_resolution',
        'Изменение само по себе не закрывает незавершённый элемент.',
      );
    }
    const reference = this.#openLoopReferences.find((candidate) => candidate.key() === key);
    if (
      reference === undefined ||
      reference.requirement !== OPEN_LOOP_REQUIREMENT.requiresResolution
    ) {
      throw new DomainError(
        'evening_cycle.open_loop_not_required',
        'Элемент не относится к обязательному разбору этого дня.',
      );
    }
    const existing = this.#openLoopResolutions.find((candidate) => candidate.key() === key);
    if (existing !== undefined) {
      if (existing.resolution === resolution) return false;
      throw new DomainError(
        'evening_cycle.open_loop_already_resolved',
        'Незавершённый элемент уже разобран с другим исходом.',
      );
    }
    const result = OpenLoopResolution.create({
      entityType,
      entityId,
      resolution,
      resolvedAt,
      ...(note === undefined ? {} : { note }),
    });
    this.#openLoopResolutions = Object.freeze([...this.#openLoopResolutions, result]);
    this.#updatedAt = copyDate(resolvedAt);
    this.#version += 1;
    return true;
  }

  public completeResolving(occurredAt: Date): void {
    if (this.#state === EVENING_CYCLE_STATE.resolving && this.openLoopProgress.remaining > 0) {
      throw new DomainError(
        'evening_cycle.open_loops_remaining',
        'Сначала определите судьбу всех обязательных незавершённых элементов.',
      );
    }
    this.transition(EVENING_CYCLE_STATE.resolving, EVENING_CYCLE_STATE.reflecting, occurredAt);
  }

  public beginReflection(occurredAt: Date): void {
    this.completeResolving(occurredAt);
  }

  public initializeReflection(questions: readonly ReflectionQuestion[], occurredAt: Date): boolean {
    if (this.#state !== EVENING_CYCLE_STATE.reflecting) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.reflecting);
    }
    assertDate(occurredAt, 'Время начала осмысления');
    if (questions.length === 0 || questions.length > 4) {
      throw new DomainError(
        'reflection.invalid_question_count',
        'Осмысление должно содержать от одного до четырёх вопросов.',
      );
    }
    const normalized = uniqueQuestions(questions);
    if (this.#reflectionQuestions.length > 0) {
      if (sameQuestions(this.#reflectionQuestions, normalized)) return false;
      throw new DomainError(
        'reflection.questions_already_initialized',
        'Набор вопросов этого осмысления уже зафиксирован.',
      );
    }
    this.#reflectionQuestions = normalized;
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }

  public recordReflectionResult(
    result: ReflectionResult,
    signal: ReflectionSignal | null,
    occurredAt: Date,
  ): boolean {
    if (this.#state !== EVENING_CYCLE_STATE.reflecting) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.reflecting);
    }
    assertDate(occurredAt, 'Время ответа на вопрос');
    if (!result.cycleId.equals(this.id)) {
      throw new DomainError(
        'reflection.cycle_mismatch',
        'Ответ относится к другому вечернему циклу.',
      );
    }
    const question = this.#reflectionQuestions.find(
      (candidate) => candidate.id === result.questionId,
    );
    if (question === undefined) {
      throw new DomainError('reflection.question_not_found', 'Вопрос не входит в это осмысление.');
    }
    const existing = this.#reflectionResults.find(
      (candidate) => candidate.questionId === result.questionId,
    );
    if (existing !== undefined) return false;
    const current = this.nextReflectionQuestion();
    if (current?.id !== question.id) {
      throw new DomainError(
        'reflection.question_out_of_order',
        'Сначала обработайте текущий вопрос.',
      );
    }
    if (question.required && result.status === REFLECTION_RESULT_STATUS.skipped) {
      throw new DomainError(
        'reflection.required_question_cannot_be_skipped',
        'Обязательный вопрос нельзя пропустить.',
      );
    }
    this.#reflectionResults = Object.freeze([...this.#reflectionResults, result]);
    if (signal !== null) {
      if (!signal.cycleId.equals(this.id)) {
        throw new DomainError(
          'reflection.cycle_mismatch',
          'Сигнал относится к другому вечернему циклу.',
        );
      }
      const byKey = new Map(this.#reflectionSignals.map((item) => [item.key(), item]));
      byKey.set(signal.key(), signal);
      this.#reflectionSignals = Object.freeze([...byKey.values()]);
    }
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }

  public addReflectionCorrection(correction: ReflectionCorrection, occurredAt: Date): boolean {
    assertDate(occurredAt, 'Время создания корректировки');
    if (!correction.cycleId.equals(this.id)) {
      throw new DomainError(
        'reflection.cycle_mismatch',
        'Корректировка относится к другому циклу.',
      );
    }
    if (
      !this.#reflectionResults.some((result) => result.questionId === correction.sourceQuestionId)
    ) {
      throw new DomainError(
        'reflection.answer_not_found',
        'Для корректировки сначала нужен сохранённый ответ.',
      );
    }
    if (this.#reflectionCorrections.some((item) => item.id.equals(correction.id))) return false;
    this.#reflectionCorrections = Object.freeze([...this.#reflectionCorrections, correction]);
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }

  public nextReflectionQuestion(): ReflectionQuestion | null {
    const processed = new Set(this.#reflectionResults.map((result) => result.questionId));
    return this.#reflectionQuestions.find((question) => !processed.has(question.id)) ?? null;
  }

  public completeReflection(occurredAt: Date): void {
    if (this.#state === EVENING_CYCLE_STATE.reflecting && !this.reflectionProgress.complete) {
      throw new DomainError(
        'reflection.incomplete',
        'Сначала ответьте на обязательные вопросы и обработайте необязательные.',
      );
    }
    this.transition(
      EVENING_CYCLE_STATE.reflecting,
      EVENING_CYCLE_STATE.planningTomorrow,
      occurredAt,
    );
  }

  public completeReflectionForSelectedMode(occurredAt: Date): void {
    if (this.#mode === EVENING_CYCLE_MODE.normal) {
      this.completeReflection(occurredAt);
      return;
    }
    if (this.#state !== EVENING_CYCLE_STATE.reflecting) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.planningTomorrow);
    }
    if (!this.reflectionProgress.complete) {
      this.recordSkippedStage(
        EVENING_CYCLE_STATE.reflecting,
        this.#mode === EVENING_CYCLE_MODE.quick
          ? EVENING_STAGE_SKIP_REASON.quickMode
          : EVENING_STAGE_SKIP_REASON.emergencyMode,
        occurredAt,
      );
    }
    this.transition(
      EVENING_CYCLE_STATE.reflecting,
      EVENING_CYCLE_STATE.planningTomorrow,
      occurredAt,
    );
  }

  public skipReflection(occurredAt: Date): void {
    if (this.#mode === EVENING_CYCLE_MODE.normal) {
      throw new DomainError(
        'evening_cycle.normal_reflection_required',
        'В обычном режиме этап осмысления нельзя пропустить.',
      );
    }
    this.completeReflectionForSelectedMode(occurredAt);
  }

  public beginTomorrowPlanning(occurredAt: Date): void {
    this.completeReflectionForSelectedMode(occurredAt);
  }

  public completeTomorrowPlanning(occurredAt: Date): void {
    this.transition(
      EVENING_CYCLE_STATE.planningTomorrow,
      EVENING_CYCLE_STATE.preparing,
      occurredAt,
    );
  }

  public beginPreparation(occurredAt: Date): void {
    this.completeTomorrowPlanning(occurredAt);
  }

  public completePreparation(occurredAt: Date): void {
    this.transition(EVENING_CYCLE_STATE.preparing, EVENING_CYCLE_STATE.shutdown, occurredAt);
  }

  public skipPreparation(occurredAt: Date): void {
    if (this.#mode === EVENING_CYCLE_MODE.normal) {
      throw new DomainError(
        'evening_cycle.normal_preparation_required',
        'В обычном режиме этап подготовки нельзя пропустить.',
      );
    }
    if (this.#state !== EVENING_CYCLE_STATE.preparing) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.shutdown);
    }
    this.recordSkippedStage(
      EVENING_CYCLE_STATE.preparing,
      this.#mode === EVENING_CYCLE_MODE.quick
        ? EVENING_STAGE_SKIP_REASON.quickMode
        : EVENING_STAGE_SKIP_REASON.emergencyMode,
      occurredAt,
    );
    this.transition(EVENING_CYCLE_STATE.preparing, EVENING_CYCLE_STATE.shutdown, occurredAt);
  }

  public beginShutdown(occurredAt: Date): void {
    this.completePreparation(occurredAt);
  }

  public complete(
    occurredAt: Date,
    decisionIds: readonly EntityId[] = [],
    lifeActionIds: readonly EntityId[] = [],
  ): void {
    if (this.#state === EVENING_CYCLE_STATE.completed) return;
    this.transition(EVENING_CYCLE_STATE.shutdown, EVENING_CYCLE_STATE.completed, occurredAt);
    this.#completedAt = copyDate(occurredAt);
    this.#completion = EVENING_CYCLE_COMPLETION.completed;
    this.#decisionIds = uniqueIds(decisionIds);
    this.#lifeActionIds = uniqueIds(lifeActionIds);
  }

  public skip(occurredAt: Date): void {
    if (this.#state === EVENING_CYCLE_STATE.completed) {
      if (this.#completion === EVENING_CYCLE_COMPLETION.skipped) return;
      throw new DomainError(
        'evening_cycle.completed_cycle_cannot_be_skipped',
        'Завершённый вечерний цикл нельзя отметить пропущенным.',
      );
    }
    assertDate(occurredAt, 'Время завершения вечернего цикла');
    if (this.#openLoopResolutions.length > 0 || this.#reflectionResults.length > 0) {
      throw new DomainError(
        'evening_cycle.started_cycle_cannot_be_skipped',
        'Цикл, в котором уже обработаны данные, нельзя отметить полностью пропущенным.',
      );
    }
    this.#state = EVENING_CYCLE_STATE.completed;
    this.#completion = EVENING_CYCLE_COMPLETION.skipped;
    this.#startedAt = null;
    this.#completedAt = copyDate(occurredAt);
    this.#updatedAt = copyDate(occurredAt);
    this.#decisionIds = Object.freeze([]);
    this.#lifeActionIds = Object.freeze([]);
    this.#version += 1;
  }

  private recordSkippedStage(
    stage: EveningCycleState,
    reason: EveningStageSkipReason,
    occurredAt: Date,
  ): void {
    if (this.#skippedStages.some((item) => item.stage === stage)) return;
    assertDate(occurredAt, 'Время пропуска этапа');
    this.#skippedStages = Object.freeze([
      ...this.#skippedStages,
      Object.freeze({ stage, reason, skippedAt: copyDate(occurredAt) }),
    ]);
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
  }

  private transition(
    expected: EveningCycleState,
    target: EveningCycleState,
    occurredAt: Date,
  ): void {
    if (this.#state === target) return;
    if (this.#state !== expected) throw invalidTransition(this.#state, target);
    assertDate(occurredAt, 'Время перехода вечернего цикла');
    this.#state = target;
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
  }
}

function assertRehydrationInvariants(data: EveningCycleRehydrationData): void {
  assertIdentity(data.id, data.dayId, data.dateKey);
  assertDate(data.updatedAt, 'Время обновления вечернего цикла');
  if (data.startedAt !== null) assertDate(data.startedAt, 'Время начала вечернего цикла');
  if (data.completedAt !== null) assertDate(data.completedAt, 'Время завершения вечернего цикла');
  if (!Number.isInteger(data.version) || data.version < 1) {
    throw new DomainError('evening_cycle.invalid_version', 'Версия вечернего цикла некорректна.');
  }
  if (data.state === EVENING_CYCLE_STATE.notStarted && data.startedAt !== null) {
    throw invariantViolation('Незапущенный вечерний цикл не может иметь startedAt.');
  }
  if (
    data.state !== EVENING_CYCLE_STATE.notStarted &&
    data.state !== EVENING_CYCLE_STATE.completed &&
    data.startedAt === null
  ) {
    throw invariantViolation('Запущенный вечерний цикл должен иметь startedAt.');
  }
  if (data.state === EVENING_CYCLE_STATE.completed && data.completedAt === null) {
    throw invariantViolation('Завершённый вечерний цикл должен иметь completedAt.');
  }
  if (data.state !== EVENING_CYCLE_STATE.completed && data.completedAt !== null) {
    throw invariantViolation('completedAt допустим только у завершённого вечернего цикла.');
  }
  if (
    data.state !== EVENING_CYCLE_STATE.completed &&
    data.mode !== EVENING_CYCLE_MODE.normal &&
    data.startedAt === null
  ) {
    throw invariantViolation('Особый режим допустим только после завершения вечернего цикла.');
  }
  if (
    data.state === EVENING_CYCLE_STATE.completed &&
    (data.completion ?? EVENING_CYCLE_COMPLETION.completed) ===
      EVENING_CYCLE_COMPLETION.completed &&
    data.startedAt === null
  ) {
    throw invariantViolation('Завершённый вечерний цикл должен иметь startedAt.');
  }
  if (
    (data.completion ?? EVENING_CYCLE_COMPLETION.completed) === EVENING_CYCLE_COMPLETION.skipped &&
    (data.state !== EVENING_CYCLE_STATE.completed || data.startedAt !== null)
  ) {
    throw invariantViolation('Полностью пропущенный вечер должен быть завершён без startedAt.');
  }
  for (const skipped of data.skippedStages ?? []) {
    if (
      skipped.stage !== EVENING_CYCLE_STATE.reflecting &&
      skipped.stage !== EVENING_CYCLE_STATE.preparing
    ) {
      throw invariantViolation('Зафиксирован неизвестный пропущенный этап вечернего цикла.');
    }
    assertDate(skipped.skippedAt, 'Время пропуска этапа');
  }
  assertOpenLoops(data.openLoopReferences ?? [], data.openLoopResolutions ?? []);
  assertReflection(
    data.id,
    data.reflectionQuestions ?? [],
    data.reflectionResults ?? [],
    data.reflectionSignals ?? [],
    data.reflectionCorrections ?? [],
  );
}

function assertOpenLoops(
  references: readonly OpenLoopReference[],
  resolutions: readonly OpenLoopResolution[],
): void {
  const keys = new Set<string>();
  for (const reference of references) {
    if (!(reference instanceof OpenLoopReference) || keys.has(reference.key())) {
      throw invariantViolation('Ссылки незавершённых элементов некорректны.');
    }
    keys.add(reference.key());
  }
  const resolvedKeys = new Set<string>();
  for (const resolution of resolutions) {
    if (
      !(resolution instanceof OpenLoopResolution) ||
      !keys.has(resolution.key()) ||
      resolvedKeys.has(resolution.key())
    ) {
      throw invariantViolation('Результаты разбора незавершённых элементов некорректны.');
    }
    resolvedKeys.add(resolution.key());
  }
}

function assertIdentity(id: EntityId, dayId: EntityId, dateKey: DayDate): void {
  if (!(id instanceof EntityId) || !(dayId instanceof EntityId)) {
    throw invariantViolation('Идентификаторы вечернего цикла и дня некорректны.');
  }
  if (!(dateKey instanceof DayDate)) {
    throw invariantViolation('dateKey вечернего цикла некорректен.');
  }
}

function assertDate(value: Date, label: string): void {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new DomainError('evening_cycle.invalid_time', `${label} содержит некорректное значение.`);
  }
}

function uniqueIds(ids: readonly EntityId[]): readonly EntityId[] {
  const unique = new Map<string, EntityId>();
  for (const id of ids) unique.set(id.toString(), id);
  return Object.freeze([...unique.values()]);
}

function copySkippedStage(value: EveningStageSkip): EveningStageSkip {
  return Object.freeze({ ...value, skippedAt: copyDate(value.skippedAt) });
}

function uniqueReferences(references: readonly OpenLoopReference[]): readonly OpenLoopReference[] {
  const unique = new Map<string, OpenLoopReference>();
  for (const reference of references) {
    if (!(reference instanceof OpenLoopReference)) {
      throw invariantViolation('Ссылка незавершённого элемента некорректна.');
    }
    unique.set(reference.key(), reference);
  }
  return Object.freeze([...unique.values()]);
}

function sameReferences(
  left: readonly OpenLoopReference[],
  right: readonly OpenLoopReference[],
): boolean {
  if (left.length !== right.length) return false;
  const expected = new Map(
    left.map((reference) => [
      reference.key(),
      `${reference.requirement}:${reference.sourceVersion ?? 'unknown'}`,
    ]),
  );
  return right.every(
    (reference) =>
      expected.get(reference.key()) ===
      `${reference.requirement}:${reference.sourceVersion ?? 'unknown'}`,
  );
}

function uniqueQuestions(questions: readonly ReflectionQuestion[]): readonly ReflectionQuestion[] {
  const unique = new Map<string, ReflectionQuestion>();
  for (const question of questions) {
    if (!(question instanceof ReflectionQuestion) || unique.has(question.id)) {
      throw new DomainError('reflection.invalid_questions', 'Набор вопросов некорректен.');
    }
    unique.set(question.id, question);
  }
  return Object.freeze([...unique.values()]);
}

function sameQuestions(
  left: readonly ReflectionQuestion[],
  right: readonly ReflectionQuestion[],
): boolean {
  return (
    left.length === right.length &&
    left.every((question, index) => question.id === right[index]?.id)
  );
}

function assertReflection(
  cycleId: EntityId,
  questions: readonly ReflectionQuestion[],
  results: readonly ReflectionResult[],
  signals: readonly ReflectionSignal[],
  corrections: readonly ReflectionCorrection[],
): void {
  if (questions.length > 4)
    throw invariantViolation('В цикле не может быть больше четырёх вопросов.');
  const questionIds = new Set<string>();
  for (const question of questions) {
    if (!(question instanceof ReflectionQuestion) || questionIds.has(question.id)) {
      throw invariantViolation('Набор вопросов осмысления некорректен.');
    }
    questionIds.add(question.id);
  }
  const resultIds = new Set<string>();
  for (const result of results) {
    if (
      !(result instanceof ReflectionResult) ||
      !result.cycleId.equals(cycleId) ||
      !questionIds.has(result.questionId) ||
      resultIds.has(result.questionId)
    ) {
      throw invariantViolation('Результаты осмысления некорректны.');
    }
    resultIds.add(result.questionId);
  }
  if (
    signals.some(
      (signal) => !(signal instanceof ReflectionSignal) || !signal.cycleId.equals(cycleId),
    )
  ) {
    throw invariantViolation('Сигналы осмысления некорректны.');
  }
  if (
    corrections.some(
      (correction) =>
        !(correction instanceof ReflectionCorrection) ||
        !correction.cycleId.equals(cycleId) ||
        !resultIds.has(correction.sourceQuestionId),
    )
  ) {
    throw invariantViolation('Корректировки осмысления некорректны.');
  }
}

function invalidTransition(from: EveningCycleState, to: EveningCycleState): DomainError {
  return new DomainError(
    'evening_cycle.invalid_transition',
    `Переход вечернего цикла ${from} → ${to} запрещён.`,
  );
}

function invariantViolation(message: string): DomainError {
  return new DomainError('evening_cycle.invariant_violation', message);
}
