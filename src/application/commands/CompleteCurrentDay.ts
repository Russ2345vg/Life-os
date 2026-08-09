import {
  ACTION_SESSION_STATUS,
  ActionActualResult,
  ActionCancelReason,
  DECISION_KIND,
  DECISION_STATUS,
  Day,
  DayDate,
  Decision,
  DecisionTitle,
  ExpectedResult,
  LIFE_ACTION_STATUS,
  LifeAction,
  SESSION_COMPLETION_KIND,
  type DecisionKind,
  type EntityId,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DayCompletionUnitOfWork } from '../ports/DayCompletionUnitOfWork';
import type { IdGenerator } from '../ports/IdGenerator';
import type { EveningReviewSnapshot, GetEveningReview } from '../queries/GetEveningReview';
import {
  createDayJournalEntries,
  createDecisionJournalEntries,
  createLifeActionJournalEntries,
} from '../journal/createJournalEntries';

export type EveningLifeActionResolution =
  | Readonly<{
      kind: 'complete';
      lifeActionId: EntityId;
      actualResult: string;
    }>
  | Readonly<{
      kind: 'reschedule';
      lifeActionId: EntityId;
      newPlannedDate: string;
    }>
  | Readonly<{
      kind: 'cancel';
      lifeActionId: EntityId;
      reason: string;
    }>;

export interface TomorrowDecisionDraft {
  readonly title: string;
  readonly kind: DecisionKind;
  readonly expectedResult?: string;
}

export interface CompleteCurrentDayInput {
  readonly summary: string;
  readonly sphereId?: EntityId | null;
  readonly actionResolutions: readonly EveningLifeActionResolution[];
  readonly tomorrowDecisions: readonly TomorrowDecisionDraft[];
}

export interface CompleteCurrentDayResult {
  readonly day: Day;
  readonly resolvedLifeActions: readonly LifeAction[];
  readonly createdTomorrowDecisions: readonly Decision[];
}

const MAX_DAY_SUMMARY_LENGTH = 4000;

export class CompleteCurrentDay {
  readonly #getEveningReview: Pick<GetEveningReview, 'execute'>;
  readonly #unitOfWork: DayCompletionUnitOfWork;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    getEveningReview: Pick<GetEveningReview, 'execute'>,
    unitOfWork: DayCompletionUnitOfWork,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#getEveningReview = getEveningReview;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(
    input: CompleteCurrentDayInput,
    reviewDate?: DayDate,
  ): Promise<Result<CompleteCurrentDayResult, DomainError>> {
    try {
      const snapshot = await this.#getEveningReview.execute(reviewDate);
      validateDayCanBeCompleted(snapshot);
      const summary = normalizeSummary(input.summary);
      const occurredAt = this.#clock.now();
      const unresolvedActions = snapshot.lifeActions.filter(isUnfinishedLifeAction);
      const resolutions = indexResolutions(input.actionResolutions, unresolvedActions);
      const resolvedLifeActions = unresolvedActions.map((lifeAction) =>
        resolveLifeAction(
          cloneLifeAction(lifeAction),
          lifeAction.version,
          resolutions.get(lifeAction.id.toString())!,
          snapshot,
          occurredAt,
          this.#idGenerator,
        ),
      );
      const createdTomorrowDecisions = createTomorrowDecisions(
        input.tomorrowDecisions,
        snapshot,
        occurredAt,
        this.#idGenerator,
      );
      const completedDay = cloneDay(snapshot.day);
      const expectedDayVersion = completedDay.version;
      completedDay.complete(
        occurredAt,
        this.#idGenerator.generate(),
        summary,
        input.sphereId ?? null,
      );

      await this.#unitOfWork.commit({
        day: completedDay,
        expectedDayVersion,
        lifeActions: resolvedLifeActions.map(({ lifeAction, expectedVersion }) => ({
          lifeAction,
          expectedVersion,
        })),
        tomorrowDate: snapshot.tomorrowDate,
        newTomorrowDecisions: createdTomorrowDecisions,
        journalEntries: [
          ...createDayJournalEntries(completedDay),
          ...resolvedLifeActions.flatMap(({ lifeAction }) =>
            createLifeActionJournalEntries(lifeAction),
          ),
          ...createdTomorrowDecisions.flatMap(createDecisionJournalEntries),
        ],
      });

      return success(
        Object.freeze({
          day: completedDay,
          resolvedLifeActions: Object.freeze(
            resolvedLifeActions.map(({ lifeAction }) => lifeAction),
          ),
          createdTomorrowDecisions: Object.freeze([...createdTomorrowDecisions]),
        }),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        return failure(error);
      }

      throw error;
    }
  }
}

