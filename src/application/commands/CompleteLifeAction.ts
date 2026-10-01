import type { ActionActualResult, EntityId, LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import { createLifeActionJournalEntries } from '../journal/createJournalEntries';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export interface CompleteLifeActionInput {
  readonly lifeActionId: EntityId;
  readonly actualResult?: ActionActualResult | null;
  readonly expectedCompletionKey?: string;
}

export class CompleteLifeAction {
  readonly #repository: LifeActionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #journalUnitOfWork: JournalUnitOfWork | null;

  public constructor(
    repository: LifeActionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
    journalUnitOfWork?: JournalUnitOfWork,
  ) {
    this.#repository = repository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#journalUnitOfWork = journalUnitOfWork ?? null;
  }

  public async execute(input: CompleteLifeActionInput): Promise<Result<LifeAction, DomainError>> {
    const lifeAction = await this.#repository.findById(input.lifeActionId);

    if (lifeAction === null) {
      return lifeActionNotFound();
    }
    const completionKey = lifeAction.completionKey;
    if (
      input.expectedCompletionKey !== undefined &&
      input.expectedCompletionKey !== completionKey
    ) {
      return failure(
        new DomainError(
          'action.completion_changed',
          'Действие изменилось. Обновите список перед выполнением.',
        ),
      );
    }

    try {
      const expectedVersion = lifeAction.version;
      lifeAction.complete(
        input.actualResult ?? null,
        this.#clock.now(),
        this.#idGenerator.generate(),
      );
      if (lifeAction.version === expectedVersion) return success(lifeAction);
      if (this.#journalUnitOfWork === null) {
        await this.#repository.save(lifeAction);
      } else {
        await this.#journalUnitOfWork.commit({
          lifeActions: [{ lifeAction, expectedVersion }],
          journalEntries: createLifeActionJournalEntries(lifeAction),
        });
      }
      return success(lifeAction);
    } catch (error: unknown) {
      if (error instanceof DomainError && error.code === 'persistence.version_conflict') {
        const winner = await this.#repository.findById(input.lifeActionId);
        if (winner?.status === 'completed' && winner.completionKey === completionKey) {
          return success(winner);
        }
      }
      return lifeActionDomainFailure(error);
    }
  }
}
