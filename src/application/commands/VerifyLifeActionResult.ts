import {
  ACTION_SESSION_STATUS,
  LIFE_ACTION_STATUS,
  SESSION_COMPLETION_KIND,
  type ActionActualResult,
  type EntityId,
  type LifeAction,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import { lifeActionDomainFailure, lifeActionNotFound } from './lifeActionCommandResult';

export interface VerifyLifeActionResultInput {
  readonly lifeActionId: EntityId;
  readonly actualResult: ActionActualResult;
}

/**
 * Stage 12.4 application command.
 *
 * A LifeAction may be completed only after there is concrete session evidence:
 * - no running/paused session remains for the action;
 * - at least one session was completed normally;
 * - at least one normally completed session has a recorded result note.
 *
 * This keeps "worked" and "result verified" as different concepts. The command does not
 * confirm a linked Decision automatically; Decision confirmation remains an explicit command
 * with its own evidence rules.
 */
export class VerifyLifeActionResult {
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    lifeActionRepository: LifeActionRepository,
    actionSessionRepository: ActionSessionRepository,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#lifeActionRepository = lifeActionRepository;
    this.#actionSessionRepository = actionSessionRepository;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(
    input: VerifyLifeActionResultInput,
  ): Promise<Result<LifeAction, DomainError>> {
    const lifeAction = await this.#lifeActionRepository.findById(input.lifeActionId);

    if (lifeAction === null) {
      return lifeActionNotFound();
    }

    if (lifeAction.status !== LIFE_ACTION_STATUS.inProgress) {
      return failure(
        new DomainError(
          'life_action.result_verification_requires_in_progress',
          'Подтвердить результат можно только для выполняемого действия.',
        ),
      );
    }

    const sessions = await this.#actionSessionRepository.findByLifeActionId(lifeAction.id);
    const unfinishedSession = sessions.find(
      (session) =>
        session.status === ACTION_SESSION_STATUS.running ||
        session.status === ACTION_SESSION_STATUS.paused,
    );

    if (unfinishedSession !== undefined) {
      return failure(
        new DomainError(
          'life_action.result_verification_requires_closed_session',
          'Сначала завершите текущую рабочую сессию.',
        ),
      );
    }

    const completedSessions = sessions.filter(
      (session) =>
        session.status === ACTION_SESSION_STATUS.completed &&
        session.completionKind === SESSION_COMPLETION_KIND.completed,
    );

    if (completedSessions.length === 0) {
      return failure(
        new DomainError(
          'life_action.result_verification_requires_completed_session',
          'Для подтверждения результата нужна хотя бы одна завершённая рабочая сессия.',
        ),
      );
    }

    if (completedSessions.every((session) => session.resultNote === null)) {
      return failure(
        new DomainError(
          'life_action.result_verification_requires_session_result',
          'Запишите результат хотя бы одной завершённой рабочей сессии.',
        ),
      );
    }

    try {
      lifeAction.complete(input.actualResult, this.#clock.now(), this.#idGenerator.generate());
      await this.#lifeActionRepository.save(lifeAction);
      return success(lifeAction);
    } catch (error: unknown) {
      return lifeActionDomainFailure(error);
    }
  }
}
