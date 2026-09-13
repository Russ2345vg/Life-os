import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  DayDate,
  EntityId,
  WALK_INTENT,
  WALK_IMPACT,
  WALK_MODE,
  WALK_REENTRY_ACTION_KIND,
  WALK_RETURN_ORIGIN,
  WALK_TYPE,
  Walk,
  type WalkImpact,
  type WalkReentryAction,
  type WalkStateSnapshot,
} from '../../domain';
import { APP_SECTION } from '../navigation/AppSection';
import * as completionFlow from './WalkCompletionFlow';
import * as sessionPresentation from './WalkSessionPresentation';

interface WalkOutcomeDraftContract {
  readonly afterState: WalkStateSnapshot;
  readonly impact: WalkImpact;
  readonly reflection: string;
}

interface QuickCompletionProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onSave: (draft: WalkOutcomeDraftContract) => void;
}

interface ReentryProps {
  readonly walk: Walk;
  readonly isSaving: boolean;
  readonly error: string | null;
  readonly onPrimary: () => void;
  readonly onCloseWithoutContinuation: () => void;
}

function component<Props>(name: string): ComponentType<Props> {
  const candidate = (completionFlow as Record<string, unknown>)[name];
  expect(typeof candidate).toBe('function');
  return candidate as ComponentType<Props>;
}

describe('WALK-04 completion presentation', () => {
  it('renders a compact reflection completion with before/after state and required impact', () => {
    const Panel = component<QuickCompletionProps>('WalkQuickCompletionPanel');
    const markup = renderToStaticMarkup(
      createElement(Panel, {
        walk: completedWalk(WALK_INTENT.reflection),
        isSaving: false,
        error: null,
        onSave: vi.fn(),
      }),
    );

    for (const text of [
      'Быстрый итог',
      'Размышление',
      '30 мин',
      '08:00',
      '08:30',
      'До прогулки',
      'После прогулки',
      'Энергия',
      'Напряжение',
      'Ясность',
      'Как прогулка повлияла?',
      'Лучше',
      'Так же',
      'Хуже',
      'Что стало понятнее?',
      'Сохранить итог',
    ]) {
      expect(markup).toContain(text);
    }
    expect(markup.match(/type="range"/g)).toHaveLength(3);
    expect(markup.match(/name="walk-impact"/g)).toHaveLength(3);
    expect(markup).toMatch(/type="submit"[^>]*disabled/);
    expect(markup).not.toMatch(/Фото|GPS|карта/i);
    expect(markup).toContain('aria-label="Голосовой ввод недоступен"');
  });

  it('uses the short generic reflection prompt for a recovery walk', () => {
    const Panel = component<QuickCompletionProps>('WalkQuickCompletionPanel');
    const markup = renderToStaticMarkup(
      createElement(Panel, {
        walk: completedWalk(WALK_INTENT.recovery),
        isSaving: false,
        error: 'Не удалось сохранить итог.',
        onSave: vi.fn(),
      }),
    );

    expect(markup).toContain('Что изменилось?');
    expect(markup).not.toContain('Что стало понятнее?');
    expect(markup).toContain('role="alert"');
  });

  it('renders a recovery Reentry with one primary way to Today', () => {
    const Panel = component<ReentryProps>('WalkReentryPanel');
    const walk = reentryWalk(
      {
        kind: WALK_REENTRY_ACTION_KIND.recovery,
        destination: WALK_RETURN_ORIGIN.today,
        entity: null,
        nextStep: null,
      },
      WALK_IMPACT.worse,
    );
    const markup = renderToStaticMarkup(
      createElement(Panel, {
        walk,
        isSaving: false,
        error: null,
        onPrimary: vi.fn(),
        onCloseWithoutContinuation: vi.fn(),
      }),
    );

    expect(markup).toContain('Что дальше?');
    expect(markup).toContain('Сначала восстановиться');
    expect(markup).toContain('Перейти на «Сегодня»');
    expect(markup).toContain('Закрыть без продолжения');
    expect(markup.match(/class="primary-button"/g)).toHaveLength(1);
  });

  it('renders a review-result Reentry without exposing the linked entity id', () => {
    const Panel = component<ReentryProps>('WalkReentryPanel');
    const entity = { type: 'decision' as const, id: EntityId.create('decision-private-id') };
    const walk = reentryWalk({
      kind: WALK_REENTRY_ACTION_KIND.reviewResult,
      destination: WALK_RETURN_ORIGIN.decision,
      entity,
      nextStep: null,
    });
    const markup = renderToStaticMarkup(
      createElement(Panel, {
        walk,
        isSaving: false,
        error: null,
        onPrimary: vi.fn(),
        onCloseWithoutContinuation: vi.fn(),
      }),
    );

    expect(markup).toContain('Проверить сохранённый вывод');
    expect(markup).toContain('Вернуться к решению');
    expect(markup).toContain('Стало понятнее, с чего начать.');
    expect(markup).toContain('Лучше');
    expect(markup).not.toContain('decision-private-id');
  });

  it('renders a resume-context Reentry with its stored next step', () => {
    const Panel = component<ReentryProps>('WalkReentryPanel');
    const entity = { type: 'routine' as const, id: EntityId.create('routine-private-id') };
    const markup = renderToStaticMarkup(
      createElement(Panel, {
        walk: reentryWalk({
          kind: WALK_REENTRY_ACTION_KIND.resumeContext,
          destination: WALK_RETURN_ORIGIN.routine,
          entity,
          nextStep: 'Душ и вода',
        }),
        isSaving: false,
        error: null,
        onPrimary: vi.fn(),
        onCloseWithoutContinuation: vi.fn(),
      }),
    );

    expect(markup).toContain('Продолжить начатое');
    expect(markup).toContain('Следующий шаг');
    expect(markup).toContain('Душ и вода');
    expect(markup).toContain('Вернуться к распорядку');
    expect(markup).not.toContain('routine-private-id');
  });

  it('renders the Today fallback plus persistence error and disabled controls', () => {
    const Panel = component<ReentryProps>('WalkReentryPanel');
    const markup = renderToStaticMarkup(
      createElement(Panel, {
        walk: reentryWalk({
          kind: WALK_REENTRY_ACTION_KIND.today,
          destination: WALK_RETURN_ORIGIN.today,
          entity: null,
          nextStep: null,
        }),
        isSaving: true,
        error: 'Не удалось завершить возвращение.',
        onPrimary: vi.fn(),
        onCloseWithoutContinuation: vi.fn(),
      }),
    );

    expect(markup).toContain('Вернуться в ритм дня');
    expect(markup).toContain('Перейти на «Сегодня»');
    expect(markup).toContain('role="alert"');
    expect(markup).toContain('Не удалось завершить возвращение.');
    expect(markup.match(/<button/g)).toHaveLength(2);
    expect(markup.match(/disabled/g)).toHaveLength(2);
  });

  it('maps every existing return origin to an existing application section', () => {
    const candidate = (sessionPresentation as Record<string, unknown>).getWalkReturnPresentation;
    expect(typeof candidate).toBe('function');
    const present = candidate as (origin: string) => {
      readonly label: string;
      readonly destination: string;
    };

    expect(present(WALK_RETURN_ORIGIN.today)).toEqual({
      label: 'Вернуться на «Сегодня»',
      destination: APP_SECTION.today,
    });
    expect(present(WALK_RETURN_ORIGIN.decision).destination).toBe(APP_SECTION.decisions);
    expect(present(WALK_RETURN_ORIGIN.routine).destination).toBe(APP_SECTION.routine);
    expect(present(WALK_RETURN_ORIGIN.lifeAction).destination).toBe(APP_SECTION.actions);
    expect(present(WALK_RETURN_ORIGIN.goal).destination).toBe(APP_SECTION.management);
    expect(present(WALK_RETURN_ORIGIN.project).destination).toBe(APP_SECTION.management);
    expect(present(WALK_RETURN_ORIGIN.walks).destination).toBe(APP_SECTION.walks);
  });
});

