import {
  buildAutopilotGuard,
  type AutopilotGuardSnapshot,
} from '../../application/planner/AutopilotGuard';
import { createEmptySleepSchedule } from '../../domain/sleep/SleepSchedule';
import {
  defaultAutopilotPreferences,
  defaultAutopilotDayDraft,
  validateAutopilotPreferences,
  validateAutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import type { ContributionLink } from '../../domain/planner/ProgressContribution';
import { DomainError } from '../../shared/errors/DomainError';
import { request } from '../sync/attachments/AttachmentRegistration';
import { LifeActionRecordMapper } from './mappers/LifeActionRecordMapper';
import type { LifeActionRecord } from './records/LifeActionRecord';
import { GoalRecordMapper } from './mappers/GoalRecordMapper';
import { DirectionRecordMapper } from './mappers/DirectionRecordMapper';
import { ActionSessionRecordMapper } from './mappers/ActionSessionRecordMapper';
import type { ActionSessionRecord } from './records/ActionSessionRecord';
import { SleepScheduleRecordMapper } from './mappers/SleepScheduleRecordMapper';
import { SleepObservationRecordMapper } from './mappers/SleepObservationRecordMapper';
import { RoutineBlockRecordMapper } from './mappers/RoutineBlockRecordMapper';
import { WalkRecordMapper } from './mappers/WalkRecordMapper';
import {
  parseAutopilotStored,
  AUTOPILOT_PREFERENCES_KEY,
  autopilotDraftKey,
} from './IndexedDbAutopilotSettingsStore';

export const AUTOPILOT_GUARD_STORES = [
  'lifeActions',
  'goals',
  'directions',
  'contributionLinks',
  'actionSessions',
  'sleepSchedules',
  'sleepObservations',
  'routineBlocks',
  'walks',
  'sync_settings',
] as const;
export async function validateAutopilotGuard(
  transaction: IDBTransaction,
  expected: AutopilotGuardSnapshot,
): Promise<void> {
  const read = (name: string) => request<unknown[]>(transaction.objectStore(name).getAll());
  const [
    actions,
    goals,
    directions,
    links,
    sessions,
    sleep,
    observations,
    blocks,
    walks,
    preferences,
    draft,
  ] = await Promise.all([
    read('lifeActions'),
    read('goals'),
    read('directions'),
    read('contributionLinks'),
    read('actionSessions'),
    request<unknown>(transaction.objectStore('sleepSchedules').get('sleep-schedule')),
    read('sleepObservations'),
    read('routineBlocks'),
    read('walks'),
    request<unknown>(transaction.objectStore('sync_settings').get(AUTOPILOT_PREFERENCES_KEY)),
    request<unknown>(
      transaction.objectStore('sync_settings').get(autopilotDraftKey(expected.date)),
    ),
  ]);
  const actual = buildAutopilotGuard({
    date: expected.date,
    catalog: {
      actions: actions.map((raw) => LifeActionRecordMapper.fromRecord(raw as LifeActionRecord)),
      goals: goals.map(GoalRecordMapper.fromRecord),
      directions: directions.map(DirectionRecordMapper.fromRecord),
      links: links as ContributionLink[],
    },
    sessions: sessions.map((raw) =>
      ActionSessionRecordMapper.fromRecord(raw as ActionSessionRecord),
    ),
    sleep:
      sleep === undefined
        ? createEmptySleepSchedule()
        : SleepScheduleRecordMapper.fromRecord(sleep),
    sleepObservations: observations.map(SleepObservationRecordMapper.fromRecord),
    routineBlocks: blocks.map(RoutineBlockRecordMapper.fromRecord),
    walks: walks.map(WalkRecordMapper.fromRecord),
    preferences:
      preferences === undefined
        ? { schemaVersion: 1, version: 0, value: defaultAutopilotPreferences() }
        : parseAutopilotStored(
            preferences,
            AUTOPILOT_PREFERENCES_KEY,
            validateAutopilotPreferences,
          ),
    draft:
      draft === undefined
        ? { schemaVersion: 1, version: 0, value: defaultAutopilotDayDraft(expected.date) }
        : parseAutopilotStored(draft, autopilotDraftKey(expected.date), validateAutopilotDayDraft),
  });
  if (actual.sourceFingerprint !== expected.sourceFingerprint)
    throw new DomainError(
      'day_autopilot.stale_preview',
      'План устарел: действия, прогулка или распорядок изменились. Пожелания сохранены; соберите оставшуюся часть дня снова.',
    );
}