function validateDayCanBeCompleted(snapshot: EveningReviewSnapshot): void {
  if (snapshot.day.status === 'completed') {
    throw new DomainError('day.already_completed', 'День уже завершён.');
  }

  if (snapshot.day.status !== 'open') {
    throw new DomainError(
      'day.completion_requires_open_day',
      'Вечерний контроль доступен только после начала дня.',
    );
  }

  if (snapshot.unfinishedSession !== null) {
    const message =
      snapshot.unfinishedSession.status === ACTION_SESSION_STATUS.paused
        ? 'Сначала завершите приостановленную рабочую сессию.'
        : 'Сначала завершите активную рабочую сессию.';
    throw new DomainError('day.unfinished_session', message);
  }

  if (snapshot.routineSummary !== undefined && snapshot.routineSummary.runningExecution !== null) {
    throw new DomainError(
      'day.running_routine_execution',
      'Сначала завершите или прервите текущий блок распорядка.',
    );
  }
}

function normalizeSummary(value: string): string {
  const summary = value.trim();

  if (summary.length === 0) {
    throw new DomainError('day.summary_required', 'Запишите итог дня.');
  }

  if (summary.length > MAX_DAY_SUMMARY_LENGTH) {
    throw new DomainError(
      'day.summary_too_long',
      `Итог дня не должен превышать ${MAX_DAY_SUMMARY_LENGTH} символов.`,
    );
  }

  return summary;
}

function indexResolutions(
  resolutions: readonly EveningLifeActionResolution[],
  unfinishedActions: readonly LifeAction[],
): ReadonlyMap<string, EveningLifeActionResolution> {
  const expectedIds = new Set(unfinishedActions.map((action) => action.id.toString()));
  const indexed = new Map<string, EveningLifeActionResolution>();

  for (const resolution of resolutions) {
    const id = resolution.lifeActionId.toString();

    if (!expectedIds.has(id)) {
      throw new DomainError(
        'day.unknown_action_resolution',
        'В вечернем контроле указано действие, которое не требует обработки.',
      );
    }

    if (indexed.has(id)) {
      throw new DomainError(
        'day.duplicate_action_resolution',
        'Для одного действия нельзя указать два решения.',
      );
    }

    indexed.set(id, resolution);
  }

  const missing = unfinishedActions.find((action) => !indexed.has(action.id.toString()));
  if (missing !== undefined) {
    throw new DomainError(
      'day.action_resolution_required',
      `Обработайте действие «${missing.title.toString()}»: завершите, перенесите или отмените.`,
    );
  }

  return indexed;
}

function resolveLifeAction(
  lifeAction: LifeAction,
  expectedVersion: number,
  resolution: EveningLifeActionResolution,
  snapshot: EveningReviewSnapshot,
  occurredAt: Date,
  idGenerator: IdGenerator,
): { readonly lifeAction: LifeAction; readonly expectedVersion: number } {
  switch (resolution.kind) {
    case 'complete': {
      if (lifeAction.status !== LIFE_ACTION_STATUS.inProgress) {
        throw new DomainError(
          'day.action_completion_requires_in_progress',
          `Действие «${lifeAction.title.toString()}» нельзя завершить без начатого выполнения.`,
        );
      }

      const hasCompletedSession = snapshot.actionSessions.some(
        (session) =>
          session.lifeActionId.equals(lifeAction.id) &&
          session.status === ACTION_SESSION_STATUS.completed &&
          session.completionKind === SESSION_COMPLETION_KIND.completed,
      );

      if (!hasCompletedSession) {
        throw new DomainError(
          'day.action_completion_requires_session',
          `Для действия «${lifeAction.title.toString()}» нужна хотя бы одна завершённая рабочая сессия.`,
        );
      }

      lifeAction.complete(
        ActionActualResult.create(resolution.actualResult),
        occurredAt,
        idGenerator.generate(),
      );
      break;
    }
    case 'reschedule': {
      const targetDate = parseFutureDate(resolution.newPlannedDate, snapshot);
      lifeAction.reschedule(targetDate, occurredAt, idGenerator.generate());
      break;
    }
    case 'cancel': {
      const reason = resolution.reason.trim() || 'Отменено при вечернем контроле';
      lifeAction.cancel(occurredAt, idGenerator.generate(), ActionCancelReason.create(reason));
      break;
    }
  }

  return Object.freeze({ lifeAction, expectedVersion });
}

