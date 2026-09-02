import { DomainError } from '../../shared/errors/DomainError';
import { Entity } from '../shared/Entity';
import { EntityId } from '../shared/EntityId';
import { copyDate, copyOptionalDate } from '../shared/dateCopy';
import { DayDate } from '../day/DayDate';
import {
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  EVENING_MODE_REASON,
  EVENING_STAGE_SKIP_REASON,
  type EveningCycleCompletion,
  type EveningCycleMode,
  type EveningModeReason,
  type EveningStageSkipReason,
} from './EveningCycleMode';
import { EVENING_CYCLE_STATE, type EveningCycleState } from './EveningCycleState';
import {
  RelaxationSnapshot,
  type RelaxationPractice,
  type ScreenFreeDurationMinutes,
} from './RelaxationSnapshot';
import {
  SleepCheckSnapshot,
  type CorrectiveActionKind,
  type SleepCheckAnswerValue,
  type SleepCheckQuestionId,
  type SubjectiveRating,
} from './SleepCheckSnapshot';
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
  readonly skipReason?: string | null;
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
  readonly relaxation?: RelaxationSnapshot | null;
  readonly sleepCheck?: SleepCheckSnapshot | null;
  readonly version: number;
}

export class EveningCycle extends Entity {
  readonly #dayId: EntityId;
  readonly #dateKey: DayDate;
  #state: EveningCycleState;
  #mode: EveningCycleMode;
  #modeReason: EveningModeReason | null;
  #completion: EveningCycleCompletion;
  #skipReason: string | null;
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
  #relaxation: RelaxationSnapshot | null;
  #sleepCheck: SleepCheckSnapshot | null;
  #version: number;

