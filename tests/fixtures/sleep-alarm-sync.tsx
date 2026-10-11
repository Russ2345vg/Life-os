import { createRoot } from 'react-dom/client';
import { createLifeOsApplication } from '../../src/app/composition/createLifeOsApplication';
import {
  buildWakeAlarmSchedule,
  createAndroidAlarmReport,
} from '../../src/application/sleep/WakeAlarmConfirmation';
import { unavailableWakeAlarmStatus } from '../../src/application/sleep/WakeAlarmGateway';
import { LifeOsIndexedDb } from '../../src/infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { IndexedDbPilotSyncStore } from '../../src/infrastructure/sync/pilot/IndexedDbPilotSyncStore';
import { normalizePilotRecord } from '../../src/infrastructure/sync/pilot/PilotSyncRegistryAdapters';
import { IndexedDbSyncStatusSource } from '../../src/infrastructure/sync/IndexedDbSyncStatusSource';
import { UnavailableSyncApplication } from '../../src/infrastructure/sync/UnavailableSyncApplication';
import { SleepScheduleRecordMapper } from '../../src/infrastructure/persistence/mappers/SleepScheduleRecordMapper';
import { SleepObservationRecordMapper } from '../../src/infrastructure/persistence/mappers/SleepObservationRecordMapper';
import { setSleepMorningFeedback } from '../../src/domain/sleep/SleepObservation';
import { SleepPreparationPage } from '../../src/presentation/planner-v2/SleepPreparationPage';
import { SyncStatusProvider } from '../../src/presentation/sync/SyncStatusContext';
import '../../src/presentation/styles/global.css';
import '../../src/presentation/planner-v2/planner-v2.css';
import '../../src/presentation/planner-v2/planner-master.css';
import '../../src/presentation/planner-v2/planner-premium.css';

const database = new LifeOsIndexedDb();
class FixtureSync extends UnavailableSyncApplication {
  public readonly statusSource = new IndexedDbSyncStatusSource(database);
}
async function bootstrap() {
  const app = await createLifeOsApplication({ database, syncEnvironment: {} });
  await app.sleepSchedule.saveSettings({
    bedtime: '22:30',
    wakeTime: '07:15',
    timeZone: 'Asia/Chita',
    enabled: true,
  });
  await app.sleepSchedule.openCurrentNight();
  let revision = 0;
  Object.assign(window, {
    sleepAlarmSyncFixture: {
      importFeedback: async (cycleDate: string) => {
        const now = new Date();
        const previous = (await app.sleepObservations.history(cycleDate, cycleDate))[0] ?? null;
        const observation = setSleepMorningFeedback(previous, {
          id: `sleep-observation:${cycleDate}`,
          cycleDate,
          nightCycleId: null,
          timeZone: 'Asia/Chita',
          patch: { energy: 'ENERGETIC' },
          now,
        });
        await new IndexedDbPilotSyncStore(database).applyPulled(
          'fixture-space',
          ++revision,
          {
            protocolVersion: 1,
            schemaVersion: 1,
            entityType: 'sleep_observation',
            operation: 'upsert',
            objectId: observation.id,
            eventId: `feedback-${revision}`,
            originDeviceId: 'android-fixture',
            keyEpoch: 1,
            baseRevision: 0,
            revision: 1,
            hlc: { wallTime: now.getTime(), logical: revision },
            record: normalizePilotRecord(
              'sleep_observation',
              SleepObservationRecordMapper.toRecord(observation),
            ),
          },
          'fixture-transport',
          { kind: 'fast_forward', winner: 'incoming' },
        );
      },
      importReport: async (outcome: 'CONFIRMED' | 'ERROR', timeZone?: string) => {
        const state = await app.sleepSchedule.getState();
        const now = new Date();
        const schedule = buildWakeAlarmSchedule(state, now)!;
        const report = createAndroidAlarmReport(
          state,
          {
            ...unavailableWakeAlarmStatus(),
            supported: true,
            state: outcome === 'ERROR' ? 'ERROR' : 'SCHEDULED',
            exactAlarmGranted: true,
            notificationsGranted: true,
            fullScreenGranted: true,
            acknowledgedSettingsVersion: schedule.settingsVersion,
            nextOccurrenceId: schedule.nextOccurrence?.id ?? null,
            nextScheduledAt: schedule.nextOccurrence?.scheduledAt ?? null,
          },
          now,
        )!;
        await new IndexedDbPilotSyncStore(database).applyPulled(
          'fixture-space',
          ++revision,
          {
            protocolVersion: 1,
            schemaVersion: 1,
            entityType: 'sleep_schedule',
            operation: 'upsert',
            objectId: 'sleep-schedule',
            eventId: `android-${revision}`,
            originDeviceId: 'android-fixture',
            keyEpoch: 1,
            baseRevision: revision - 1,
            revision,
            hlc: { wallTime: now.getTime(), logical: revision },
            record: normalizePilotRecord(
              'sleep_schedule',
              SleepScheduleRecordMapper.toRecord({
                ...state,
                ...(timeZone
                  ? {
                      settings: {
                        ...state.settings!,
                        timeZone,
                        version: state.settings!.version + 1,
                      },
                    }
                  : {}),
                androidAlarmReport: report,
              }),
            ),
          },
          'fixture-transport',
          { kind: 'fast_forward', winner: 'incoming' },
        );
      },
      savedTimeZone: async () =>
        (await app.sleepObservations.history('2026-10-09', '2026-10-09'))[0]?.timeZone ?? null,
    },
  });
  createRoot(document.getElementById('root')!).render(
    <SyncStatusProvider sync={new FixtureSync('Cloud disabled in fixture')}>
      <div className="planner-v2">
        <SleepPreparationPage
          service={app.sleepSchedule}
          observationService={app.sleepObservations}
          alarmObservations={app.sleepAlarmObservations}
          onBack={() => {}}
        />
      </div>
    </SyncStatusProvider>,
  );
}
void bootstrap().catch((reason: unknown) => {
  document.getElementById('root')!.textContent = String(reason);
});
