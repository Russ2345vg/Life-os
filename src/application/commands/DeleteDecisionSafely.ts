import {
  Decision,
  LIFE_ACTION_STATUS,
  type ActionSession,
  type EntityId,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { domainFailure } from './decisionCommandResult';

export interface DeleteDecisionSafelyInput {
  readonly decisionId: EntityId;
  readonly expectedVersion?: number;
}

export class DeleteDecisionSafely {
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(input: DeleteDecisionSafelyInput): Promise<Result<Decision, DomainError>> {
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
      return deletionConflict();
    }

    if (storedDecision.isDeleted()) {
      return failure(
        new DomainError('decision.already_deleted', 'Решение уже находится в корзине.'),
      );
    }

    if (storedDecision.isArchived()) {
      return failure(
        new DomainError(
          'decision.archived_cannot_be_deleted',
          'Архивированное решение нельзя переместить в корзину.',
        ),
      );
    }

    const lifeActions = await this.#lifeActionRepository.findByDecisionId(storedDecision.id);
    const unfinishedSession = await this.#actionSessionRepository.findUnfinished();
    if (unfinishedSession !== null && belongsToDecision(unfinishedSession, lifeActions)) {
      return failure(
        new DomainError(
          'decision.unfinished_session_blocks_delete',
          'Сначала завершите активную или приостановленную рабочую сессию.',
        ),
      );
    }

    if (lifeActions.some(isUnfinishedLifeAction)) {
      return failure(
        new DomainError(
          'decision.unfinished_actions_block_delete',
          'Сначала завершите или отмените незавершённые действия решения.',
        ),
      );
    }

    try {
      const decision = cloneDecision(storedDecision);
      decision.softDelete(this.#clock.now(), this.#idGenerator.generate());
      const saved = await saveWithVersionCheck(this.#decisionRepository, decision, expectedVersion);
      return saved ? success(decision) : deletionConflict();
    } catch (error: unknown) {
      return domainFailure(error);
    }
  }
}

function isUnfinishedLifeAction(lifeAction: LifeAction): boolean {
  return (
    lifeAction.status === LIFE_ACTION_STATUS.draft ||
    lifeAction.status === LIFE_ACTION_STATUS.ready ||
    lifeAction.status === LIFE_ACTION_STATUS.inProgress
  );
}

function belongsToDecision(
  unfinishedSession: ActionSession,
  lifeActions: readonly LifeAction[],
): boolean {
  return lifeActions.some((lifeAction) => lifeAction.id.equals(unfinishedSession.lifeActionId));
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

function deletionConflict(): Result<never, DomainError> {
  return failure(
    new DomainError(
      'decision.delete_conflict',
      'Решение изменилось в другой вкладке. Обновите карточку и повторите удаление.',
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
    projectId: decision.projectId,
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
    rescheduleHistory: decision.rescheduleHistory,
    version: decision.version,
  });
}