  private constructor(data: EveningCycleRehydrationData) {
    super(data.id);
    this.#dayId = data.dayId;
    this.#dateKey = data.dateKey;
    this.#state = data.state;
    this.#mode = data.mode;
    this.#modeReason = data.modeReason ?? null;
    this.#completion = data.completion ?? EVENING_CYCLE_COMPLETION.completed;
    this.#skipReason = data.skipReason ?? null;
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
    this.#relaxation = copyRelaxation(data.relaxation ?? null);
    this.#sleepCheck = copySleepCheck(data.sleepCheck ?? null);
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
      skipReason: null,
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
      relaxation: null,
      sleepCheck: null,
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

  public get skipReason(): string | null {
    return this.#skipReason;
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

  public get relaxation(): RelaxationSnapshot | null {
    return copyRelaxation(this.#relaxation);
  }

  public get sleepCheck(): SleepCheckSnapshot | null {
    return copySleepCheck(this.#sleepCheck);
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

  public startShort(occurredAt: Date): void {
    if (
      this.#state === EVENING_CYCLE_STATE.preparing &&
      this.#mode === EVENING_CYCLE_MODE.quick &&
      this.#modeReason === EVENING_MODE_REASON.lateNight
    ) {
      return;
    }
    if (this.#state !== EVENING_CYCLE_STATE.notStarted) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.preparing);
    }
    assertDate(occurredAt, 'Время запуска короткого вечернего цикла');
    this.#mode = EVENING_CYCLE_MODE.quick;
    this.#modeReason = EVENING_MODE_REASON.lateNight;
    this.#startedAt = copyDate(occurredAt);
    this.recordSkippedStage(
      EVENING_CYCLE_STATE.resolving,
      EVENING_STAGE_SKIP_REASON.quickMode,
      occurredAt,
    );
    this.recordSkippedStage(
      EVENING_CYCLE_STATE.reflecting,
      EVENING_STAGE_SKIP_REASON.quickMode,
      occurredAt,
    );
    this.recordSkippedStage(
      EVENING_CYCLE_STATE.planningTomorrow,
      EVENING_STAGE_SKIP_REASON.quickMode,
      occurredAt,
    );
    this.#state = EVENING_CYCLE_STATE.preparing;
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
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

  public insertReflectionFollowUp(
    parentQuestionId: string,
    question: ReflectionQuestion,
    occurredAt: Date,
  ): boolean {
    if (this.#state !== EVENING_CYCLE_STATE.reflecting) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.reflecting);
    }
    assertDate(occurredAt, 'Время добавления уточняющего вопроса');
    const parentIndex = this.#reflectionQuestions.findIndex(
      (candidate) => candidate.id === parentQuestionId,
    );
    if (parentIndex < 0) {
      throw new DomainError('reflection.question_not_found', 'Родительский вопрос не найден.');
    }
    if (!this.#reflectionResults.some((result) => result.questionId === parentQuestionId)) {
      throw new DomainError(
        'reflection.follow_up_parent_unanswered',
        'Уточняющий вопрос требует сохранённого ответа.',
      );
    }
    const existing = this.#reflectionQuestions.find((candidate) => candidate.id === question.id);
    if (existing !== undefined) {
      if (sameQuestion(existing, question)) return false;
      throw new DomainError(
        'reflection.duplicate_question',
        'Идентификатор вопроса уже используется.',
      );
    }
    if (this.#reflectionQuestions.length >= 5) {
      throw new DomainError(
        'reflection.question_limit_exceeded',
        'Осмысление не может содержать больше пяти вопросов.',
      );
    }
    this.#reflectionQuestions = Object.freeze([
      ...this.#reflectionQuestions.slice(0, parentIndex + 1),
      question,
      ...this.#reflectionQuestions.slice(parentIndex + 1),
    ]);
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
    this.transition(EVENING_CYCLE_STATE.preparing, EVENING_CYCLE_STATE.relaxing, occurredAt);
  }

  public skipPreparation(occurredAt: Date): void {
    if (this.#mode === EVENING_CYCLE_MODE.normal) {
      throw new DomainError(
        'evening_cycle.normal_preparation_required',
        'В обычном режиме этап подготовки нельзя пропустить.',
      );
    }
    if (this.#state !== EVENING_CYCLE_STATE.preparing) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.relaxing);
    }
    this.recordSkippedStage(
      EVENING_CYCLE_STATE.preparing,
      this.#mode === EVENING_CYCLE_MODE.quick
        ? EVENING_STAGE_SKIP_REASON.quickMode
        : EVENING_STAGE_SKIP_REASON.emergencyMode,
      occurredAt,
    );
    this.transition(EVENING_CYCLE_STATE.preparing, EVENING_CYCLE_STATE.relaxing, occurredAt);
  }

  public beginShutdown(occurredAt: Date): void {
    this.completeRelaxation(occurredAt);
  }

  public initializeRelaxation(
    defaultPractice: RelaxationPractice,
    practiceDurationMinutes: number,
    screenFreeDurationMinutes: ScreenFreeDurationMinutes,
    occurredAt: Date,
  ): boolean {
    if (this.#state !== EVENING_CYCLE_STATE.relaxing) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.relaxing);
    }
    if (this.#relaxation !== null) return false;
    this.#relaxation = RelaxationSnapshot.start({
      defaultPractice,
      practiceDurationMinutes,
      screenFreeDurationMinutes,
      occurredAt,
    });
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }

  public chooseRelaxationPractice(
    practice: RelaxationPractice,
    persistAsDefault: boolean,
    occurredAt: Date,
  ): boolean {
    return this.mutateRelaxation(
      (relaxation) => relaxation.choosePractice(practice, persistAsDefault, occurredAt),
      occurredAt,
    );
  }

  public setRelaxationPracticeDuration(minutes: number, occurredAt: Date): boolean {
    return this.mutateRelaxation(
      (relaxation) =>
        this.#mode === EVENING_CYCLE_MODE.quick
          ? relaxation.setShortPracticeDuration(minutes, occurredAt)
          : relaxation.setPracticeDuration(minutes, occurredAt),
      occurredAt,
    );
  }

  public completeRelaxationDrink(occurredAt: Date): boolean {
    return this.mutateRelaxation((relaxation) => relaxation.completeDrink(occurredAt), occurredAt);
  }

  public completeRelaxationHygiene(occurredAt: Date): boolean {
    return this.mutateRelaxation(
      (relaxation) => relaxation.completeHygiene(occurredAt),
      occurredAt,
    );
  }

  public startRelaxationPracticeTimer(occurredAt: Date): boolean {
    return this.mutateRelaxation(
      (relaxation) => relaxation.startPracticeTimer(occurredAt),
      occurredAt,
    );
  }

  public completeRelaxationPractice(occurredAt: Date): boolean {
    return this.mutateRelaxation(
      (relaxation) => relaxation.completePractice(occurredAt),
      occurredAt,
    );
  }

  public startRelaxationScreenFree(occurredAt: Date): boolean {
    return this.mutateRelaxation(
      (relaxation) => relaxation.startScreenFree(occurredAt),
      occurredAt,
    );
  }

  public shortenRelaxationScreenFree(occurredAt: Date): boolean {
    return this.mutateRelaxation(
      (relaxation) => relaxation.shortenScreenFree(occurredAt),
      occurredAt,
    );
  }

  public skipRelaxationScreenFree(occurredAt: Date): boolean {
    return this.mutateRelaxation((relaxation) => relaxation.skipScreenFree(occurredAt), occurredAt);
  }

  public setBeforeRelaxationRatings(
    calm: SubjectiveRating,
    sleepReadiness: SubjectiveRating,
    occurredAt: Date,
  ): boolean {
    if (this.#state !== EVENING_CYCLE_STATE.relaxing) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.relaxing);
    }
    if (this.#sleepCheck !== null) {
      if (
        this.#sleepCheck.calmBefore === calm &&
        this.#sleepCheck.sleepReadinessBefore === sleepReadiness
      ) {
        return false;
      }
      throw new DomainError(
        'sleep_check.before_ratings_already_recorded',
        'Оценки до расслабления уже сохранены.',
      );
    }
    this.#sleepCheck = SleepCheckSnapshot.start({
      calmBefore: calm,
      sleepReadinessBefore: sleepReadiness,
      occurredAt,
    });
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }

