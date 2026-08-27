import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  DayDate,
  EntityId,
  Walk,
  WALK_IMPACT,
  WALK_INTENT,
  WALK_MODE,
  WALK_REENTRY_ACTION_KIND,
  WALK_TYPE,
} from '../../domain';
import { WalkReentryPanel } from './WalkCompletionFlow';
import { WalkActivePanel, WalkPreparationForm } from './WalkSessionFlow';
import { selectWalkSessionEntry } from './WalkReentryFlow';

const request = { decisionId: EntityId.create('decision-09'), title: 'Какой шаг проверить?' };
const walk = Walk.create({
  id: EntityId.create('walk-09'),
  date: DayDate.create('2026-08-26'),
  type: WALK_TYPE.reflection,
  intent: WALK_INTENT.reflection,
  linkedEntity: { type: 'decision', id: request.decisionId },
  returnContext: {
    origin: 'decision',
    entity: { type: 'decision', id: request.decisionId },
    nextStep: null,
  },
  now: new Date('2026-08-26T08:00:00Z'),
}).start({
  mode: WALK_MODE.stopwatch,
  startedAt: new Date('2026-08-26T08:00:00Z'),
  reflectionQuestion: 'Мой вопрос',
});

describe('WALK-09 presentation', () => {
  it('shows compact source context in the existing reflection preparation', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkPreparationForm, {
        intent: WALK_INTENT.reflection,
        isSaving: false,
        onBack: vi.fn(),
        onStart: vi.fn(),
        decisionLaunchRequest: request,
      }),
    );
    expect(markup).toContain('Связано с решением');
    expect(markup).toContain('Какой шаг проверить?');
  });
  it('shows the Decision title alongside the running reflection question', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkActivePanel, {
        walk,
        decisionTitle: request.title,
        now: new Date('2026-08-26T08:05:00Z'),
        isSaving: false,
        finishConfirmationOpen: false,
        onPause: vi.fn(),
        onResume: vi.fn(),
        onRequestFinish: vi.fn(),
        onConfirmFinish: vi.fn(),
        onCancelFinish: vi.fn(),
        onAdvanceReflection: vi.fn(),
        onDisableReflectionGuidance: vi.fn(),
      }),
    );
    expect(markup).toContain('Какой шаг проверить?');
    expect(markup).toContain('Мой вопрос');
    expect(markup).toContain('Размышление');
  });
  it('opens Decision preparation only after active and pending restoration', () => {
    const input = {
      activeWalk: null,
      pendingReentry: null,
      pendingLoadFailed: false,
      decisionLaunchRequest: request,
    };
    expect(selectWalkSessionEntry(input).phase).toBe('decisionLaunch');
    expect(selectWalkSessionEntry({ ...input, activeWalk: walk }).phase).toBe('active');
    expect(selectWalkSessionEntry({ ...input, pendingReentry: walk }).phase).toBe('reentry');
  });
  it('keeps the Today recovery CTA for a merely linked generic Walk with an unavailable Decision', () => {
    const linkedOnly = Walk.create({
      id: EntityId.create('linked-only'),
      date: walk.date,
      type: WALK_TYPE.reflection,
      intent: WALK_INTENT.reflection,
      linkedEntity: walk.linkedEntity,
      now: new Date('2026-08-26T08:00:00Z'),
    }).start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-26T08:00:00Z'),
      reflectionQuestion: 'Вопрос',
    });
    const markup = renderToStaticMarkup(
      createElement(WalkReentryPanel, {
        walk: withRecoveryOutcome(linkedOnly),
        decisionContext: { status: 'unavailable' },
        isSaving: false,
        error: null,
        onPrimary: vi.fn(),
        onCloseWithoutContinuation: vi.fn(),
      }),
    );
    expect(markup).toContain('Перейти на «Сегодня»');
    expect(markup).not.toContain('Перейти в Решения');
  });
  it('uses the original Decision return context even for a legacy recovery action', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkReentryPanel, {
        walk: withRecoveryOutcome(walk),
        decisionContext: {
          status: 'ready',
          decisionId: request.decisionId,
          title: request.title,
          plannedDate: null,
        },
        isSaving: false,
        error: null,
        onPrimary: vi.fn(),
        onCloseWithoutContinuation: vi.fn(),
      }),
    );
    expect(markup).toContain('Вернуться к решению');
    expect(markup).not.toContain('Перейти на «Сегодня»');
  });
});

function withRecoveryOutcome(active: Walk): Walk {
  return active.complete({ endedAt: new Date('2026-08-26T08:20:00Z') }).recordOutcome({
    afterState: { energy: 4, tension: 7, clarity: 3 },
    impact: WALK_IMPACT.worse,
    reflection: '',
    reentryAction: {
      kind: WALK_REENTRY_ACTION_KIND.recovery,
      destination: 'today',
      entity: null,
      nextStep: null,
    },
    updatedAt: new Date('2026-08-26T08:21:00Z'),
  });
}
