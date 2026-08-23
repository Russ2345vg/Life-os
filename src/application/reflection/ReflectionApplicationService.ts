import {
  EVENING_CYCLE_STATE,
  EVENING_CYCLE_MODE,
  REFLECTION_DAY_SIGNAL,
  REFLECTION_QUESTION_KIND,
  ReflectionCorrection,
  ReflectionEngine,
  ReflectionResult,
  ReflectionSignal,
  signalTypeForFailureReason,
  type EntityId,
  type EveningCycle,
  type ReflectionAnswer,
  type ReflectionQuestion,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { cloneEveningCycle } from '../evening-cycle';
import type { Clock } from '../ports/Clock';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { GetReflectionContext } from '../queries/GetReflectionContext';

export interface ReflectionSession {
  readonly cycle: EveningCycle;
  readonly questions: readonly ReflectionQuestion[];
  readonly currentQuestion: ReflectionQuestion | null;
  readonly processed: number;
  readonly total: number;
  readonly complete: boolean;
}

export interface AnswerReflectionQuestionInput {
  readonly cycleId: EntityId;
  readonly questionId: string;
  readonly answer: ReflectionAnswer;
}

export interface SkipReflectionQuestionInput {
  readonly cycleId: EntityId;
  readonly questionId: string;
}

export interface CreateReflectionCorrectionInput {
  readonly cycleId: EntityId;
  readonly questionId: string;
  readonly action: string;
}

type ReflectionMutation = (cycle: EveningCycle, occurredAt: Date) => void;

export class ReflectionApplicationService {
  readonly #cycles: EveningCycleRepository;
  readonly #getContext: Pick<GetReflectionContext, 'execute'>;
  readonly #engine: ReflectionEngine;
  readonly #clock: Clock;
  readonly #ids: IdGenerator;

  public constructor(
    cycles: EveningCycleRepository,
    getContext: Pick<GetReflectionContext, 'execute'>,
    engine: ReflectionEngine,
    clock: Clock,
    ids: IdGenerator,
  ) {
    this.#cycles = cycles;
    this.#getContext = getContext;
    this.#engine = engine;
    this.#clock = clock;
    this.#ids = ids;
  }

  public async getSession(cycleId: EntityId): Promise<ReflectionSession> {
    let cycle = await this.requiredCycle(cycleId);
    if (
      cycle.state === EVENING_CYCLE_STATE.reflecting &&
      cycle.mode === EVENING_CYCLE_MODE.emergency
    ) {
      cycle = await this.mutate(cycleId, (current, occurredAt) => {
        current.skipReflection(occurredAt);
      });
    } else if (
      cycle.state === EVENING_CYCLE_STATE.reflecting &&
      cycle.reflectionQuestions.length === 0
    ) {
      const context = await this.#getContext.execute(cycleId);
      const generated = this.#engine.generate(context);
      const questions =
        cycle.mode === EVENING_CYCLE_MODE.quick ? selectQuickQuestion(generated) : generated;
      cycle = await this.mutate(cycleId, (current, occurredAt) => {
        if (questions.length === 0) current.skipReflection(occurredAt);
        else current.initializeReflection(questions, occurredAt);
      });
    } else if (
      cycle.state === EVENING_CYCLE_STATE.reflecting &&
      cycle.mode === EVENING_CYCLE_MODE.quick &&
      nextQuickQuestion(cycle) === null
    ) {
      cycle = await this.mutate(cycleId, (current, occurredAt) => {
        current.skipReflection(occurredAt);
      });
    }
    return sessionFrom(cycle);
  }

  public async answer(input: AnswerReflectionQuestionInput): Promise<ReflectionSession> {
    const cycle = await this.mutate(input.cycleId, (current, occurredAt) => {
      const question = requiredQuestion(current, input.questionId);
      const existing = current.reflectionResults.find(
        (result) => result.questionId === question.id,
      );
      if (existing !== undefined) return;
      const result = ReflectionResult.answer(current.id, question, input.answer, occurredAt);
      const signal = createSignal(current, question, input.answer, occurredAt);
      current.recordReflectionResult(result, signal, occurredAt);
      if (current.mode === EVENING_CYCLE_MODE.quick) {
        current.completeReflectionForSelectedMode(occurredAt);
      } else if (current.reflectionProgress.complete) {
        current.completeReflection(occurredAt);
      }
    });
    return sessionFrom(cycle);
  }

  public async skip(input: SkipReflectionQuestionInput): Promise<ReflectionSession> {
    const cycle = await this.mutate(input.cycleId, (current, occurredAt) => {
      const question = requiredQuestion(current, input.questionId);
      const existing = current.reflectionResults.find(
        (result) => result.questionId === question.id,
      );
      if (existing !== undefined) return;
      current.recordReflectionResult(
        ReflectionResult.skip(current.id, question, occurredAt),
        null,
        occurredAt,
      );
      if (current.reflectionProgress.complete) current.completeReflection(occurredAt);
    });
    return sessionFrom(cycle);
  }

  public async createCorrection(
    input: CreateReflectionCorrectionInput,
  ): Promise<ReflectionCorrection> {
    let created: ReflectionCorrection | null = null;
    await this.mutate(input.cycleId, (cycle, occurredAt) => {
      const result = cycle.reflectionResults.find(
        (candidate) => candidate.questionId === input.questionId,
      );
      if (result === undefined || result.answer === null) {
        throw new DomainError(
          'reflection.answer_not_found',
          'Для корректировки сначала нужен сохранённый ответ.',
        );
      }
      created = ReflectionCorrection.create({
        id: this.#ids.generate(),
        cycleId: cycle.id,
        sourceQuestionId: result.questionId,
        sourceEntityIds: result.sourceEntityIds,
        observation: answerText(result.answer),
        action: input.action,
        createdAt: occurredAt,
      });
      cycle.addReflectionCorrection(created, occurredAt);
    });
    if (created === null) {
      throw new DomainError('reflection.correction_not_created', 'Корректировка не создана.');
    }
    return created;
  }

  private async requiredCycle(cycleId: EntityId): Promise<EveningCycle> {
    const cycle = await this.#cycles.findById(cycleId);
    if (cycle === null)
      throw new DomainError('evening_cycle.not_found', 'Вечерний цикл не найден.');
    return cycle;
  }

  private async mutate(cycleId: EntityId, mutation: ReflectionMutation): Promise<EveningCycle> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const stored = await this.requiredCycle(cycleId);
      const cycle = cloneEveningCycle(stored);
      const expectedVersion = cycle.version;
      mutation(cycle, this.#clock.now());
      if (cycle.version === expectedVersion) return cycle;
      if (await this.#cycles.saveIfVersionMatches(cycle, expectedVersion)) return cycle;
    }
    throw new DomainError(
      'reflection.concurrent_change',
      'Осмысление изменилось в другом окне. Повторите операцию.',
    );
  }
}

function sessionFrom(cycle: EveningCycle): ReflectionSession {
  if (
    cycle.state !== EVENING_CYCLE_STATE.reflecting &&
    cycle.state !== EVENING_CYCLE_STATE.planningTomorrow &&
    cycle.state !== EVENING_CYCLE_STATE.preparing &&
    cycle.state !== EVENING_CYCLE_STATE.shutdown &&
    cycle.state !== EVENING_CYCLE_STATE.completed
  ) {
    throw new DomainError(
      'reflection.not_available',
      'Осмысление доступно после разбора незавершённых элементов.',
    );
  }
  const questions =
    cycle.mode === EVENING_CYCLE_MODE.quick
      ? selectQuickQuestion(cycle.reflectionQuestions)
      : cycle.reflectionQuestions;
  const processedIds = new Set(cycle.reflectionResults.map((result) => result.questionId));
  const processed = questions.filter((question) => processedIds.has(question.id)).length;
  return Object.freeze({
    cycle,
    questions: Object.freeze(questions),
    currentQuestion: questions.find((question) => !processedIds.has(question.id)) ?? null,
    processed,
    total: questions.length,
    complete: cycle.state !== EVENING_CYCLE_STATE.reflecting || processed === questions.length,
  });
}

function selectQuickQuestion(
  questions: readonly ReflectionQuestion[],
): readonly ReflectionQuestion[] {
  const critical = questions.find(
    (question) =>
      question.required &&
      (question.signal === REFLECTION_DAY_SIGNAL.failure ||
        question.signal === REFLECTION_DAY_SIGNAL.friction),
  );
  return critical === undefined ? Object.freeze([]) : Object.freeze([critical]);
}

function nextQuickQuestion(cycle: EveningCycle): ReflectionQuestion | null {
  const processed = new Set(cycle.reflectionResults.map((result) => result.questionId));
  return (
    selectQuickQuestion(cycle.reflectionQuestions).find(
      (question) => !processed.has(question.id),
    ) ?? null
  );
}

function requiredQuestion(cycle: EveningCycle, questionId: string): ReflectionQuestion {
  const question = cycle.reflectionQuestions.find((candidate) => candidate.id === questionId);
  if (question === undefined) {
    throw new DomainError('reflection.question_not_found', 'Вопрос не найден.');
  }
  return question;
}

function createSignal(
  cycle: EveningCycle,
  question: ReflectionQuestion,
  answer: ReflectionAnswer,
  occurredAt: Date,
): ReflectionSignal | null {
  if (
    question.kind !== REFLECTION_QUESTION_KIND.mainDecisionFailureReason &&
    question.kind !== REFLECTION_QUESTION_KIND.repeatedFriction
  ) {
    return null;
  }
  const values = typeof answer === 'string' ? [answer] : answer;
  const signalType = values.map(signalTypeForFailureReason).find((value) => value !== null);
  const sourceEntityId = question.sourceEntityIds[0];
  if (signalType === undefined || signalType === null || sourceEntityId === undefined) return null;
  return ReflectionSignal.create({
    type: signalType,
    sourceEntityId,
    cycleId: cycle.id,
    createdAt: occurredAt,
  });
}

function answerText(answer: ReflectionAnswer): string {
  return typeof answer === 'string' ? answer : answer.join(', ');
}