  public completeRelaxation(occurredAt: Date): void {
    if (this.#state !== EVENING_CYCLE_STATE.relaxing) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.shutdown);
    }
    const relaxation = this.requireRelaxation();
    const shortMode = this.#mode === EVENING_CYCLE_MODE.quick;
    if (!(shortMode ? relaxation.readyForShortAt(occurredAt) : relaxation.readyAt(occurredAt))) {
      throw new DomainError(
        'relaxation.not_ready',
        shortMode
          ? 'Завершите гигиену и короткую практику.'
          : 'Завершите напиток, гигиену, практику и период без экранов.',
      );
    }
    if (this.#sleepCheck === null) {
      throw new DomainError(
        'sleep_check.before_ratings_required',
        'Сохраните оценки до расслабления перед продолжением.',
      );
    }
    if (!shortMode) relaxation.completeElapsedScreenFree(occurredAt);
    this.#sleepCheck.startCheck(occurredAt);
    this.transition(EVENING_CYCLE_STATE.relaxing, EVENING_CYCLE_STATE.sleepCheck, occurredAt);
  }

  public setAfterRelaxationRatings(
    calm: SubjectiveRating,
    sleepReadiness: SubjectiveRating,
    occurredAt: Date,
  ): boolean {
    return this.mutateSleepCheck(
      (sleepCheck) => sleepCheck.setAfterRatings(calm, sleepReadiness, occurredAt),
      occurredAt,
    );
  }

  public answerSleepCheckQuestion(
    questionId: SleepCheckQuestionId,
    answer: SleepCheckAnswerValue,
    occurredAt: Date,
  ): boolean {
    return this.mutateSleepCheck(
      (sleepCheck) => sleepCheck.answerQuestion(questionId, answer, occurredAt),
      occurredAt,
    );
  }

  public chooseSleepCheckCorrectiveAction(
    questionId: SleepCheckQuestionId,
    action: CorrectiveActionKind,
    occurredAt: Date,
  ): boolean {
    return this.mutateSleepCheck(
      (sleepCheck) => sleepCheck.chooseCorrectiveAction(questionId, action, occurredAt),
      occurredAt,
    );
  }

  public completeSleepCheckCorrectiveAction(
    questionId: SleepCheckQuestionId,
    capturedThought: string | null,
    occurredAt: Date,
  ): boolean {
    return this.mutateSleepCheck(
      (sleepCheck) => sleepCheck.completeCorrectiveAction(questionId, capturedThought, occurredAt),
      occurredAt,
    );
  }

  public retrySleepCheckQuestion(
    questionId: SleepCheckQuestionId,
    answer: SleepCheckAnswerValue,
    occurredAt: Date,
  ): boolean {
    return this.mutateSleepCheck(
      (sleepCheck) => sleepCheck.retryQuestion(questionId, answer, occurredAt),
      occurredAt,
    );
  }

  public completeSleepCheck(occurredAt: Date): boolean {
    if (this.#state === EVENING_CYCLE_STATE.shutdown && this.#sleepCheck?.completedAt !== null) {
      return false;
    }
    if (this.#state !== EVENING_CYCLE_STATE.sleepCheck) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.shutdown);
    }
    if (!this.requireSleepCheck().complete(occurredAt)) return false;
    this.#state = EVENING_CYCLE_STATE.shutdown;
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }

