import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { EveningReviewSnapshot, OpenLoopItem } from '../../application';
import {
  ActionSession,
  Day,
  DayDate,
  EntityId,
  EveningCycle,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_REQUIREMENT,
  OPEN_LOOP_RESOLUTION,
} from '../../domain';
import { EveningResolvingScene } from './EveningResolvingScene';

const TODAY = DayDate.create('2026-08-21');
const TOMORROW = DayDate.create('2026-08-22');
const NOW = new Date('2026-08-21T20:00:00.000+09:00');

describe('EveningResolvingScene visual composition', () => {
  it('строит Today hero, один dominant object, иерархию действий и сегменты из read model', () => {
    const snapshot = createSnapshot({
      total: 3,
      resolved: 2,
      items: [openLoop('focus-action', 'Завершить вечерний интерфейс')],
    });

    const markup = renderScene(snapshot, {
      'LIFE_ACTION:focus-action': 'Рабочий результат сохранён',
    });

    expect(markup).toContain('class="evening-today-hero"');
    expect(markup).toContain('data-icon="sun"');
    expect(markup).toContain('<h3 id="today-title">Сегодня</h3>');
    expect(markup).toContain('Закройте всё, что мешает завершить день');
    expect(markup).toContain('evening-today-object-card');
    expect(markup).toContain('data-icon="target"');
    expect(markup).toContain('Завершить вечерний интерфейс');
    expect(markup).toContain('aria-label="Метаданные элемента"');
    expect(markup).toContain('value="Рабочий результат сохранён"');
    expect(markup).toContain('required=""');

    expect(markup).toContain('class="evening-resolving-primary-actions"');
    expect(markup).toContain('class="evening-resolving-secondary-actions"');
    expect(markup).toContain('data-icon="check"');
    expect(markup).toContain('data-icon="carry"');
    expect(markup).toContain('data-icon="pencil"');
    expect(markup).toContain('data-icon="ban"');
    expect(markup).toContain('Завершить');
    expect(markup).toContain('Перенести');
    expect(markup).toContain('Изменить');
    expect(markup).toContain('Отказаться');

    expect(markup).toContain('data-progress="2/3"');
    expect(markup).toContain('role="progressbar"');
    expect(markup).toContain('aria-valuenow="2"');
    expect(markup).toContain('aria-valuemax="3"');
    expect(markup.match(/class="is-resolved"/g)).toHaveLength(2);
    expect(markup.match(/class="is-pending"/g)).toHaveLength(1);
  });

  it('сохраняет единый Today frame для active-session и empty состояний', () => {
    const session = ActionSession.start({
      id: EntityId.create('active-session'),
      lifeActionId: EntityId.create('active-action'),
      startedAt: new Date('2026-08-21T19:00:00.000+09:00'),
      eventId: EntityId.create('active-session-started'),
    });
    const activeItem: OpenLoopItem = {
      entityType: OPEN_LOOP_ENTITY_TYPE.actionSession,
      entityId: session.id.toString(),
      title: 'Рабочая сессия',
      requirement: OPEN_LOOP_REQUIREMENT.requiresResolution,
      status: session.status,
      resolution: null,
      resolvedAt: null,
      allowedResolutions: Object.values(OPEN_LOOP_RESOLUTION),
    };
    const activeMarkup = renderScene(
      createSnapshot({ total: 1, resolved: 0, items: [activeItem], unfinishedSession: session }),
    );
    const emptyMarkup = renderScene(createSnapshot({ total: 0, resolved: 0, items: [] }));

    expect(activeMarkup).toContain('evening-today-scene');
    expect(activeMarkup).toContain('class="evening-today-hero"');
    expect(activeMarkup).toContain('evening-today-object-card is-active-session');
    expect(activeMarkup).toContain('data-icon="clock"');
    expect(activeMarkup).toContain('Завершить сессию');
    expect(activeMarkup).toContain('data-icon="arrow-right"');
    expect(activeMarkup).toContain('data-progress="0/1"');

    expect(emptyMarkup).toContain('evening-today-scene is-empty');
    expect(emptyMarkup).toContain('class="evening-today-hero"');
    expect(emptyMarkup).toContain('evening-today-object-card is-empty');
    expect(emptyMarkup).toContain('data-icon="check"');
    expect(emptyMarkup).toContain('Ничего важного не осталось без решения.');
    expect(emptyMarkup).toContain('Продолжить');
    expect(emptyMarkup).toContain('data-progress="0/0"');
  });
});

function renderScene(
  snapshot: EveningReviewSnapshot,
  notes: Readonly<Record<string, string>> = {},
): string {
  return renderToStaticMarkup(
    createElement(EveningResolvingScene, {
      snapshot,
      notes,
      disabled: false,
      now: NOW,
      error: null,
      feedback: null,
      pendingResolution: null,
      preferredKey: null,
      onNoteChange: vi.fn(),
      onResolve: vi.fn(),
      onReturnToWork: vi.fn(),
      onContinue: vi.fn(),
      onResolveOpenAction: vi.fn(),
      onRetry: vi.fn(),
    }),
  );
}

function createSnapshot({
  total,
  resolved,
  items,
  unfinishedSession = null,
}: {
  readonly total: number;
  readonly resolved: number;
  readonly items: readonly OpenLoopItem[];
  readonly unfinishedSession?: ActionSession | null;
}): EveningReviewSnapshot {
  const dayId = EntityId.create('today-visual-day');
  const cycle = EveningCycle.create({
    id: EntityId.create('today-visual-cycle'),
    dayId,
    dateKey: TODAY,
    occurredAt: NOW,
  });
  cycle.start(NOW);
  cycle.beginResolving(NOW);
  const day = Day.openCurrent({
    id: dayId,
    currentDate: TODAY,
    occurredAt: NOW,
    createdEventId: EntityId.create('today-visual-day-created'),
    openedEventId: EntityId.create('today-visual-day-opened'),
  });

  return {
    cycle,
    day,
    currentDate: TODAY,
    tomorrowDate: TOMORROW,
    isRecoveryReview: false,
    decisions: [],
    lifeActions: [],
    actionSessions: unfinishedSession === null ? [] : [unfinishedSession],
    unfinishedSession,
    tomorrowDecisions: [],
    openLoops: {
      cycle,
      total,
      resolved,
      remaining: Math.max(0, total - resolved),
      items,
    },
  };
}

function openLoop(entityId: string, title: string): OpenLoopItem {
  return {
    entityType: OPEN_LOOP_ENTITY_TYPE.lifeAction,
    entityId,
    title,
    requirement: OPEN_LOOP_REQUIREMENT.requiresResolution,
    status: 'ready',
    resolution: null,
    resolvedAt: null,
    allowedResolutions: Object.values(OPEN_LOOP_RESOLUTION),
  };
}
