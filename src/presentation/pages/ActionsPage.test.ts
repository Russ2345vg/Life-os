import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ACTION_LIST_GROUP, type ActionListItem } from '../../application';
import { ActionSession, DayDate, EntityId } from '../../domain';
import {
  cancelLifeAction,
  completeLifeAction,
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { formatActionDuration, resolveActionListPrimaryAction } from '../actionListPresentation';
import { ActionsPageContent } from './ActionsPage';

const DATE = DayDate.create('2026-08-06');

describe('ActionsPageContent', () => {
  it('показывает пять отдельных списков и прикладные сведения карточки', () => {
    const completed = completeLifeAction(createReadyLifeAction('completed', DATE));
    const markup = renderToStaticMarkup(
      createElement(ActionsPageContent, {
        snapshot: {
          date: DATE,
          items: [
            createItem(completed, ACTION_LIST_GROUP.completed, {
              decisionTitle: 'Решение продукта',
              sessionCount: 3,
              completedSessionCount: 2,
              totalWorkedDurationMs: 95 * 60_000,
            }),
          ],
        },
        canManageSessions: true,
        busyActionId: null,
        onOpenAction: vi.fn(),
        onPrimaryAction: vi.fn(),
      }),
    );

    expect(markup).toContain('Активные');
    expect(markup).toContain('Приостановленные');
    expect(markup).toContain('Готовые');
    expect(markup).toContain('Завершённые');
    expect(markup).toContain('Отменённые');
    expect(markup).toContain('Решение продукта');
    expect(markup).toContain('3, завершено 2');
    expect(markup).toContain('1 ч 35 мин');
    expect(markup).toContain('Фактический результат');
    expect(markup).toContain('Действие выполнено');
    expect(markup).toContain('Открыть результат');
    expect(markup).toContain('aria-expanded="false"');
    expect(markup).toContain('aria-expanded="true"');
  });

  it('объясняет пустой результат фильтра отдельно от действительно пустого дня', () => {
    const markup = renderToStaticMarkup(
      createElement(ActionsPageContent, {
        snapshot: { date: DATE, items: [] },
        totalItemCount: 3,
        activeFilterCount: 2,
        canManageSessions: true,
        busyActionId: null,
        onOpenAction: vi.fn(),
        onPrimaryAction: vi.fn(),
      }),
    );

    expect(markup).toContain('По выбранным фильтрам действий нет');
  });

  it('сворачивает пустые группы и оставляет непустую группу раскрытой', () => {
    const ready = createReadyLifeAction('ready', DATE);
    const markup = renderToStaticMarkup(
      createElement(ActionsPageContent, {
        snapshot: {
          date: DATE,
          items: [createItem(ready, ACTION_LIST_GROUP.ready)],
        },
        canManageSessions: true,
        busyActionId: null,
        onOpenAction: vi.fn(),
        onPrimaryAction: vi.fn(),
      }),
    );

    expect(markup).toContain('action-state-list-active is-collapsed');
    expect(markup).toContain('action-state-list-paused is-collapsed');
    expect(markup).toContain('action-state-list-ready is-expanded');
    expect(markup).toContain('action-state-list-completed is-collapsed');
    expect(markup).toContain('action-state-list-cancelled is-collapsed');
    expect(markup).not.toContain('Активных действий нет');
    expect(markup).toContain('Можно начать');
  });

  it('делает верхние счётчики кнопками навигации к группам', () => {
    const ready = createReadyLifeAction('ready', DATE);
    const markup = renderToStaticMarkup(
      createElement(ActionsPageContent, {
        snapshot: {
          date: DATE,
          items: [createItem(ready, ACTION_LIST_GROUP.ready)],
        },
        canManageSessions: true,
        busyActionId: null,
        onOpenAction: vi.fn(),
        onPrimaryAction: vi.fn(),
      }),
    );

    expect(markup).toContain('action-summary-button');
    expect(markup).toContain('aria-controls="action-state-list-content-ready"');
    expect(markup).toContain('id="action-state-list-ready"');
  });
});

describe('resolveActionListPrimaryAction', () => {
  it('назначает одну главную команду для каждого состояния', () => {
    const ready = createReadyLifeAction('ready', DATE);
    const active = markLifeActionInProgress(createReadyLifeAction('active', DATE));
    const runningSession = createRunningSession(active.id, 'running');
    const paused = markLifeActionInProgress(createReadyLifeAction('paused', DATE));
    const pausedSession = createRunningSession(paused.id, 'paused');
    pausedSession.pause(at('10:30'), EntityId.create('paused-event'));
    const completed = completeLifeAction(createReadyLifeAction('completed', DATE));
    const cancelled = cancelLifeAction(createReadyLifeAction('cancelled', DATE));

    expect(
      resolveActionListPrimaryAction(createItem(ready, ACTION_LIST_GROUP.ready), true),
    ).toEqual({ command: 'start', label: 'Начать сессию' });
    expect(
      resolveActionListPrimaryAction(
        createItem(active, ACTION_LIST_GROUP.active, { unfinishedSession: runningSession }),
        true,
      ),
    ).toEqual({ command: 'open', label: 'Открыть сессию' });
    expect(
      resolveActionListPrimaryAction(createItem(active, ACTION_LIST_GROUP.active), true),
    ).toEqual({ command: 'start', label: 'Начать новую сессию' });
    expect(
      resolveActionListPrimaryAction(
        createItem(paused, ACTION_LIST_GROUP.paused, { unfinishedSession: pausedSession }),
        true,
      ),
    ).toEqual({ command: 'resume', label: 'Продолжить' });
    expect(
      resolveActionListPrimaryAction(createItem(completed, ACTION_LIST_GROUP.completed), true),
    ).toEqual({ command: 'open', label: 'Открыть результат' });
    expect(
      resolveActionListPrimaryAction(createItem(cancelled, ACTION_LIST_GROUP.cancelled), true),
    ).toEqual({ command: 'open', label: 'Открыть историю' });
  });

  it('на другой дате заменяет команды сессии безопасным открытием карточки', () => {
    const ready = createReadyLifeAction('future', DATE);

    expect(
      resolveActionListPrimaryAction(createItem(ready, ACTION_LIST_GROUP.ready), false),
    ).toEqual({ command: 'open', label: 'Открыть карточку' });
  });
});

describe('formatActionDuration', () => {
  it('показывает минуты и часы без секунд', () => {
    expect(formatActionDuration(0)).toBe('0 мин');
    expect(formatActionDuration(59 * 60_000)).toBe('59 мин');
    expect(formatActionDuration(60 * 60_000)).toBe('1 ч');
    expect(formatActionDuration(125 * 60_000)).toBe('2 ч 5 мин');
  });
});

interface ItemOptions {
  readonly decisionTitle?: string;
  readonly sessionCount?: number;
  readonly completedSessionCount?: number;
  readonly totalWorkedDurationMs?: number;
  readonly unfinishedSession?: ActionSession;
}

function createItem(
  lifeAction: ReturnType<typeof createReadyLifeAction>,
  group: ActionListItem['group'],
  options: ItemOptions = {},
): ActionListItem {
  const sessions = Array.from({ length: options.sessionCount ?? 0 }, (_, index) =>
    createRunningSession(lifeAction.id, `session-${index}`),
  );

  return {
    lifeAction,
    decisionTitle: options.decisionTitle ?? null,
    sphereId: null,
    sessions,
    unfinishedSession: options.unfinishedSession ?? null,
    group,
    completedSessionCount: options.completedSessionCount ?? 0,
    totalWorkedDurationMs: options.totalWorkedDurationMs ?? 0,
  };
}

function createRunningSession(lifeActionId: EntityId, id: string): ActionSession {
  return ActionSession.start({
    id: EntityId.create(id),
    lifeActionId,
    startedAt: at('10:00'),
    eventId: EntityId.create(`${id}-event`),
  });
}

function at(time: string): Date {
  return new Date(`2026-08-06T${time}:00.000+09:00`);
}
