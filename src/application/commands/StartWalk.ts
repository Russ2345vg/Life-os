import { WALK_MODE, WALK_STATUS, type EntityId, type Walk, type WalkMode } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { WalkRepository } from '../ports/WalkRepository';
import {
  pickWalkReflectionQuestion,
  type WalkReflectionQuestionPicker,
} from '../walk/WalkReflectionQuestions';

export interface StartWalkInput {
  readonly walkId: EntityId;
  readonly mode: WalkMode;
  readonly timerTargetMinutes?: number;
}

export class StartWalk {
  readonly #inFlight = new Map<string, Promise<Result<Walk, DomainError>>>();

  public constructor(
    readonly repository: WalkRepository,
    readonly currentDateProvider: CurrentDateProvider,
    readonly clock: Clock,
    readonly questionPicker: WalkReflectionQuestionPicker = pickWalkReflectionQuestion,
  ) {}

  public async execute(input: StartWalkInput): Promise<Result<Walk, DomainError>> {
    const key = input.walkId.toString();
    const inFlight = this.#inFlight.get(key);
    if (inFlight !== undefined) return inFlight;
    const execution = this.executeOnce(input);
    this.#inFlight.set(key, execution);
    try {
      return await execution;
    } finally {
      if (this.#inFlight.get(key) === execution) this.#inFlight.delete(key);
    }
  }

  private async executeOnce(input: StartWalkInput): Promise<Result<Walk, DomainError>> {
    try {
      const stored = await this.repository.findById(input.walkId);
      if (stored === null) {
        return failure(new DomainError('walk.not_found', 'Прогулка не найдена.'));
      }
      if (stored.status === WALK_STATUS.running) return success(stored);

      if (
        input.mode === WALK_MODE.timer &&
        (!Number.isInteger(input.timerTargetMinutes) ||
          input.timerTargetMinutes === undefined ||
          input.timerTargetMinutes < 1 ||
          input.timerTargetMinutes > 1440)
      ) {
        return failure(
          new DomainError(
            'walk.invalid_timer_target',
            'Длительность прогулки должна быть целым числом от 1 до 1440 минут.',
          ),
        );
      }

      const currentDate = this.currentDateProvider.getCurrentDate();
      if (!stored.date.equals(currentDate)) {
        return failure(
          stored.date.isBefore(currentDate)
            ? new DomainError(
                'walk.date_in_past',
                'Нельзя начать прогулку, запланированную на прошедшую дату.',
              )
            : new DomainError(
                'walk.date_in_future',
                'Эту прогулку можно начать только в запланированную дату.',
              ),
        );
      }

      const running = await this.repository.findRunning();
      if (running !== null) return anotherWalkRunning();

      const started = stored.start({
        mode: input.mode,
        startedAt: this.clock.now(),
        ...(input.mode === WALK_MODE.timer
          ? { timerTargetMinutes: input.timerTargetMinutes ?? Number.NaN }
          : {}),
        reflectionQuestion: this.questionPicker(),
      });
      const saved = await this.repository.startIfVersionMatches(started, stored.version);
      if (saved === 'saved') return success(started);
      if (saved === 'runningExists') return anotherWalkRunning();

      const concurrent = await this.repository.findById(input.walkId);
      if (concurrent?.status === WALK_STATUS.running) return success(concurrent);
      return failure(
        new DomainError(
          'walk.version_conflict',
          'Прогулка изменилась в другой вкладке. Обновите данные и повторите запуск.',
        ),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError) return failure(error);
      throw error;
    }
  }
}

function anotherWalkRunning(): Result<never, DomainError> {
  return failure(new DomainError('walk.another_running', 'Сначала завершите текущую прогулку.'));
}
