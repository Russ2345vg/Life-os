import {
  DAY_STATUS,
  DECISION_KIND,
  DECISION_PRIORITY,
  DECISION_STATUS,
  Decision,
  DecisionTitle,
  ExpectedResult,
  EntityId,
  type DayDate,
  type DecisionKind,
  type DecisionPriority,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { MainDecisionLimitPolicy } from '../decision/MainDecisionLimitPolicy';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { DayRepository } from '../ports/DayRepository';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import { createDecisionJournalEntries } from '../journal/createJournalEntries';
import { domainFailure } from './decisionCommandResult';

export interface CreateDecisionForDateInput {
  readonly title: string;
  readonly kind: DecisionKind;
  readonly plannedDate: DayDate;
  readonly expectedResult?: string;
  readonly reason?: string;
  readonly sphereId?: string | null;
  readonly price?: string;
  readonly sacrifices?: string;
  readonly priority?: DecisionPriority;
  readonly projectReference?: string;
}

export class CreateDecisionForDate {
  readonly #repository: DecisionRepository;
  readonly #dayRepository: DayRepository;
  readonly #limitPolicy: MainDecisionLimitPolicy;
  readonly #currentDateProvider: CurrentDateProvider;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #journalUnitOfWork: JournalUnitOfWork | null;

  public constructor(
    repository: DecisionRepository,
    dayRepository: DayRepository,
    limitPolicy: MainDecisionLimitPolicy,
    currentDateProvider: CurrentDateProvider,
    clock: Clock,
    idGenerator: IdGenerator,
    journalUnitOfWork?: JournalUnitOfWork,
  ) {
    this.#repository = repository;
    this.#dayRepository = dayRepository;
    this.#limitPolicy = limitPolicy;
    this.#currentDateProvider = currentDateProvider;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#journalUnitOfWork = journalUnitOfWork ?? null;
  }

  public async execute(input: CreateDecisionForDateInput): Promise<Result<Decision, DomainError>> {
    const currentDate = this.#currentDateProvider.getCurrentDate();
    if (input.plannedDate.isBefore(currentDate)) {
      return domainFailure(
        new DomainError(
          'decision.planned_date_in_past',
          'Нельзя создать решение на прошедшую дату.',
        ),
      );
    }

    const day = await this.#dayRepository.findByDate(input.plannedDate);
    if (day?.status === DAY_STATUS.completed) {
      return domainFailure(
        new DomainError('decision.completed_day_is_immutable', 'Завершённый день нельзя изменять.'),
      );
    }

    let title: DecisionTitle;
    try {
      title = DecisionTitle.create(input.title);
    } catch (error: unknown) {
      return domainFailure(error);
    }

    const decisions = await this.#repository.findByDate(input.plannedDate);
    const duplicate = decisions.some(
      (decision) =>
        !decision.isArchived() &&
        !decision.isDeleted() &&
        decision.status !== DECISION_STATUS.cancelled &&
        decision.kind === input.kind &&
        decision.title.equals(title),
    );
    if (duplicate) {
      return domainFailure(
        new DomainError(
          'decision.duplicate_for_date',
          'Такое решение уже существует на выбранную дату.',
        ),
      );
    }

    let order: number | null = null;

    if (input.kind === DECISION_KIND.main) {
      const orderResult = this.#limitPolicy.findFirstAvailableOrder(decisions);

      if (!orderResult.ok) {
        return orderResult;
      }

      order = orderResult.value;
    }

    try {
      const occurredAt = this.#clock.now();
      const decisionId = this.#idGenerator.generate();
      const draftEventId = this.#idGenerator.generate();
      const plannedEventId = this.#idGenerator.generate();
      const expectedResult = normalizeExpectedResult(input.expectedResult);
      const reason = normalizeOptionalText(input.reason);
      const sphereId = parseOptionalEntityId(input.sphereId);
      const price = normalizeOptionalText(input.price);
      const sacrifices = normalizeOptionalText(input.sacrifices);
      const projectReference = normalizeOptionalText(input.projectReference);
      const decision = Decision.createDraft({
        id: decisionId,
        title,
        kind: input.kind,
        ...(reason === undefined ? {} : { reason }),
        ...(expectedResult === undefined ? {} : { expectedResult }),
        ...(sphereId === undefined ? {} : { sphereId }),
        ...(price === undefined ? {} : { price }),
        ...(sacrifices === undefined ? {} : { sacrifices }),
        priority: input.priority ?? DECISION_PRIORITY.normal,
        ...(projectReference === undefined ? {} : { projectReference }),
        occurredAt,
        eventId: draftEventId,
      });

      decision.plan({
        plannedDate: input.plannedDate,
        kind: input.kind,
        ...(order === null ? {} : { order }),
        ...(expectedResult === undefined ? {} : { expectedResult }),
        occurredAt,
        eventId: plannedEventId,
      });

      if (this.#journalUnitOfWork === null) {
        await this.#repository.save(decision);
      } else {
        await this.#journalUnitOfWork.commit({
          decisions: [{ decision, expectedVersion: null }],
          journalEntries: createDecisionJournalEntries(decision),
        });
      }
      return success(decision);
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? undefined : normalized;
}

function normalizeExpectedResult(value: string | undefined): ExpectedResult | undefined {
  return value === undefined || value.trim().length === 0
    ? undefined
    : ExpectedResult.create(value);
}

function parseOptionalEntityId(value: string | null | undefined): EntityId | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value.trim().length === 0) return null;
  return EntityId.create(value);
}
