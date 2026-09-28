import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  createEmptySleepSchedule,
  ensureNightCycle,
  updateSleepSettings,
  type SleepScheduleState,
} from '../../domain/sleep/SleepSchedule';
import { SleepPreparationView } from './SleepPreparationPage';
import type { WakeAlarmStatus, WakeDismissalSetup } from '../../application/sleep/WakeAlarmGateway';

describe('SleepPreparationView', () => {
  it('asks for user-entered times without pre-filling values from the mock', () => {
    const html = render(createEmptySleepSchedule());

    expect(html).toContain('Настройте своё время');
    expect(html).toContain('name="bedtime" value=""');
    expect(html).toContain('name="wakeTime" value=""');
    expect(html).not.toContain('22:00');
    expect(html).not.toContain('07:00');
  });

  it('renders the grouped current-night checklist, settings and honest Android status', () => {
    const configured = updateSleepSettings(
      createEmptySleepSchedule(),
      { bedtime: '22:30', wakeTime: '07:15', timeZone: 'Asia/Chita', enabled: true },
      new Date('2026-09-20T12:00:00.000Z'),
    );
    const opened = ensureNightCycle(configured, {
      cycleDate: '2026-09-20',
      cycleId: 'night-1',
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
    }).state;

    const html = render(opened, {
      supported: true,
      state: 'SCHEDULED',
      exactAlarmGranted: true,
      notificationsGranted: true,
      fullScreenGranted: true,
      notificationPolicyAccessGranted: true,
      issues: [],
      nextOccurrenceId: 'wake-1',
      nextScheduledAt: new Date('2026-09-20T22:15:00.000Z'),
      acknowledgedSettingsVersion: 1,
      lastDeliveredAt: null,
      quietModeState: 'READY',
      nextReminderAt: new Date('2026-09-20T12:30:00.000Z'),
      sleepEvents: [],
      wakeResults: [],
      message: null,
    });

    expect(html).toContain('Подготовка ко сну');
    expect(html).toContain('Проветрить комнату');
    expect(html).toContain('Поставить стакан воды');
    expect(html).toContain('Завершить подготовку');
    expect(html).toContain('Пропустить на сегодня');
    expect(html).toContain('Будильник Android');
    expect(html).toContain('Ожидает постановки на 07:15');
    expect(html.match(/aria-label="Управление подъёмом"/g)).toHaveLength(1);
    expect(html).toContain('Пробный сигнал');
    expect(html).toContain('Пропустить ближайший');
    expect(html).toContain('Повторяемый список');
    expect(html).toContain('Базовый пункт');
  });

  it('shows every missing Android capability without claiming that the alarm is ready', () => {
    const configured = updateSleepSettings(
      createEmptySleepSchedule(),
      { bedtime: '22:30', wakeTime: '07:15', timeZone: 'Asia/Chita', enabled: true },
      new Date('2026-09-20T12:00:00.000Z'),
    );
    const html = render(configured, {
      supported: true,
      state: 'PERMISSION_REQUIRED',
      exactAlarmGranted: false,
      notificationsGranted: false,
      fullScreenGranted: false,
      notificationPolicyAccessGranted: false,
      issues: ['EXACT_ALARM', 'NOTIFICATIONS', 'FULL_SCREEN', 'DND_POLICY'],
      nextOccurrenceId: null,
      nextScheduledAt: null,
      acknowledgedSettingsVersion: null,
      lastDeliveredAt: null,
      quietModeState: 'READY',
      nextReminderAt: null,
      sleepEvents: [],
      wakeResults: [],
      message: 'Нужны системные разрешения.',
    });

    expect(html).toContain('Требуются разрешения Android');
    expect(html).toContain('Точные будильники');
    expect(html).toContain('Уведомления');
    expect(html).toContain('Полный экран');
    expect(html).toContain('Доступ к режиму «Не беспокоить»');
    expect(html).not.toContain('Будильник подтверждён');
  });

  it('shows the Android QR and emergency phrase setup outside the ringing screen', () => {
    const configured = updateSleepSettings(
      createEmptySleepSchedule(),
      { bedtime: '22:30', wakeTime: '07:15', timeZone: 'Asia/Chita', enabled: true },
      new Date('2026-09-20T12:00:00.000Z'),
    );
    const html = render(configured, undefined, {
      supported: true,
      qrConfigured: false,
      emergencyPhraseConfigured: false,
      qrSavedTo: null,
      lastWaterCompletedAt: null,
    });

    expect(html).toContain('Защита выключения будильника');
    expect(html).toContain('QR для подъёма');
    expect(html).toContain('Создать и сохранить');
    expect(html).toContain('Аварийная фраза');
    expect(html).toContain('Не менее 16 символов');
  });

  it('renders the separate quiet-mode control and an honest empty history', () => {
    const configured = updateSleepSettings(
      createEmptySleepSchedule(),
      {
        bedtime: '22:30',
        wakeTime: '07:15',
        timeZone: 'Asia/Chita',
        enabled: true,
        quietModeEnabled: true,
      },
      new Date('2026-09-20T12:00:00.000Z'),
    );
    const opened = ensureNightCycle(configured, {
      cycleDate: '2026-09-20',
      cycleId: 'night-1',
      createdAt: new Date('2026-09-20T12:00:00.000Z'),
    }).state;

    const html = render(opened);

    expect(html).toContain('role="switch"');
    expect(html).toContain('aria-checked="true"');
    expect(html).toContain('За 60 минут до сна');
    expect(html).toContain('История сна');
    expect(html).toContain('Нет отметок');
    expect(html).toContain('нет данных');
    expect(html).not.toContain('качество сна');
    expect(html).not.toContain('часов сна');
  });
});

function render(
  state: SleepScheduleState,
  alarmStatus: WakeAlarmStatus | undefined = undefined,
  dismissalSetup: WakeDismissalSetup = {
    supported: false,
    qrConfigured: false,
    emergencyPhraseConfigured: false,
    qrSavedTo: null,
    lastWaterCompletedAt: null,
  },
): string {
  const resolvedAlarmStatus: WakeAlarmStatus = alarmStatus ?? {
    supported: false,
    state: 'UNAVAILABLE',
    exactAlarmGranted: false,
    notificationsGranted: false,
    fullScreenGranted: false,
    notificationPolicyAccessGranted: false,
    issues: [],
    nextOccurrenceId: null,
    nextScheduledAt: null,
    acknowledgedSettingsVersion: null,
    lastDeliveredAt: null,
    quietModeState: 'UNAVAILABLE',
    nextReminderAt: null,
    sleepEvents: [],
    wakeResults: [],
    message: 'Постановка подтверждается только приложением LifeOS на Android.',
  };
  const callback = vi.fn();
  return renderToStaticMarkup(
    createElement(SleepPreparationView, {
      state,
      busy: false,
      error: null,
      alarmStatus: resolvedAlarmStatus,
      alarmSounds: [{ uri: null, title: 'Системный сигнал' }],
      dismissalSetup,
      onBack: callback,
      onSaveSettings: callback,
      onComplete: callback,
      onFinish: callback,
      onAddGroup: callback,
      onRenameGroup: callback,
      onMoveGroup: callback,
      onDeleteGroup: callback,
      onAddItem: callback,
      onRenameItem: callback,
      onEnableItem: callback,
      onDeleteItem: callback,
      onMoveItem: callback,
      onScheduleTestAlarm: callback,
      onOpenAlarmSettings: callback,
      onSkipNearestAlarm: callback,
      onRegenerateDismissalQr: callback,
      onSaveEmergencyPhrase: callback,
      onToggleQuietMode: callback,
    }),
  );
}
