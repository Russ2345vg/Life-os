import {
  ActionCancelReason,
  LIFE_ACTION_STATUS,
  type EntityId,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import { createLifeActionJournalEntries } from '../journal/createJournalEntries';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export interface CancelLifeActionSafelyInput {
  readonly lifeActionId: EntityId;
  readonly reason?: string;
}

export class CancelLifeActionSafely {
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #journalUnitOfWork: JournalUnitOfWork | null;

  public constructor(
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
    journalUnitOfWork?: JournalUnitOfWork,
  ) {
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#journalUnitOfWork = journalUnitOfWork ?? null;
  }

  public async execute(
    input: CancelLifeActionSafelyInput,
  ): Promise<Result<LifeAction, DomainError>> {
    const lifeAction = await this.#lifeActionRepository.findById(input.lifeActionId);

    if (lifeAction === null) {
      return lifeActionNotFound();
    }

    if (
      lifeAction.isArchived() ||
      (lifeAction.status !== LIFE_ACTION_STATUS.ready &&
        lifeAction.status !== LIFE_ACTION_STATUS.inProgress)
    ) {
      return failure(new DomainError('action.cannot_cancel', 'Это действие уже нельзя отменить.'));
    }

    const sessions = await this.#actionSessionRepository.findByLifeActionId(lifeAction.id);

    if (sessions.some((session) => session.isRunning() || session.isPaused())) {
      return failure(
        new DomainError('action.session_unfinished', 'Сначала завершите текущую сессию.'),
      );
    }

    try {
      const expectedVersion = lifeAction.version;
      const reason = ActionCancelReason.create(input.reason?.trim() || 'Отменено пользователем');
      lifeAction.cancel(this.#clock.now(), this.#idGenerator.generate(), reason);
      if (this.#journalUnitOfWork === null) {
        await this.#lifeActionRepository.save(lifeAction);
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
