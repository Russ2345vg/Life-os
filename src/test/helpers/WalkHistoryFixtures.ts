import {
  DayDate,
  EntityId,
  WALK_INTENT,
  WALK_MODE,
  WALK_STATUS,
  WALK_TYPE,
  Walk,
} from '../../domain';
import type { WalkRehydrationData } from '../../domain/walk/Walk';

/** Completed persisted facts, shared by query, presentation and isolated browser fixtures. */
export function historyWalk(
  id = 'history-walk',
  overrides: Partial<Omit<WalkRehydrationData, 'id'>> = {},
): Walk {
  return Walk.rehydrate({
    id: EntityId.create(id),
    date: DayDate.create('2026-08-26'),
    type: WALK_TYPE.mindful,
    intent: WALK_INTENT.free,
    status: WALK_STATUS.completed,
    mode: WALK_MODE.stopwatch,
    startedAt: new Date('2026-08-26T08:00:00Z'),
    endedAt: new Date('2026-08-26T08:30:00Z'),
    timerTargetMinutes: null,
    reflectionQuestion: 'Что сейчас важно?',
    result: null,
    photo: null,
    createdAt: new Date('2026-08-26T07:00:00Z'),
    updatedAt: new Date('2026-08-26T08:30:00Z'),
    version: 3,
    ...overrides,
  });
}
