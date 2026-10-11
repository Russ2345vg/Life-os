import { describe, expect, it } from 'vitest';
import {
  createEmptySleepSchedule,
  rebuildWakeSchedule,
  updateSleepSettings,
} from '../../../domain/sleep/SleepSchedule';
import { createAndroidAlarmReport } from '../../../application/sleep/WakeAlarmConfirmation';
import { unavailableWakeAlarmStatus } from '../../../application/sleep/WakeAlarmGateway';
import { androidAlarmReportView } from './androidAlarmReportModel';

const now = new Date('2026-10-10T12:00:00Z');
function fixture() {
  const state = rebuildWakeSchedule(
    updateSleepSettings(
      createEmptySleepSchedule(),
      { bedtime: '22:30', wakeTime: '07:15', timeZone: 'Asia/Chita', enabled: true },
      now,
    ),
    { cycleDates: ['2026-10-10'], now, nextId: () => 'wake-1' },
  );
  const status = {
    ...unavailableWakeAlarmStatus(),
    supported: true,
    state: 'SCHEDULED' as const,
    exactAlarmGranted: true,
    notificationsGranted: true,
    fullScreenGranted: true,
    acknowledgedSettingsVersion: 1,
    nextOccurrenceId: 'wake-1',
    nextScheduledAt: new Date('2026-10-10T22:15:00Z'),
  };
  return { state, status, report: createAndroidAlarmReport(state, status, now)! };
}
describe('cross-device alarm status copy', () => {
  it('shows actual confirmation, next date and check time in the schedule timezone', () => {
    const { state, report } = fixture();
    const view = androidAlarmReportView({ ...state, androidAlarmReport: report }, now);
    expect(view.tone).toBe('success');
    expect(view.label).toBe('Телефон подтвердил будильник на 07:15');
    expect(view.checkedAtLabel).toContain('21:00');
    expect(view.nextSignalLabel).toContain('11 октября');
    expect(view.nextAction).toContain('Пробный сигнал');
  });
  it('keeps old check time but never presents stale evidence as current success', () => {
    const { state, report } = fixture();
    const changed = {
      ...state,
      settings: { ...state.settings!, version: 2 },
      androidAlarmReport: report,
    };
    expect(androidAlarmReportView(changed, now)).toMatchObject({
      tone: 'attention',
      label: 'Изменения ещё не подтверждены',
    });
    expect(
      androidAlarmReportView(
        { ...state, androidAlarmReport: report },
        new Date('2026-10-11T12:00:00Z'),
      ).tone,
    ).not.toBe('success');
  });
  it.each([
    ['PERMISSION_REQUIRED', 'Нужны разрешения на телефоне', 'attention'],
    ['ERROR', 'Ошибка постановки', 'error'],
    ['NOT_CONFIRMED', 'Телефон не подтвердил постановку', 'attention'],
  ] as const)('gives a next action for actual %s', (outcome, label, tone) => {
    const { state, report } = fixture();
    const view = androidAlarmReportView(
      { ...state, androidAlarmReport: { ...report, outcome } },
      now,
    );
    expect(view).toMatchObject({ label, tone });
    expect(view.nextAction).toContain('Android');
    expect(view.checkedAtLabel).toContain('21:00');
  });
  it('does not mistake an unsupported device or missing report for a confirmation', () => {
    expect(androidAlarmReportView(fixture().state, now)).toMatchObject({
      label: 'Нет подтверждения от телефона',
      checkedAtLabel: null,
    });
    expect(androidAlarmReportView(fixture().state, now).nextAction).toContain(
      'дождитесь синхронизации',
    );
  });
  it('shows acknowledged disabling separately', () => {
    const { state, status } = fixture();
    const disabled = { ...state, settings: { ...state.settings!, enabled: false } };
    const report = createAndroidAlarmReport(
      disabled,
      { ...status, state: 'READY', nextOccurrenceId: null, nextScheduledAt: null },
      now,
    )!;
    expect(androidAlarmReportView({ ...disabled, androidAlarmReport: report }, now)).toMatchObject({
      label: 'Телефон подтвердил отключение будильника',
      tone: 'neutral',
    });
  });
  it('a fresh local failure cannot be hidden by an older saved success', () => {
    const { state, status, report } = fixture();
    expect(
      androidAlarmReportView({ ...state, androidAlarmReport: report }, now, {
        ...status,
        state: 'ERROR',
      }),
    ).toMatchObject({ label: 'Ошибка постановки', tone: 'error' });
  });
});
