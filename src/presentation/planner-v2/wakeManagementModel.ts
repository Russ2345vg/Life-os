import type { SleepScheduleState } from '../../domain/sleep/SleepSchedule';
import type { WakeAlarmStatus } from '../../application/sleep/WakeAlarmGateway';
export { isWakeScheduleAcknowledged } from '../../application/sleep/WakeAlarmConfirmation';

export function futureWakeOccurrences(state: SleepScheduleState, now: Date) {
  return state.wakeOccurrences
    .filter(
      ({ status, scheduledAt }) => status === 'SCHEDULED' && scheduledAt.getTime() > now.getTime(),
    )
    .sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

export function wakeProbeLabel(status: WakeAlarmStatus, now: Date): string {
  if (!status.supported) return 'Проверка доступна в приложении на Android';
  const test = status.testEvidence;
  if (test == null) return 'Звук на этом телефоне ещё не проверен';
  if (!test.valid) return 'Настройки изменились — повторите тест';
  if (test.deliveredAt && test.confirmedAt) return 'Вы подтвердили звук на этом телефоне';
  if (test.deliveredAt) return 'Доставлен — слышимость не подтверждена';
  if (test.scheduledAt.getTime() > now.getTime()) return 'Тест назначен — заблокируйте экран';
  return 'Доставка теста не подтверждена — повторите проверку';
}

export function wakeTimeLabel(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(at);
}

export function wakeDateLabel(at: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(at);
}
