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
import type { WakeAlarmStatus } from '../../application/sleep/WakeAlarmGateway';

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
      issues: [],
      nextOccurrenceId: 'wake-1',
      nextScheduledAt: new Date('2026-09-20T22:15:00.000Z'),
      acknowledgedSettingsVersion: 1,
      lastDeliveredAt: null,
      message: null,
    });

    expect(html).toContain('Подготовка ко сну');
    expect(html).toContain('Проветрить комнату');
    expect(html).toContain('Поставить стакан воды');
    expect(html).toContain('Завершить подготовку');
    expect(html).toContain('Пропустить на сегодня');
    expect(html).toContain('Будильник Android');
    expect(html).toContain('Установлен на 07:15');
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
      issues: ['EXACT_ALARM', 'NOTIFICATIONS', 'FULL_SCREEN'],
      nextOccurrenceId: null,
      nextScheduledAt: null,
      acknowledgedSettingsVersion: null,
      lastDeliveredAt: null,
      message: 'Нужны системные разрешения.',
    });

    expect(html).toContain('Требуются разрешения Android');
    expect(html).toContain('Точные будильники');
    expect(html).toContain('Уведомления');
    expect(html).toContain('Полный экран');
    expect(html).not.toContain('Будильник подтверждён');
  });
});

function render(
  state: SleepScheduleState,
  alarmStatus: WakeAlarmStatus = {
    supported: false,
    state: 'UNAVAILABLE',
    exactAlarmGranted: false,
    notificationsGranted: false,
    fullScreenGranted: false,
    issues: [],
    nextOccurrenceId: null,
    nextScheduledAt: null,
    acknowledgedSettingsVersion: null,
    lastDeliveredAt: null,
    message: 'Постановка подтверждается только приложением LifeOS на Android.',
  },
): string {
  const callback = vi.fn();
  return renderToStaticMarkup(
    createElement(SleepPreparationView, {
      state,
      busy: false,
      error: null,
      alarmStatus,
      alarmSounds: [{ uri: null, title: 'Системный сигнал' }],
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
    }),
  );
}