function parseFutureDate(value: string, snapshot: EveningReviewSnapshot): DayDate {
  const date = DayDate.create(value);

  if (date.isBefore(snapshot.tomorrowDate)) {
    throw new DomainError(
      'day.action_reschedule_requires_future_date',
      snapshot.isRecoveryReview
        ? 'При восстановлении прошлого дня действие можно перенести только на сегодня или более позднюю дату.'
        : 'При завершении дня действие можно перенести только на будущую дату.',
    );
  }

  return date;
}

function createTomorrowDecisions(
  drafts: readonly TomorrowDecisionDraft[],
  snapshot: EveningReviewSnapshot,
  occurredAt: Date,
  idGenerator: IdGenerator,
): readonly Decision[] {
  const activeTomorrowDecisions = snapshot.tomorrowDecisions.filter(
    (decision) =>
      !decision.isArchived() &&
      !decision.isDeleted() &&
      (decision.status === DECISION_STATUS.planned ||
        decision.status === DECISION_STATUS.inProgress),
  );
  const occupiedOrders = new Set(
    activeTomorrowDecisions
      .filter((decision) => decision.kind === DECISION_KIND.main)
      .map((decision) => decision.order),
  );
  const created: Decision[] = [];

  for (const draft of drafts) {
    const title = draft.title.trim();
    const expectedResultText = draft.expectedResult?.trim() ?? '';

    if (title.length === 0 && expectedResultText.length === 0) {
      continue;
    }

    if (title.length === 0) {
      throw new DomainError('decision.title_required', 'Введите название решения на завтра.');
    }

    if (draft.kind === DECISION_KIND.main && expectedResultText.length === 0) {
      throw new DomainError(
        'decision.expected_result_required',
        'Для главного решения на завтра укажите ожидаемый результат.',
      );
    }

    let order: number | null = null;
    if (draft.kind === DECISION_KIND.main) {
      order = [1, 2, 3].find((candidate) => !occupiedOrders.has(candidate)) ?? null;

      if (order === null) {
        throw new DomainError(
          'decision.main_limit_reached',
          'На завтра уже подготовлены три главных решения.',
        );
      }
      occupiedOrders.add(order);
    }

    const expectedResult =
      expectedResultText.length === 0 ? undefined : ExpectedResult.create(expectedResultText);
    const decision = Decision.createDraft({
      id: idGenerator.generate(),
      title: DecisionTitle.create(title),
      kind: draft.kind,
      ...(expectedResult === undefined ? {} : { expectedResult }),
      occurredAt,
      eventId: idGenerator.generate(),
    });
    decision.plan({
      plannedDate: snapshot.tomorrowDate,
      kind: draft.kind,
      ...(order === null ? {} : { order }),
      ...(expectedResult === undefined ? {} : { expectedResult }),
      occurredAt,
      eventId: idGenerator.generate(),
    });
    created.push(decision);
  }

  const totalMainCount =
    activeTomorrowDecisions.filter((decision) => decision.kind === DECISION_KIND.main).length +
    created.filter((decision) => decision.kind === DECISION_KIND.main).length;

  if (totalMainCount === 0) {
    throw new DomainError(
      'day.tomorrow_main_decision_required',
      'Подготовьте хотя бы одно главное решение на завтра.',
    );
  }

  return Object.freeze(created);
}

function isUnfinishedLifeAction(lifeAction: LifeAction): boolean {
  return (
    lifeAction.status === LIFE_ACTION_STATUS.ready ||
    lifeAction.status === LIFE_ACTION_STATUS.inProgress
  );
}

function cloneDay(day: Day): Day {
  return Day.rehydrate({
    id: day.id,
    date: day.date,
    status: day.status,
    createdAt: day.createdAt,
    plannedAt: day.plannedAt,
    openedAt: day.openedAt,
    firstActivityAt: day.firstActivityAt,
    completedAt: day.completedAt,
    summary: day.summary,
    sphereId: day.sphereId,
    version: day.version,
  });
}

function cloneLifeAction(lifeAction: LifeAction): LifeAction {
  return LifeAction.rehydrate({
    id: lifeAction.id,
    title: lifeAction.title,
    description: lifeAction.description,
    expectedResult: lifeAction.expectedResult,
    actualResult: lifeAction.actualResult,
    status: lifeAction.status,
    decisionId: lifeAction.decisionId,
    sphereId: lifeAction.sphereId,
    plannedDate: lifeAction.plannedDate,
    createdAt: lifeAction.createdAt,
    readyAt: lifeAction.readyAt,
    startedAt: lifeAction.startedAt,
    completedAt: lifeAction.completedAt,
    cancelledAt: lifeAction.cancelledAt,
    cancelReason: lifeAction.cancelReason,
    archivedAt: lifeAction.archivedAt,
    rescheduleCount: lifeAction.rescheduleCount,
    version: lifeAction.version,
  });
}
