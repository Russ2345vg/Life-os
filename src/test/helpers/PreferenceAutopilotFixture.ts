import { IDBFactory } from 'fake-indexeddb';
import { DayDate } from '../../domain';
import { DayAutopilotService } from '../../application/planner/DayAutopilotService';
import { AutopilotSettingsService } from '../../application/planner/AutopilotSettingsService';
import { createEmptySleepSchedule, updateSleepSettings } from '../../domain/sleep/SleepSchedule';
import { IndexedDbAutopilotSettingsStore } from '../../infrastructure/persistence/IndexedDbAutopilotSettingsStore';
import { IndexedDbLifeActionRepository } from '../../infrastructure/persistence/IndexedDbLifeActionRepository';
import { IndexedDbGoalRepository } from '../../infrastructure/persistence/IndexedDbGoalRepository';
import { IndexedDbDirectionRepository } from '../../infrastructure/persistence/IndexedDbDirectionRepository';
import { IndexedDbPlanningRepository } from '../../infrastructure/persistence/IndexedDbPlanningRepository';
import { IndexedDbActionSessionRepository } from '../../infrastructure/persistence/IndexedDbActionSessionRepository';
import { IndexedDbRoutineBlockRepository } from '../../infrastructure/persistence/IndexedDbRoutineBlockRepository';
import { IndexedDbWalkRepository } from '../../infrastructure/persistence/IndexedDbWalkRepository';
import { IndexedDbSleepScheduleRepository } from '../../infrastructure/persistence/IndexedDbSleepScheduleRepository';
import { IndexedDbJournalUnitOfWork } from '../../infrastructure/persistence/IndexedDbJournalUnitOfWork';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { LocalPomodoroPreferences } from '../../infrastructure/time/LocalPomodoroPreferences';
import { FakeClock, FakeIdGenerator } from './Fakes';
export async function preferenceAutopilotFixture() {
  const db = new LifeOsIndexedDb(new IDBFactory());
  const date = DayDate.create('2026-10-10');
  const clock = new FakeClock(new Date('2026-10-10T00:00:00Z'));
  const actions = new IndexedDbLifeActionRepository(db),
    sessions = new IndexedDbActionSessionRepository(db);
  const settings = new AutopilotSettingsService(new IndexedDbAutopilotSettingsStore(db));
  const schedule = new IndexedDbSleepScheduleRepository(db);
  await schedule.save(
    updateSleepSettings(
      createEmptySleepSchedule(),
      { bedtime: '23:00', wakeTime: '07:00', timeZone: 'Asia/Chita', enabled: false },
      clock.now(),
    ),
  );
  const preferences = await settings.getPreferences();
  await settings.savePreferences(
    { ...preferences.value, walk: { ...preferences.value.walk, enabled: false } },
    preferences.version,
  );
  const draft = await settings.getDraft(date.toString());
  await settings.saveDraft({ ...draft.value, startMinute: 540, endMinute: 1320 }, draft.version);
  const profile = {
    settings,
    schedule: { getState: async () => (await schedule.load()) ?? createEmptySleepSchedule() },
    goals: new IndexedDbGoalRepository(db),
    directions: new IndexedDbDirectionRepository(db),
    planning: new IndexedDbPlanningRepository(db),
    blocks: new IndexedDbRoutineBlockRepository(db),
    walks: new IndexedDbWalkRepository(db),
    pomodoro: new LocalPomodoroPreferences(null),
    ids: new FakeIdGenerator('autopilot'),
  };
  const dependencies = {
    actions,
    sessions,
    unitOfWork: new IndexedDbJournalUnitOfWork(db),
    capacity: { get: async () => [null, null, null, null, null, null, null] },
    sleep: { history: async () => [] },
    clock,
    currentDate: { getCurrentDate: () => date },
    profile,
  };
  return {
    db,
    date,
    clock,
    actions,
    sessions,
    settings,
    profile,
    dependencies,
    service: new DayAutopilotService(dependencies),
  };
}
