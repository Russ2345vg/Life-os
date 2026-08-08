import type { ActionSession, Day, EntityId, LifeAction } from '../../domain';
import type { ActionSessionRepository } from '../ports/ActionSessionRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { OpenDayConflictReader } from '../ports/OpenDayConflictReader';

export interface OpenDayConflictItem {
  readonly day: Day;
  readonly hasUnfinishedSession: boolean;
}

export interface OpenDayConflictSnapshot {
  readonly hasConflict: boolean;
  readonly openDays: readonly OpenDayConflictItem[];
  readonly unfinishedSession: ActionSession | null;
  readonly unfinishedLifeAction: LifeAction | null;
  readonly unfinishedSessionDayId: EntityId | null;
  readonly hasOrphanedUnfinishedSession: boolean;
}

export class GetOpenDayConflict {
  readonly #reader: OpenDayConflictReader;
  readonly #actionSessionRepository: ActionSessionRepository;
  readonly #lifeActionRepository: LifeActionRepository;

  public constructor(
    reader: OpenDayConflictReader,
    actionSessionRepository: ActionSessionRepository,
    lifeActionRepository: LifeActionRepository,
  ) {
    this.#reader = reader;
    this.#actionSessionRepository = actionSessionRepository;
    this.#lifeActionRepository = lifeActionRepository;
  }

  public async execute(): Promise<OpenDayConflictSnapshot> {
    const [openDays, unfinishedSession] = await Promise.all([
      this.#reader.findOpenDays(),
      this.#actionSessionRepository.findUnfinished(),
    ]);
    const unfinishedLifeAction =
      unfinishedSession === null
        ? null
        : await this.#lifeActionRepository.findById(unfinishedSession.lifeActionId);
    const unfinishedSessionDay =
      unfinishedLifeAction?.plannedDate === null || unfinishedLifeAction?.plannedDate === undefined
        ? null
        : (openDays.find((day) => day.date.equals(unfinishedLifeAction.plannedDate!)) ?? null);
    const hasOrphanedUnfinishedSession =
      unfinishedSession !== null &&
      (unfinishedLifeAction === null || unfinishedSessionDay === null);

    return Object.freeze({
      hasConflict: openDays.length > 1,
      openDays: Object.freeze(
        [...openDays]
          .sort((left, right) => left.date.toString().localeCompare(right.date.toString()))
          .map((day) =>
            Object.freeze({
              day,
              hasUnfinishedSession: unfinishedSessionDay?.id.equals(day.id) ?? false,
            }),
          ),
      ),
      unfinishedSession,
      unfinishedLifeAction,
      unfinishedSessionDayId: unfinishedSessionDay?.id ?? null,
      hasOrphanedUnfinishedSession,
    });
  }
}
