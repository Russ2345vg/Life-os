import { DECISION_KIND, DECISION_STATUS, Decision, type EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { MainDecisionLimitPolicy } from '../decision/MainDecisionLimitPolicy';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import { domainFailure } from './decisionCommandResult';

export interface RestoreDeletedDecisionInput {
  readonly decisionId: EntityId;
  readonly expectedVersion?: number;
}

export class RestoreDeletedDecision {
  readonly #repository: DecisionRepository;
  readonly #limitPolicy: MainDecisionLimitPolicy;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    repository: DecisionRepository,
    limitPolicy: MainDecisionLimitPolicy,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#repository = repository;
    this.#limitPolicy = limitPolicy;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(input: RestoreDeletedDecisionInput): Promise<Result<Decision, DomainError>> {
    const storedDecision = await this.#repository.findById(input.decisionId);
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
      return restoreConflict();
    }

    if (!storedDecision.isDeleted()) {
      return failure(
        new DomainError(
          'decision.restore_requires_deleted',
          'Восстановить можно только решение из корзины.',
        ),
      );
    }

    const plannedDate = storedDecision.plannedDate;
    let restoredOrder = storedDecision.order;
    if (plannedDate !== null) {
      const decisions = await this.#repository.findByDate(plannedDate);
      const duplicate = decisions.some(
        (decision) =>
          !decision.id.equals(storedDecision.id) &&
          !decision.isDeleted() &&
          !decision.isArchived() &&
          decision.status !== DECISION_STATUS.cancelled &&
          decision.kind === storedDecision.kind &&
          decision.title.equals(storedDecision.title),
      );
      if (duplicate) {
        return failure(
          new DomainError(
            'decision.restore_duplicate',
            'На этой дате уже существует активное решение с таким названием.',
          ),
        );
      }

      const isActiveMainDecision =
        storedDecision.kind === DECISION_KIND.main &&
        (storedDecision.status === DECISION_STATUS.planned ||
          storedDecision.status === DECISION_STATUS.inProgress);
      if (isActiveMainDecision) {
        const availableOrder = this.#limitPolicy.findFirstAvailableOrder(
          decisions,
          storedDecision.id,
        );
        if (!availableOrder.ok) {
          return availableOrder;
        }

        const originalOrderOccupied = decisions.some(
          (decision) =>
            !decision.id.equals(storedDecision.id) &&
            !decision.isDeleted() &&
            !decision.isArchived() &&
            decision.kind === DECISION_KIND.main &&
            (decision.status === DECISION_STATUS.planned ||
              decision.status === DECISION_STATUS.inProgress) &&
            decision.order === storedDecision.order,
        );
        if (storedDecision.order === null || originalOrderOccupied) {
          restoredOrder = availableOrder.value;
        }
      }
    }

    try {
      const decision = cloneDecision(storedDecision, restoredOrder);
      decision.restoreFromTrash(this.#clock.now(), this.#idGenerator.generate());
      const saved = await saveWithVersionCheck(this.#repository, decision, expectedVersion);
      return saved ? success(decision) : restoreConflict();
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
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

function restoreConflict(): Result<never, DomainError> {
  return failure(
    new DomainError(
      'decision.restore_conflict',
      'Решение изменилось в другой вкладке. Обновите корзину и повторите восстановление.',
    ),
  );
}

function cloneDecision(decision: Decision, order: number | null): Decision {
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
    order,
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
