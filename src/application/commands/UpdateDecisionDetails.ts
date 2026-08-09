import {
  DECISION_KIND,
  DECISION_STATUS,
  Decision,
  DecisionTitle,
  ExpectedResult,
  type DecisionKind,
  type DecisionPriority,
  type EntityId,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import { MainDecisionLimitPolicy } from '../decision/MainDecisionLimitPolicy';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import { domainFailure } from './decisionCommandResult';

export interface UpdateDecisionDetailsInput {
  readonly decisionId: EntityId;
  readonly expectedVersion?: number;
  readonly title: string;
  readonly expectedResult: string;
  readonly reason?: string;
  readonly sphereId?: EntityId | null;
  readonly price?: string;
  readonly sacrifices?: string;
  readonly priority?: DecisionPriority;
  readonly projectReference?: string;
  readonly kind?: DecisionKind;
}

export class UpdateDecisionDetails {
  readonly #decisionRepository: DecisionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    decisionRepository: DecisionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#decisionRepository = decisionRepository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(input: UpdateDecisionDetailsInput): Promise<Result<Decision, DomainError>> {
    const storedDecision = await this.#decisionRepository.findById(input.decisionId);

    if (storedDecision === null) {
      return failure(new DomainError('decision.not_found', 'Решение не найдено.'));
    }

    const expectedVersion = input.expectedVersion ?? storedDecision.version;
    if (!Number.isInteger(expectedVersion) || expectedVersion < 1) {
      return failure(
        new DomainError('decision.invalid_expected_version', 'Версия решения указана неверно.'),
      );
    }

    if (storedDecision.version !== expectedVersion) {
      return decisionEditConflict();
    }

    if (
      storedDecision.isArchived() ||
      storedDecision.isDeleted() ||
      (storedDecision.status !== DECISION_STATUS.planned &&
        storedDecision.status !== DECISION_STATUS.inProgress)
    ) {
      return failure(
        new DomainError('decision.cannot_edit', 'Это решение уже нельзя редактировать.'),
      );
    }

    if (input.title.trim().length === 0) {
      return failure(new DomainError('decision.title_required', 'Введите название решения.'));
    }

    const kind = input.kind ?? storedDecision.kind;
    if (kind === DECISION_KIND.main && input.expectedResult.trim().length === 0) {
      return failure(
        new DomainError('decision.expected_result_required', 'Укажите ожидаемый результат.'),
      );
    }

    try {
      const title = DecisionTitle.create(input.title);
      const expectedResult = normalizeExpectedResult(input.expectedResult);
      const plannedDate = storedDecision.plannedDate;
      if (plannedDate === null) {
        return failure(
          new DomainError(
            'decision.cannot_edit',
            'Незапланированное решение нельзя редактировать.',
          ),
        );
      }

      const decisionsForDate = await this.#decisionRepository.findByDate(plannedDate);
      const duplicate = decisionsForDate.some(
        (decision) =>
          !decision.id.equals(storedDecision.id) &&
          !decision.isArchived() &&
          !decision.isDeleted() &&
          decision.status !== DECISION_STATUS.cancelled &&
          decision.kind === kind &&
          decision.title.equals(title),
      );
      if (duplicate) {
        return failure(
          new DomainError(
            'decision.duplicate_for_date',
            'Такое решение уже существует на выбранную дату.',
          ),
        );
      }

      let order = storedDecision.order;
      if (storedDecision.status === DECISION_STATUS.planned) {
        if (kind === DECISION_KIND.additional) {
          order = null;
        } else if (storedDecision.kind !== DECISION_KIND.main) {
          const availableOrder = new MainDecisionLimitPolicy(
            this.#decisionRepository,
          ).findFirstAvailableOrder(decisionsForDate, storedDecision.id);
          if (!availableOrder.ok) {
            return availableOrder;
          }
          order = availableOrder.value;
        }
      }

      const reason = normalizeOptionalText(input.reason, storedDecision.reason);
      const sphereId = input.sphereId === undefined ? storedDecision.sphereId : input.sphereId;
      const price = normalizeOptionalText(input.price, storedDecision.price);
      const sacrifices = normalizeOptionalText(input.sacrifices, storedDecision.sacrifices);
      const priority = input.priority ?? storedDecision.priority;
      const projectReference = normalizeOptionalText(
        input.projectReference,
        storedDecision.projectReference,
      );

      if (
        isSameDecisionDetails(storedDecision, {
          title,
          reason,
          expectedResult,
          sphereId,
          price,
          sacrifices,
          priority,
          projectReference,
          kind,
          order,
        })
      ) {
        return success(storedDecision);
      }

      const decision = cloneDecision(storedDecision);
      decision.updateDetails({
        title,
        reason,
        expectedResult,
        sphereId,
        price,
        sacrifices,
        priority,
        projectReference,
        kind,
        order,
        occurredAt: this.#clock.now(),
        eventId: this.#idGenerator.generate(),
      });

      const saved = await saveWithVersionCheck(this.#decisionRepository, decision, expectedVersion);
      return saved ? success(decision) : decisionEditConflict();
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
}

interface ComparableDecisionDetails {
  readonly title: DecisionTitle;
  readonly reason: string | null;
  readonly expectedResult: ExpectedResult | null;
  readonly sphereId: EntityId | null;
  readonly price: string | null;
  readonly sacrifices: string | null;
  readonly priority: DecisionPriority;
  readonly projectReference: string | null;
  readonly kind: DecisionKind;
  readonly order: number | null;
}

function isSameDecisionDetails(decision: Decision, details: ComparableDecisionDetails): boolean {
  const sameExpectedResult =
    decision.expectedResult === null
      ? details.expectedResult === null
      : details.expectedResult !== null && decision.expectedResult.equals(details.expectedResult);

  return (
    decision.title.equals(details.title) &&
    decision.reason === details.reason &&
    sameExpectedResult &&
    sameOptionalEntityId(decision.sphereId, details.sphereId) &&
    decision.price === details.price &&
    decision.sacrifices === details.sacrifices &&
    decision.priority === details.priority &&
    decision.projectReference === details.projectReference &&
    decision.kind === details.kind &&
    decision.order === details.order
  );
}

function normalizeExpectedResult(value: string): ExpectedResult | null {
  return value.trim().length === 0 ? null : ExpectedResult.create(value);
}

function normalizeOptionalText(value: string | undefined, current: string | null): string | null {
  if (value === undefined) {
    return current;
  }

  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}

async function saveWithVersionCheck(
  repository: DecisionRepository,
  decision: Decision,
  expectedVersion: number,
): Promise<boolean> {
  if (repository.saveIfVersionMatches !== undefined) {
    return repository.saveIfVersionMatches(decision, expectedVersion);
  }

  const current = await repository.findById(decision.id);
  if (current === null || current.version !== expectedVersion) {
    return false;
  }

  await repository.save(decision);
  return true;
}

function decisionEditConflict(): Result<never, DomainError> {
  return failure(
    new DomainError(
      'decision.edit_conflict',
      'Решение изменилось в другой вкладке. Обновите карточку и повторите попытку.',
    ),
  );
}

function cloneDecision(decision: Decision): Decision {
  return Decision.rehydrate({
    id: decision.id,
    title: decision.title,
    reason: decision.reason,
    sphereId: decision.sphereId,
    price: decision.price,
    sacrifices: decision.sacrifices,
    priority: decision.priority,
    projectReference: decision.projectReference,
    expectedResult: decision.expectedResult,
    actualResultSummary: decision.actualResultSummary,
    status: decision.status,
    kind: decision.kind,
    plannedDate: decision.plannedDate,
    order: decision.order,
    createdAt: decision.createdAt,
    plannedAt: decision.plannedAt,
    startedAt: decision.startedAt,
    confirmedAt: decision.confirmedAt,
    cancelledAt: decision.cancelledAt,
    cancelReason: decision.cancelReason,
    archivedAt: decision.archivedAt,
    deletedAt: decision.deletedAt,
    lastDeletedAt: decision.lastDeletedAt,
    restoredFromTrashAt: decision.restoredFromTrashAt,
    evidenceIds: decision.evidenceIds,
    rescheduleCount: decision.rescheduleCount,
    version: decision.version,
  });
}

function sameOptionalEntityId(left: EntityId | null, right: EntityId | null): boolean {
  return left === null ? right === null : right !== null && left.equals(right);
}
