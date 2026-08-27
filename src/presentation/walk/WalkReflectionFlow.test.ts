import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import {
  DayDate,
  EntityId,
  WALK_INTENT,
  WALK_MODE,
  WALK_REFLECTION_STAGE,
  WALK_REFLECTION_TEMPLATE,
  WALK_TYPE,
  Walk,
  type WalkReflectionStage,
} from '../../domain';
import { WalkReflectionGuidancePanel, WalkReflectionTemplateSelector } from './WalkReflectionFlow';

const DATE = DayDate.create('2026-08-08');

describe('WalkReflectionFlow', () => {
  it('offers all five templates and previews the selected guided stages in order', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkReflectionTemplateSelector, {
        selectedTemplate: WALK_REFLECTION_TEMPLATE.decision,
        isDisabled: false,
        onSelect: vi.fn(),
      }),
    );

    expect(markup.match(/name="walk-reflection-template"/g)).toHaveLength(5);
    expect(markup).toContain('Принятие решения');
    expect(markup).toContain('Разбор проблемы');
    expect(markup).toContain('Прояснение цели');
    expect(markup).toContain('Стратегия');
    expect(markup).toContain('Свободная мысль');
    expect(markup.indexOf('Факты')).toBeLessThan(markup.indexOf('Предположения'));
    expect(markup.indexOf('Предположения')).toBeLessThan(markup.indexOf('Варианты'));
    expect(markup.indexOf('Варианты')).toBeLessThan(markup.indexOf('Цена выбора'));
    expect(markup.indexOf('Цена выбора')).toBeLessThan(
      markup.indexOf('Минимальный проверочный шаг'),
    );
  });

  it('shows one current prompt and no answer capture in active guidance', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkReflectionGuidancePanel, {
        walk: guidedWalk('first', WALK_REFLECTION_STAGE.facts),
        isSaving: false,
        onAdvance: vi.fn(),
        onDisable: vi.fn(),
      }),
    );

    expect(markup).toContain('Принятие решения');
    expect(markup).toContain('Этап 1 из 5');
    expect(markup).toContain('Факты');
    expect(markup).toContain('Что известно наверняка, без интерпретаций?');
    expect(markup).toContain('Следующий этап');
    expect(markup).toContain('Без сопровождения');
    expect(markup).toContain('aria-live="polite"');
    expect(markup).not.toMatch(/textarea|Записать ответ|Сохранить мысль/);
  });

  it('offers to finish guidance at the final stage without finishing the walk', () => {
    const markup = renderToStaticMarkup(
      createElement(WalkReflectionGuidancePanel, {
        walk: guidedWalk('last', WALK_REFLECTION_STAGE.smallestTest),
        isSaving: false,
        onAdvance: vi.fn(),
        onDisable: vi.fn(),
      }),
    );

    expect(markup).toContain('Этап 5 из 5');
    expect(markup).toContain('Завершить сопровождение');
    expect(markup).not.toContain('Завершить прогулку');
  });

  it('renders no guidance for free, recovery, legacy reflection, or free thought', () => {
    const walks = [
      activeWalk('free', WALK_INTENT.free, WALK_TYPE.mindful),
      activeWalk('recovery', WALK_INTENT.recovery, WALK_TYPE.restorative),
      activeWalk('legacy', WALK_INTENT.reflection, WALK_TYPE.reflection),
      Walk.create({
        id: EntityId.create('walk-free-thought'),
        date: DATE,
        type: WALK_TYPE.reflection,
        intent: WALK_INTENT.reflection,
        reflectionTemplate: WALK_REFLECTION_TEMPLATE.freeThought,
        now: new Date('2026-08-08T08:00:00.000Z'),
      }).start({
        mode: WALK_MODE.stopwatch,
        startedAt: new Date('2026-08-08T08:01:00.000Z'),
        reflectionQuestion: 'Что важно заметить?',
      }),
    ];

    for (const walk of walks) {
      expect(
        renderToStaticMarkup(
          createElement(WalkReflectionGuidancePanel, {
            walk,
            isSaving: false,
            onAdvance: vi.fn(),
            onDisable: vi.fn(),
          }),
        ),
      ).toBe('');
    }
  });
});

function guidedWalk(id: string, stage: WalkReflectionStage): Walk {
  let walk = Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DATE,
    type: WALK_TYPE.reflection,
    intent: WALK_INTENT.reflection,
    reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
    now: new Date('2026-08-08T08:00:00.000Z'),
  }).start({
    mode: WALK_MODE.stopwatch,
    startedAt: new Date('2026-08-08T08:01:00.000Z'),
    reflectionQuestion: 'Что важно заметить?',
  });
  let minute = 2;
  while (walk.reflectionStage !== stage) {
    walk = walk.advanceReflectionStage(
      new Date(`2026-08-08T08:${String(minute).padStart(2, '0')}:00.000Z`),
    );
    minute += 1;
  }
  return walk;
}

function activeWalk(
  id: string,
  intent: (typeof WALK_INTENT)[keyof typeof WALK_INTENT],
  type: (typeof WALK_TYPE)[keyof typeof WALK_TYPE],
): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DATE,
    type,
    intent,
    now: new Date('2026-08-08T08:00:00.000Z'),
  }).start({
    mode: WALK_MODE.stopwatch,
    startedAt: new Date('2026-08-08T08:01:00.000Z'),
    reflectionQuestion: 'Что важно заметить?',
  });
}
