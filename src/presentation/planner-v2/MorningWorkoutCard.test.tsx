import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { EXERCISE_MEASUREMENT_TYPE } from '../../domain';
import type { MorningWorkoutSnapshot } from '../../application';
import { MorningFocusCard } from './MorningFocusCard';
import { MorningWorkoutCardView } from './MorningWorkoutCard';

describe('MorningWorkoutCardView', () => {
  it('показывает готовый список без таймера до старта', () => {
    const html = render(snapshot('NOT_STARTED'));

    expect(html).toContain('Утренняя зарядка');
    expect(html).toContain('≈ 30 минут');
    expect(html).toContain('Подтягивания');
    expect(html).toContain('3 × 4 повт.');
    expect(html).toContain('Начать зарядку');
    expect(html).toContain('Пропустить сегодня');
    expect(html).not.toContain('role="timer"');
  });

  it('показывает весь список и ввод факта только для текущего подхода', () => {
    const value = snapshot('IN_PROGRESS');
    const html = render({
      ...value,
      completedSets: 1,
      currentSet: value.items[0]!.sets[1]!,
      items: [
        {
          ...value.items[0]!,
          sets: [
            { ...value.items[0]!.sets[0]!, status: 'COMPLETED', actual: 4, current: false },
            { ...value.items[0]!.sets[1]!, current: true },
            value.items[0]!.sets[2]!,
          ],
        },
      ],
    });

    expect(html).toContain('1 из 3 подходов');
    expect(html).toContain('aria-label="Фактические повторения: Подтягивания, подход 2"');
    expect(html).toContain('value="4"');
    expect(html).toContain('4 повт. выполнено');
    expect(html.match(/>Готово<\/button>/g)).toHaveLength(1);
  });

  it('показывает предложение после завершения и отдельные действия решения', () => {
    const html = render({
      ...snapshot('COMPLETED'),
      focusUnlocked: true,
      recommendation: {
        status: 'PENDING',
        changes: [
          {
            exerciseDefinitionId: 'morning-exercise.pull-ups',
            exerciseName: 'Подтягивания',
            measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
            from: 4,
            to: 5,
          },
        ],
      },
    });

    expect(html).toContain('Зарядка выполнена');
    expect(html).toContain('Подтягивания: 4 → 5 повторений');
    expect(html).toContain('Принять на завтра');
    expect(html).toContain('Оставить текущую');
  });

  it('рендерит loading, error и skipped без ложного успеха', () => {
    expect(
      renderToStaticMarkup(
        createElement(MorningWorkoutCardView, { ...handlers, snapshot: null, loading: true }),
      ),
    ).toContain('Загружаю зарядку');
    expect(
      renderToStaticMarkup(
        createElement(MorningWorkoutCardView, {
          ...handlers,
          snapshot: null,
          loading: false,
          error: 'Нет связи',
        }),
      ),
    ).toContain('Повторить');
    expect(render({ ...snapshot('SKIPPED'), focusUnlocked: true })).toContain(
      'Зарядка пропущена сегодня',
    );
  });
});

describe('MorningFocusCard workout gate', () => {
  it('блокирует запуск и объясняет порядок ритуала', () => {
    const html = renderToStaticMarkup(
      createElement(MorningFocusCard, {
        dateKey: '2026-10-04',
        action: null,
        sessions: [],
        unlocked: false,
      }),
    );

    expect(html).toContain('Сначала завершите или пропустите зарядку');
    expect(html).toContain('aria-disabled="true"');
  });
});

const handlers = {
  busy: false,
  onStart: vi.fn(),
  onSkipWorkout: vi.fn(),
  onCompleteSet: vi.fn(),
  onSkipSet: vi.fn(),
  onAcceptRecommendation: vi.fn(),
  onDismissRecommendation: vi.fn(),
  onRetry: vi.fn(),
};

function render(value: MorningWorkoutSnapshot): string {
  return renderToStaticMarkup(
    createElement(MorningWorkoutCardView, {
      ...handlers,
      snapshot: value,
      loading: false,
    }),
  );
}

function snapshot(status: MorningWorkoutSnapshot['status']): MorningWorkoutSnapshot {
  const sets = [1, 2, 3].map((setNumber) => ({
    exerciseDefinitionId: 'morning-exercise.pull-ups',
    exerciseName: 'Подтягивания',
    setNumber,
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    target: 4,
    status: 'PENDING' as const,
    actual: null,
    current: status === 'IN_PROGRESS' && setNumber === 1,
  }));
  return {
    status,
    estimatedMinutes: 30,
    totalSets: 3,
    completedSets: status === 'COMPLETED' ? 3 : 0,
    focusUnlocked: status === 'COMPLETED' || status === 'SKIPPED',
    items: [
      {
        exerciseDefinitionId: 'morning-exercise.pull-ups',
        exerciseName: 'Подтягивания',
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
        target: 4,
        sets,
      },
    ],
    currentSet: status === 'IN_PROGRESS' ? sets[0]! : null,
    recommendation: null,
  };
}
