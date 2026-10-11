import type { SleepScheduleState } from '../../../domain/sleep/SleepSchedule';
import type { WakeAlarmStatus } from '../../../application/sleep/WakeAlarmGateway';
import { isCurrentAndroidAlarmReport } from '../../../application/sleep/WakeAlarmConfirmation';

export interface AndroidAlarmReportView {
  readonly tone: 'success' | 'attention' | 'error' | 'neutral';
  readonly label: string;
  readonly checkedAtLabel: string | null;
  readonly nextSignalLabel: string | null;
  readonly nextAction: string;
}

const checkOnPhone =
  'Откройте LifeOS на Android и нажмите «Проверить статус», затем дождитесь синхронизации аккаунта.';
export function androidAlarmReportView(
  state: SleepScheduleState,
  now: Date,
  localStatus?: WakeAlarmStatus,
): AndroidAlarmReportView {
  const report = state.androidAlarmReport;
  const timeZone = state.settings?.timeZone ?? 'UTC';
  const format = (at: Date) =>
    new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(at);
  const checkedAtLabel = report
    ? `Последний сохранённый ответ телефона: ${format(report.checkedAt)}`
    : null;
  const base = { checkedAtLabel, nextSignalLabel: null, nextAction: checkOnPhone };
  if (localStatus?.supported && localStatus.state === 'ERROR')
    return {
      ...base,
      tone: 'error',
      label: 'Ошибка постановки',
      nextAction:
        'На Android повторите проверку статуса. Если ошибка сохраняется, проверьте системные разрешения будильника.',
    };
  if (localStatus?.supported && localStatus.state === 'PERMISSION_REQUIRED')
    return {
      ...base,
      tone: 'attention',
      label: 'Нужны разрешения на телефоне',
      nextAction:
        'На Android разрешите точные будильники, уведомления и полный экран, затем повторите проверку статуса.',
    };
  if (!report) return { ...base, tone: 'attention', label: 'Нет подтверждения от телефона' };
  if (!isCurrentAndroidAlarmReport(state, now))
    return { ...base, tone: 'attention', label: 'Изменения ещё не подтверждены' };
  if (report.outcome === 'CONFIRMED' && report.nextScheduledAt) {
    const time = new Intl.DateTimeFormat('ru-RU', {
      timeZone,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(report.nextScheduledAt);
    return {
      ...base,
      tone: 'success',
      label: `Телефон подтвердил будильник на ${time}`,
      nextSignalLabel: `Следующий сигнал: ${format(report.nextScheduledAt)}`,
      nextAction: 'Чтобы проверить слышимость, запустите «Пробный сигнал» на Android.',
    };
  }
  if (report.outcome === 'DISABLED')
    return {
      ...base,
      tone: 'neutral',
      label: 'Телефон подтвердил отключение будильника',
      nextAction: 'Для включения будильника откройте «Обычное расписание».',
    };
  if (report.outcome === 'PERMISSION_REQUIRED')
    return {
      ...base,
      tone: 'attention',
      label: 'Нужны разрешения на телефоне',
      nextAction:
        'На Android разрешите точные будильники, уведомления и полный экран, затем повторите проверку статуса.',
    };
  if (report.outcome === 'ERROR')
    return {
      ...base,
      tone: 'error',
      label: 'Ошибка постановки',
      nextAction:
        'На Android повторите проверку статуса. Если ошибка сохраняется, проверьте системные разрешения будильника.',
    };
  return { ...base, tone: 'attention', label: 'Телефон не подтвердил постановку' };
}
