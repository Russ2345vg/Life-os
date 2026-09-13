import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { DayDate, DECISION_KIND } from '../../domain';
import { ACTION_LIST_GROUP, type ActionListItem } from '../../application';
import {
  cancelDecision,
  confirmDecision,
  createPlannedDecision,
} from '../../test/helpers/DecisionTestFactory';
import {
  cancelLifeAction,
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { APP_SECTION } from '../navigation/AppSection';
import { ACTION_FILTER, filterLifeActions } from '../actionFilters';
import { DECISION_FILTER, filterDecisions } from '../decisionFilters';
import { ActionsPageContent } from './ActionsPage';
import { DecisionsPageContent } from './DecisionsPage';
import { HistoryPageContent } from './HistoryPage';
import { LocalSettingsPage, MorePage } from './MorePage';
import { DEFAULT_LOCAL_SETTINGS } from '../settings/localSettings';
import type { SyncApplication } from '../../application/sync/SyncApplicationService';

const DATE = DayDate.create('2026-08-04');

function createActionListItem(
  lifeAction: ReturnType<typeof createReadyLifeAction>,
  group: ActionListItem['group'],
): ActionListItem {
  return {
    lifeAction,
    decisionTitle: null,
    sphereId: null,
    sessions: [],
    unfinishedSession: null,
    group,
    completedSessionCount: 0,
    totalWorkedDurationMs: 0,
  };
}

function render(element: React.ReactElement) {
  return renderToStaticMarkup(element);
}

function createSyncApplicationStub(): SyncApplication {
  return {
    loadOverview: vi.fn(),
    setupFirstSpace: vi.fn(),
    confirmRecoverySaved: vi.fn(),
    exportRecoveryMaterial: vi.fn(),
    createPairingInvitation: vi.fn(),
    cancelPairingInvitation: vi.fn(),
    fulfillPendingPairings: vi.fn(),
    claimPairingPayload: vi.fn(),
    completePendingPairing: vi.fn(),
    recover: vi.fn(),
    revokeDevice: vi.fn(),
    retryPendingRotation: vi.fn(),
    updateDeviceName: vi.fn(),
    pilotStatus: vi.fn(() => ({
      state: 'idle' as const,
      pendingCount: 0,
      conflictCount: 0,
      lastSuccessfulSyncAt: null,
    })),
    subscribePilotStatus: vi.fn(() => vi.fn()),
    syncPilotNow: vi.fn(),
    notifyPilotMutation: vi.fn(),
    close: vi.fn(),
  };
}

describe('section overview pages', () => {
  it('показывает итоги и карточки решений', () => {
    const main = createPlannedDecision('главное', DATE, DECISION_KIND.main, 1);
    const additional = createPlannedDecision('дополнительное', DATE, DECISION_KIND.additional);
    const confirmed = confirmDecision(
      createPlannedDecision('подтверждено', DATE, DECISION_KIND.main, 2),
    );
    const markup = render(
      createElement(DecisionsPageContent, {
        decisions: [main, additional, confirmed],
        filter: DECISION_FILTER.all,
        onFilterChange: vi.fn(),
        onOpenDecision: vi.fn(),
      }),
    );

    expect(markup).toContain('Главные');
    expect(markup).toContain('Дополнительные');
    expect(markup).toContain('Подтверждено');
    expect(markup).toContain('Решение главное');
    expect(markup).toContain('Позиция 1');
    expect(markup).toContain('Решение дополнительное');
  });

  it('делает карточки решений кнопками и показывает фильтры состояний', () => {
    const decision = createPlannedDecision('открываемое решение', DATE);
    const markup = render(
      createElement(DecisionsPageContent, {
        decisions: [decision],
        filter: DECISION_FILTER.all,
        onFilterChange: vi.fn(),
        onOpenDecision: vi.fn(),
      }),
    );

    expect(markup).toContain('aria-label="Открыть решение');
    expect(markup).toContain('decision-overview-card');
    expect(markup).toContain('Состояние решений');
    expect(markup).toContain('Открыть →');
    expect(markup).toContain('В корзину');
  });

  it('фильтрует решения без изменения исходного списка', () => {
    const planned = createPlannedDecision('запланировано', DATE);
    const confirmed = confirmDecision(createPlannedDecision('подтверждено', DATE));
    const cancelled = cancelDecision(createPlannedDecision('отменено', DATE));
    const decisions = [planned, confirmed, cancelled] as const;

    expect(filterDecisions(decisions, DECISION_FILTER.all)).toEqual(decisions);
    expect(filterDecisions(decisions, DECISION_FILTER.planned)).toEqual([planned]);
    expect(filterDecisions(decisions, DECISION_FILTER.confirmed)).toEqual([confirmed]);
    expect(filterDecisions(decisions, DECISION_FILTER.cancelled)).toEqual([cancelled]);
    expect(decisions).toHaveLength(3);
  });

  it('показывает итоги и статусы действий', () => {
    const ready = createReadyLifeAction('готово', DATE);
    const active = markLifeActionInProgress(createReadyLifeAction('активно', DATE));
    const completed = completeLifeAction(createReadyLifeAction('завершено', DATE));
    const markup = render(
      createElement(ActionsPageContent, {
        snapshot: {
          date: DATE,
          items: [
            createActionListItem(active, ACTION_LIST_GROUP.active),
            createActionListItem(ready, ACTION_LIST_GROUP.ready),
            createActionListItem(completed, ACTION_LIST_GROUP.completed),
          ],
        },
        canManageSessions: true,
        busyActionId: null,
        onOpenAction: vi.fn(),
        onPrimaryAction: vi.fn(),
      }),
    );

    expect(markup).toContain('В работе');
    expect(markup).toContain('Готовые');
    expect(markup).toContain('Завершённые');
    expect(markup).toContain('Действие активно');
    expect(markup).toContain('Начать новую сессию');
    expect(markup).toContain('Действие завершено');
  });

  it('показывает одну главную команду и отдельное открытие карточки действия', () => {
    const ready = createReadyLifeAction('открываемое', DATE);
    const markup = render(
      createElement(ActionsPageContent, {
        snapshot: { date: DATE, items: [createActionListItem(ready, ACTION_LIST_GROUP.ready)] },
        canManageSessions: true,
        busyActionId: null,
        onOpenAction: vi.fn(),
        onPrimaryAction: vi.fn(),
      }),
    );

    expect(markup).toContain('Начать сессию');
    expect(markup).toContain('Открыть карточку');
    expect(markup).toContain('Состояние действий');
    expect(markup).toContain('action-state-list-active is-collapsed');
    expect(markup).not.toContain('Активных действий нет');
    expect(markup).not.toContain('aria-pressed');
  });

  it('фильтрует действия без изменения исходного списка', () => {
    const ready = createReadyLifeAction('готовое', DATE);
    const active = markLifeActionInProgress(createReadyLifeAction('активное', DATE));
    const completed = completeLifeAction(createReadyLifeAction('готовое 2', DATE));
    const actions = [ready, active, completed] as const;

    expect(filterLifeActions(actions, ACTION_FILTER.all)).toEqual(actions);
    expect(filterLifeActions(actions, ACTION_FILTER.ready)).toEqual([ready]);
    expect(filterLifeActions(actions, ACTION_FILTER.inProgress)).toEqual([active]);
    expect(filterLifeActions(actions, ACTION_FILTER.completed)).toEqual([completed]);
    expect(actions).toHaveLength(3);
  });

  it('история скрывает незавершённые объекты и показывает финальные', () => {
    const planned = createPlannedDecision('запланировано', DATE);
    const confirmed = confirmDecision(createPlannedDecision('готовый итог', DATE));
    const cancelledDecision = cancelDecision(createPlannedDecision('отменённое', DATE));
    const readyAction = createReadyLifeAction('готовое действие', DATE);
    const completedAction = completeLifeAction(createReadyLifeAction('готовое действие 2', DATE));
    const cancelledAction = cancelLifeAction(createReadyLifeAction('отменённое действие', DATE));
    const markup = render(
      createElement(HistoryPageContent, {
        data: {
          startDate: DATE,
          endDate: DATE,
          decisions: [planned, confirmed, cancelledDecision],
          lifeActions: [readyAction, completedAction, cancelledAction],
          actionSessions: [],
        },
      }),
    );

    expect(markup).not.toContain('Решение запланировано');
    expect(markup).not.toContain('Действие готовое действие</h3>');
    expect(markup).toContain('Решение готовый итог');
    expect(markup).toContain('Решение отменённое');
    expect(markup).toContain('Действие готовое действие 2');
    expect(markup).toContain('Действие отменённое действие');
  });

  it('раздел «Ещё» не дублирует управление и честно показывает дополнительные разделы', () => {
    const onOpenSection = vi.fn();
    const markup = render(
      createElement(MorePage, {
        settings: DEFAULT_LOCAL_SETTINGS,
        settingsStorageAvailable: true,
        settingsRecoveredFromInvalidValue: false,
        onOpenSection,
        onSaveSettings: vi.fn(() => true),
        onResetSettings: vi.fn(() => true),
        systemUpdate: {
          state: { status: 'idle', currentVersion: '1.0.2' },
          check: vi.fn(),
          install: vi.fn(),
        },
        sync: createSyncApplicationStub(),
      }),
    );

    expect(markup).toContain('Распорядок');
    expect(markup).toContain('Прогулки');
    expect(markup).toContain('Вечерняя аналитика');
    expect(markup).toContain('Сферы');
    expect(markup).toContain('Настройки');
    expect(markup).not.toContain('Обзор главных и дополнительных решений');
    expect(markup).toContain('Стартовый раздел');
    expect(markup).toContain('Открыть');
    expect(markup).toContain('Локальный режим активен');
  });

  it('страница настроек показывает безопасные локальные параметры и защиту данных', () => {
    const markup = render(
      createElement(LocalSettingsPage, {
        settings: DEFAULT_LOCAL_SETTINGS,
        settingsStorageAvailable: true,
        settingsRecoveredFromInvalidValue: false,
        onOpenSection: vi.fn(),
        onSaveSettings: vi.fn(() => true),
        onResetSettings: vi.fn(() => true),
        onBack: vi.fn(),
        systemUpdate: {
          state: { status: 'idle', currentVersion: '1.0.2' },
          check: vi.fn(),
          install: vi.fn(),
        },
        sync: createSyncApplicationStub(),
      }),
    );

    expect(markup).toContain('Рабочая среда');
    expect(markup).toContain('Стартовый раздел');
    expect(markup).toContain('Плотность интерфейса');
    expect(markup).toContain('Уменьшить движение');
    expect(markup).toContain('Показывать день недели на телефоне');
    expect(markup).toContain('Вечерний ритуал');
    expect(markup).toContain('Базовое время сна');
    expect(markup).toContain('Практика расслабления по умолчанию');
    expect(markup).toContain('Без экранов по умолчанию');
    expect(markup).toContain('Адаптивное расслабление');
    expect(markup).toContain('Одно вечернее напоминание');
    expect(markup).toContain('Разрешить осознанный пропуск');
    expect(markup).toContain('Обязательные пункты: 4 из 6');
    expect(markup).toContain('Рекомендуемая длительность');
    expect(markup).toContain('Переместить выше');
    expect(markup).toContain('min="20" max="30"');
    expect(markup).toContain('Сохранить настройки');
    expect(markup).toContain('Сбросить настройки');
    expect(markup).toContain('Предметные записи не изменяются');
    expect(markup).toContain('<option value="management">Управление</option>');
    expect(markup).not.toContain('<option value="decisions">Решения</option>');
    expect(markup).not.toContain('<option value="actions">Действия</option>');
  });

  it('пустые обзоры показывают понятные сообщения', () => {
    const decisionsMarkup = render(
      createElement(DecisionsPageContent, {
        decisions: [],
        filter: DECISION_FILTER.all,
        onFilterChange: vi.fn(),
        onOpenDecision: vi.fn(),
      }),
    );
    const actionsMarkup = render(
      createElement(ActionsPageContent, {
        snapshot: { date: DATE, items: [] },
        canManageSessions: true,
        busyActionId: null,
        onOpenAction: vi.fn(),
        onPrimaryAction: vi.fn(),
      }),
    );
    const historyMarkup = render(
      createElement(HistoryPageContent, {
        data: {
          startDate: DATE,
          endDate: DATE,
          decisions: [],
          lifeActions: [],
          actionSessions: [],
        },
      }),
    );

    expect(decisionsMarkup).toContain('На выбранный день решений пока нет');
    expect(actionsMarkup).toContain('На выбранный день действий пока нет');
    expect(historyMarkup).toContain('В выбранном диапазоне завершённой истории пока нет');
  });

  it('перенаправляет устаревший стартовый вход действий в Управление', () => {
    const markup = render(
      createElement(LocalSettingsPage, {
        settings: { ...DEFAULT_LOCAL_SETTINGS, defaultSection: APP_SECTION.actions },
        settingsStorageAvailable: true,
        settingsRecoveredFromInvalidValue: false,
        onOpenSection: vi.fn(),
        onSaveSettings: vi.fn(() => true),
        onResetSettings: vi.fn(() => true),
        onBack: vi.fn(),
        systemUpdate: {
          state: { status: 'idle', currentVersion: '1.0.2' },
          check: vi.fn(),
          install: vi.fn(),
        },
        sync: createSyncApplicationStub(),
      }),
    );

    expect(markup).toContain('<option value="management" selected="">Управление</option>');
  });
});