  public recoverLegacyRelaxation(occurredAt: Date): void {
    if (
      this.#state !== EVENING_CYCLE_STATE.relaxing ||
      this.#relaxation !== null ||
      this.#sleepCheck !== null
    ) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.shutdown);
    }
    this.transition(EVENING_CYCLE_STATE.relaxing, EVENING_CYCLE_STATE.shutdown, occurredAt);
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

  public skip(occurredAt: Date, reason: string | null = null): void {
    if (this.#state === EVENING_CYCLE_STATE.completed) {
      if (this.#completion === EVENING_CYCLE_COMPLETION.skipped) return;
      throw new DomainError(
        'evening_cycle.completed_cycle_cannot_be_skipped',
        'Завершённый вечерний цикл нельзя отметить пропущенным.',
      );
    }
    assertDate(occurredAt, 'Время завершения вечернего цикла');
    const normalizedReason = normalizeSkipReason(reason);
    if (this.#openLoopResolutions.length > 0 || this.#reflectionResults.length > 0) {
      throw new DomainError(
        'evening_cycle.started_cycle_cannot_be_skipped',
        'Цикл, в котором уже обработаны данные, нельзя отметить полностью пропущенным.',
      );
    }
    this.#state = EVENING_CYCLE_STATE.completed;
    this.#completion = EVENING_CYCLE_COMPLETION.skipped;
    this.#skipReason = normalizedReason;
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

  private mutateRelaxation(
    mutation: (relaxation: RelaxationSnapshot) => boolean,
    occurredAt: Date,
  ): boolean {
    if (this.#state !== EVENING_CYCLE_STATE.relaxing) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.relaxing);
    }
    if (!mutation(this.requireRelaxation())) return false;
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }

  private mutateSleepCheck(
    mutation: (sleepCheck: SleepCheckSnapshot) => boolean,
    occurredAt: Date,
  ): boolean {
    if (this.#state !== EVENING_CYCLE_STATE.sleepCheck) {
      throw invalidTransition(this.#state, EVENING_CYCLE_STATE.sleepCheck);
    }
    if (!mutation(this.requireSleepCheck())) return false;
    this.#updatedAt = copyDate(occurredAt);
    this.#version += 1;
    return true;
  }

  private requireRelaxation(): RelaxationSnapshot {
    if (this.#relaxation === null) {
      throw new DomainError(
        'relaxation.not_initialized',
        'Этап расслабления ещё не инициализирован.',
      );
    }
    return this.#relaxation;
  }

  private requireSleepCheck(): SleepCheckSnapshot {
    if (this.#sleepCheck === null) {
      throw new DomainError('sleep_check.not_initialized', 'Проверка сна ещё не инициализирована.');
    }
    return this.#sleepCheck;
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
  if (
    (data.completion ?? EVENING_CYCLE_COMPLETION.completed) !== EVENING_CYCLE_COMPLETION.skipped &&
    data.skipReason !== null &&
    data.skipReason !== undefined
  ) {
    throw invariantViolation('Причина полного пропуска допустима только для SKIPPED.');
  }
  if (data.skipReason !== null && data.skipReason !== undefined) {
    normalizeSkipReason(data.skipReason);
  }
  for (const skipped of data.skippedStages ?? []) {
    if (
      skipped.stage !== EVENING_CYCLE_STATE.resolving &&
      skipped.stage !== EVENING_CYCLE_STATE.reflecting &&
      skipped.stage !== EVENING_CYCLE_STATE.planningTomorrow &&
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
  if (
    data.relaxation !== null &&
    data.relaxation !== undefined &&
    data.state !== EVENING_CYCLE_STATE.relaxing &&
    data.state !== EVENING_CYCLE_STATE.sleepCheck &&
    data.state !== EVENING_CYCLE_STATE.shutdown &&
    data.state !== EVENING_CYCLE_STATE.completed
  ) {
    throw invariantViolation('Расслабление допустимо только после этапа среды.');
  }
  if (
    data.relaxation !== null &&
    data.relaxation !== undefined &&
    data.mode !== EVENING_CYCLE_MODE.quick &&
    data.relaxation.practiceDurationMinutes < 5
  ) {
    throw invariantViolation('Практика короче 5 минут допустима только в QUICK.');
  }
  if (
    data.sleepCheck !== null &&
    data.sleepCheck !== undefined &&
    data.state !== EVENING_CYCLE_STATE.relaxing &&
    data.state !== EVENING_CYCLE_STATE.sleepCheck &&
    data.state !== EVENING_CYCLE_STATE.shutdown &&
    data.state !== EVENING_CYCLE_STATE.completed
  ) {
    throw invariantViolation('Проверка сна допустима только после начала расслабления.');
  }
  const sleepCheck = data.sleepCheck ?? null;
  if (data.state === EVENING_CYCLE_STATE.relaxing && sleepCheck !== null) {
    if (sleepCheck.startedAt !== null || sleepCheck.completedAt !== null) {
      throw invariantViolation('Оценки до расслабления не могут содержать начатую проверку сна.');
    }
  }
  if (data.state === EVENING_CYCLE_STATE.sleepCheck) {
    if (data.relaxation === null || data.relaxation === undefined) {
      throw invariantViolation('Проверка сна требует сохранённый этап расслабления.');
    }
    if (sleepCheck === null || sleepCheck.startedAt === null || sleepCheck.completedAt !== null) {
      throw invariantViolation('Активная проверка сна должна быть начата и не завершена.');
    }
  }
  if (
    sleepCheck !== null &&
    sleepCheck.startedAt !== null &&
    (data.relaxation === null ||
      data.relaxation === undefined ||
      !(data.mode === EVENING_CYCLE_MODE.quick
        ? data.relaxation.readyForShortAt(sleepCheck.startedAt)
        : data.relaxation.readyAt(sleepCheck.startedAt)))
  ) {
    throw invariantViolation('Проверка сна требует завершённый этап расслабления.');
  }
  if (
    sleepCheck !== null &&
    (data.state === EVENING_CYCLE_STATE.shutdown || data.state === EVENING_CYCLE_STATE.completed) &&
    sleepCheck.completedAt === null
  ) {
    throw invariantViolation('После проверки сна допустим только завершённый снимок R6.');
  }
}

function normalizeSkipReason(value: string | null): string | null {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > 500) {
    throw new DomainError(
      'evening_cycle.skip_reason_too_long',
      'Причина пропуска не должна превышать 500 символов.',
    );
  }
  return normalized;
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

function copyRelaxation(value: RelaxationSnapshot | null): RelaxationSnapshot | null {
  if (value === null) return null;
  return RelaxationSnapshot.rehydrate({
    defaultPractice: value.defaultPractice,
    selectedPractice: value.selectedPractice,
    defaultChangedForFuture: value.defaultChangedForFuture,
    practiceDurationMinutes: value.practiceDurationMinutes,
    drinkCompletedAt: value.drinkCompletedAt,
    hygieneCompletedAt: value.hygieneCompletedAt,
    practiceTimerStartedAt: value.practiceTimerStartedAt,
    practiceCompletedAt: value.practiceCompletedAt,
    screenFreeDurationMinutes: value.screenFreeDurationMinutes,
    screenFreeState: value.screenFreeState,
    screenFreeStartedAt: value.screenFreeStartedAt,
    screenFreeSkippedAt: value.screenFreeSkippedAt,
    screenFreeCompletedAt: value.screenFreeCompletedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  });
}

function copySleepCheck(value: SleepCheckSnapshot | null): SleepCheckSnapshot | null {
  if (value === null) return null;
  return SleepCheckSnapshot.rehydrate({
    calmBefore: value.calmBefore,
    sleepReadinessBefore: value.sleepReadinessBefore,
    beforeRatedAt: value.beforeRatedAt,
    calmAfter: value.calmAfter,
    sleepReadinessAfter: value.sleepReadinessAfter,
    afterRatedAt: value.afterRatedAt,
    initialAnswers: value.initialAnswers,
    retriedAnswers: value.retriedAnswers,
    correctiveAction: value.correctiveAction,
    startedAt: value.startedAt,
    completedAt: value.completedAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  });
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

function sameQuestion(left: ReflectionQuestion, right: ReflectionQuestion): boolean {
  return (
    left.id === right.id &&
    left.kind === right.kind &&
    left.signal === right.signal &&
    left.type === right.type &&
    left.prompt === right.prompt &&
    left.context === right.context &&
    left.required === right.required &&
    left.sourceEntityIds.map(String).join(':') === right.sourceEntityIds.map(String).join(':') &&
    left.options.map(({ value, label }) => `${value}:${label}`).join('|') ===
      right.options.map(({ value, label }) => `${value}:${label}`).join('|')
  );
}

function assertReflection(
  cycleId: EntityId,
  questions: readonly ReflectionQuestion[],
  results: readonly ReflectionResult[],
  signals: readonly ReflectionSignal[],
  corrections: readonly ReflectionCorrection[],
): void {
  if (questions.length > 5) throw invariantViolation('В цикле не может быть больше пяти вопросов.');
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