function completedWalk(
  intent: (typeof WALK_INTENT)[keyof typeof WALK_INTENT],
  returnContext: Parameters<typeof Walk.create>[0]['returnContext'] = null,
): Walk {
  const type = intent === WALK_INTENT.reflection ? WALK_TYPE.reflection : WALK_TYPE.restorative;
  return Walk.create({
    id: EntityId.create(`walk-completion-${intent}`),
    date: DayDate.create('2026-08-08'),
    type,
    intent,
    beforeState: { energy: 3, tension: 8, clarity: 4 },
    returnContext,
    now: new Date('2026-08-08T07:00:00.000+09:00'),
  })
    .start({
      mode: WALK_MODE.timer,
      startedAt: new Date('2026-08-08T08:00:00.000+09:00'),
      timerTargetMinutes: 30,
      reflectionQuestion: 'Что сейчас важно заметить?',
    })
    .complete({ endedAt: new Date('2026-08-08T08:30:00.000+09:00') });
}

function reentryWalk(
  reentryAction: WalkReentryAction,
  impact: WalkImpact = WALK_IMPACT.better,
): Walk {
  return completedWalk(WALK_INTENT.reflection).recordOutcome({
    afterState: { energy: 7, tension: 2, clarity: 8 },
    impact,
    reflection: 'Стало понятнее, с чего начать.',
    reentryAction,
    updatedAt: new Date('2026-08-08T08:32:00.000+09:00'),
  });
}
