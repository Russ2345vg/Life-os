import type { Day, EntityId } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { OpenDayConflictReader } from '../ports/OpenDayConflictReader';
import type { OpenDayRecoveryUnitOfWork } from '../ports/OpenDayRecoveryUnitOfWork';

export interface ResolveOpenDayConflictInput {
  readonly expectedOpenDays: readonly {
    readonly dayId: EntityId;
    readonly version: number;
  }[];
  readonly keepOpenDayId: EntityId | null;
}

export interface ResolveOpenDayConflictResult {
  readonly completedDays: readonly Day[];
  readonly keptOpenDay: Day | null;
}

export class ResolveOpenDayConflict {
  readonly #reader: OpenDayConflictReader;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #unitOfWork: OpenDayRecoveryUnitOfWork;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;

  public constructor(
    reader: OpenDayConflictReader,
    actionSessionRepository: ActionSessionRepository,
    lifeActionRepository: LifeActionRepository,
    unitOfWork: OpenDayRecoveryUnitOfWork,
    clock: Clock,
    idGenerator: IdGenerator,
  ) {
    this.#reader = reader;
    this.#actionSessionRepository = actionSessionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#unitOfWork = unitOfWork;
    this.#clock = clock;
    this.#idGenerator = idGenerator;
  }

  public async execute(
    input: ResolveOpenDayConflictInput,
  ): Promise<Result<ResolveOpenDayConflictResult, DomainError>> {
    try {
      const openDays = await this.#reader.findOpenDays();

      if (openDays.length <= 1) {
        return failure(
          new DomainError(
            'day.recovery_not_required',
            'Конфликт активных дней уже отсутствует. Обновите состояние.',
          ),
        );
      }

      if (!sameOpenDayVersions(openDays, input.expectedOpenDays)) {
        return failure(
          new DomainError(
            'day.recovery_conflict',
            'Набор активных дней изменился. Обновите восстановление и повторите операцию.',
          ),
        );
      }

      const keepOpenDayId = input.keepOpenDayId;
      const keptOpenDay =
        keepOpenDayId === null
          ? null
          : (openDays.find((day) => day.id.equals(keepOpenDayId)) ?? null);

      if (input.keepOpenDayId !== null && keptOpenDay === null) {
        return failure(
          new DomainError(
            'day.recovery_invalid_keep_day',
            'Выбранный активный день больше не входит в конфликт.',
          ),
        );
      }

      const unfinishedSession = await this.#actionSessionRepository.findUnfinished();
      if (unfinishedSession !== null) {
        const lifeAction = await this.#lifeActionRepository.findById(
          unfinishedSession.lifeActionId,
        );

        if (lifeAction === null || lifeAction.plannedDate === null) {
          return failure(
            new DomainError(
              'day.recovery_orphaned_session',
              'Незавершённая сессия не может быть безопасно связана с активным днём.',
            ),
          );
        }

        const sessionDay = openDays.find((day) => day.date.equals(lifeAction.plannedDate!));
        if (sessionDay === undefined) {
          return failure(
            new DomainError(
              'day.recovery_orphaned_session',
              'Незавершённая сессия относится к дню вне найденного конфликта.',
            ),
          );
        }

        if (keptOpenDay === null || !keptOpenDay.id.equals(sessionDay.id)) {
          return failure(
            new DomainError(
              'day.recovery_session_blocked',
              'Нельзя закрыть день с активной или приостановленной рабочей сессией.',
            ),
          );
        }
      }

      const occurredAt = this.#clock.now();
      const completedDays = openDays.filter(
        (day) => keptOpenDay === null || !day.id.equals(keptOpenDay.id),
      );

      for (const day of completedDays) {
        day.complete(occurredAt, this.#idGenerator.generate());
      }

      await this.#unitOfWork.commit({
        expectedOpenDays: input.expectedOpenDays,
        keepOpenDayId: keptOpenDay?.id ?? null,
        completedDays,
      });

      return success(
        Object.freeze({
          completedDays: Object.freeze([...completedDays]),
          keptOpenDay,
        }),
      );
    } catch (error: unknown) {
      if (error instanceof DomainError) {
        return failure(error);
      }

      throw error;
    }
  }
}

function sameOpenDayVersions(
  openDays: readonly Day[],
  expected: readonly { readonly dayId: EntityId; readonly version: number }[],
): boolean {
  if (openDays.length !== expected.length) {
    return false;
  }

  const expectedById = new Map(expected.map((item) => [item.dayId.toString(), item.version]));
  return openDays.every((day) => expectedById.get(day.id.toString()) === day.version);
}
