import { DayDate, LIFE_ACTION_STATUS, type EntityId, type LifeAction } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export interface RescheduleLifeActionSafelyInput {
  readonly lifeActionId: EntityId;
  readonly newPlannedDate: string;
}

export class RescheduleLifeActionSafely {
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #currentDateProvider: CurrentDateProvider;

  public constructor(
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
    currentDateProvider: CurrentDateProvider,
  ) {
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
    this.#currentDateProvider = currentDateProvider;
  }

  public async execute(
    input: RescheduleLifeActionSafelyInput,
  ): Promise<Result<LifeAction, DomainError>> {
    const lifeAction = await this.#lifeActionRepository.findById(input.lifeActionId);

    if (lifeAction === null) {
      return lifeActionNotFound();
    }

    if (lifeAction.isArchived() || lifeAction.status !== LIFE_ACTION_STATUS.ready) {
      return failure(
        new DomainError('action.cannot_reschedule', 'Это действие уже нельзя переносить.'),
      );
    }

    if (input.newPlannedDate.trim().length === 0) {
      return failure(new DomainError('action.planned_date_required', 'Выберите новую дату.'));
    }

    try {
      const newPlannedDate = DayDate.create(input.newPlannedDate);
      const currentDate = this.#currentDateProvider.getCurrentDate();

      if (newPlannedDate.isBefore(currentDate)) {
        return failure(
          new DomainError(
            'action.planned_date_in_past',
            'Нельзя перенести действие на прошедшую дату.',
          ),
        );
      }

      if (lifeAction.plannedDate?.equals(newPlannedDate)) {
        return success(lifeAction);
      }

      const sessions = await this.#actionSessionRepository.findByLifeActionId(lifeAction.id);

      if (sessions.some((session) => session.isRunning() || session.isPaused())) {
        return failure(
          new DomainError('action.session_unfinished', 'Сначала завершите текущую сессию.'),
        );
      }

      lifeAction.reschedule(newPlannedDate, this.#clock.now(), this.#idGenerator.generate());
      await this.#lifeActionRepository.save(lifeAction);
      return success(lifeAction);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
