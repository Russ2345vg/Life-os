import type { ActionActualResult, EntityId, LifeAction } from '../../domain';
import type { DomainError } from '../../shared/errors/DomainError';
import { success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import { createLifeActionJournalEntries } from '../journal/createJournalEntries';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export interface CompleteLifeActionInput {
  readonly lifeActionId: EntityId;
  readonly actualResult: ActionActualResult;
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

    try {
      const expectedVersion = lifeAction.version;
      lifeAction.complete(input.actualResult, this.#clock.now(), this.#idGenerator.generate());
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
      return lifeActionDomainFailure(error);
    }
  }
}
