import type { SleepObservation } from '../../domain/sleep/SleepObservation';
import type { SleepScheduleState, WakeResult } from '../../domain/sleep/SleepSchedule';
import type { WakeAlarmStatus } from './WakeAlarmGateway';

interface AlarmSyncService {
  syncAlarm(): Promise<{
    readonly state: SleepScheduleState;
    readonly alarm: WakeAlarmStatus;
  }>;
}

interface WakeObservationReconciler {
  reconcileWakeResult(
    state: SleepScheduleState,
    result: WakeResult,
  ): Promise<SleepObservation | null>;
}

export class SleepAlarmObservationCoordinator {
  public constructor(
    private readonly alarms: AlarmSyncService,
    private readonly observations: WakeObservationReconciler,
  ) {}

  public async sync(): Promise<{
    readonly state: SleepScheduleState;
    readonly alarm: WakeAlarmStatus;
  }> {
    const synced = await this.alarms.syncAlarm();
    for (const result of synced.state.wakeResults) {
      if (result.kind !== 'NO_RESULT') {
        await this.observations.reconcileWakeResult(synced.state, result);
      }
    }
    return synced;
  }
}
