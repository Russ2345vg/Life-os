import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { EntityId, EXERCISE_MEASUREMENT_TYPE, MORNING_PHYSICAL_SET_STATUS } from '../../domain';
import {
  MORNING_PHYSICAL_EXECUTION_VIEW_STATE,
  type MorningPhysicalExecutionOverview,
} from '../../application';
import {
  MorningPhysicalExecutionView,
  buildMorningPhysicalProgressItems,
  parsePhysicalActual,
  runPhysicalCommandAndReload,
  type MorningPhysicalExecutionViewProps,
} from './MorningPhysicalExecutionPage';

describe('MorningPhysicalExecutionView', () => {
  it('строго разбирает целый actual без частичного parseInt', () => {
    expect(parsePhysicalActual('12x', EXERCISE_MEASUREMENT_TYPE.repetitions)).toMatchObject({
      ok: false,
    });
    expect(parsePhysicalActual(' 12 ', EXERCISE_MEASUREMENT_TYPE.repetitions)).toEqual({
      ok: true,
      value: {
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
        actualReps: 12,
      },
    });
  });

  it('отличает reload failure после успешной команды от command failure', async () => {
    const result = await runPhysicalCommandAndReload(
      async () => undefined,
      async () => {
        throw new Error('Не удалось перечитать состояние.');
      },
    );

    expect(result).toEqual({
      ok: false,
      phase: 'reload',
      message: 'Не удалось перечитать состояние.',
    });
  });
  it('показывает пустой repetition input без префилла плана', () => {
    const markup = renderView(overview());

    expect(markup).toContain('Фактически');
    expect(markup).toContain('type="number"');
    expect(markup).toContain('min="1"');
    expect(markup).toContain('max="1000"');
    expect(markup).toContain('value=""');
    expect(markup).toContain('План: 10 повторений');
    expect(markup).not.toContain('value="10"');
  });

  it('использует секундный duration input с доменными границами', () => {
    const markup = renderView(
      overview({
        currentSet: {
          ...currentCommon(),
          exerciseDefinitionId: EntityId.create('plank'),
          name: 'Планка',
          measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
          targetDurationSeconds: 30,
          actualDurationSeconds: null,
        },
      }),
    );

    expect(markup).toContain('max="3600"');
    expect(markup).toContain('План: 30 секунд');
    expect(markup).toContain('секунд');
  });

  it('на паузе замораживает elapsed, предлагает resume и блокирует resolve', () => {
    const markup = renderView(
      overview({
        state: MORNING_PHYSICAL_EXECUTION_VIEW_STATE.paused,
        workedDurationMs: 185_000,
        canPause: false,
        canResume: true,
        canResolve: false,
      }),
      { displayWorkedDurationMs: 185_000 },
    );

    expect(markup).toContain('На паузе');
    expect(markup).toContain('03:05');
    expect(markup).toContain('Продолжить выполнение');
    expect(markup).toMatch(/Завершить подход[\s\S]*disabled/);
  });

  it('после resolved set показывает факт и явное ручное продвижение', () => {
    const markup = renderView(
      overview({
        state: MORNING_PHYSICAL_EXECUTION_VIEW_STATE.awaitingAdvance,
        resolvedSets: 1,
        completedSets: 1,
        canResolve: false,
        canAdvance: true,
        currentSet: {
          ...currentCommon(),
          status: MORNING_PHYSICAL_SET_STATUS.completed,
          resolvedAt: new Date('2026-08-28T07:02:00.000+09:00'),
          measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
          targetReps: 10,
          actualReps: 14,
        },
      }),
    );

    expect(markup).toContain('Фактически: 14 повторений');
    expect(markup).toContain('Следующий подход');
    expect(markup).not.toContain('type="number"');
  });

  it('показывает explicit skip и final factual summary', () => {
    const markup = renderView(
      overview({
        state: MORNING_PHYSICAL_EXECUTION_VIEW_STATE.readyToFinish,
        resolvedSets: 3,
        completedSets: 2,
        skippedSets: 1,
        totalActualReps: 24,
        canResolve: false,
        canPause: true,
        canFinish: true,
        currentSet: {
          ...currentCommon(),
          setNumber: 3,
          setCount: 3,
          globalSetIndex: 3,
          globalSetCount: 3,
          status: MORNING_PHYSICAL_SET_STATUS.skipped,
          resolvedAt: new Date('2026-08-28T07:05:00.000+09:00'),
          measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
          targetReps: 10,
          actualReps: null,
        },
      }),
    );

    expect(markup).toContain('Подход пропущен');
    expect(markup).toContain('Выполнено подходов: 2');
    expect(markup).toContain('Пропущено подходов: 1');
    expect(markup).toContain('Фактические повторения: 24');
    expect(markup).toContain('Время выполнения: 01:00');
    expect(markup).toContain('Завершить физическую активацию');
    expect(markup).toContain('Прогресс плана');
    expect(markup).toContain('Текущая позиция: подход 3 из 3');
    expect(buildMorningPhysicalProgressItems(overview({ resolvedSets: 2 }))).toHaveLength(5);
  });

  it('completed и legacy completed остаются read-only', () => {
    const completed = renderView(
      overview({
        state: MORNING_PHYSICAL_EXECUTION_VIEW_STATE.completed,
        canResolve: false,
        canPause: false,
        currentSet: null,
      }),
    );
    const legacy = renderView(
      overview({
        state: MORNING_PHYSICAL_EXECUTION_VIEW_STATE.legacyCompleted,
        currentSet: null,
        totalSets: 0,
        canResolve: false,
        canPause: false,
      }),
    );

    expect(completed).toContain('Физическая активация завершена');
    expect(completed).not.toContain('Завершить подход');
    expect(legacy).toContain('Подробные результаты подходов не записывались');
  });

  it('различает recoverable, unrecoverable и unavailable', () => {
    const recoverable = renderView(
      overview({
        state: MORNING_PHYSICAL_EXECUTION_VIEW_STATE.recoverable,
        currentSet: null,
        canRecover: true,
      }),
    );
    const unrecoverable = renderView(
      overview({
        state: MORNING_PHYSICAL_EXECUTION_VIEW_STATE.unrecoverable,
        currentSet: null,
        totalSets: 0,
      }),
    );
    const unavailable = renderView(
      overview({
        state: MORNING_PHYSICAL_EXECUTION_VIEW_STATE.unavailable,
        currentSet: null,
      }),
    );

    expect(recoverable).toContain('Восстановить выполнение');
    expect(recoverable).toContain('Требуется восстановление');
    expect(unrecoverable).toContain('Безопасное восстановление недоступно');
    expect(unrecoverable).toContain('Восстановление недоступно');
    expect(unavailable).toContain('Выполнение ещё не начато');
    expect(unavailable).toContain('Не начато');
    expect(unrecoverable).toContain('Вернуться к плану');
  });

  it('объявляет pending state и сохраняет полное длинное имя', () => {
    const longName =
      'Очень длинное пользовательское упражнение для плечевого пояса без сокращения названия';
    const markup = renderView(
      overview({
        currentSet: {
          ...currentCommon(),
          name: longName,
          measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
          targetReps: 10,
          actualReps: null,
        },
      }),
      { pendingAction: 'complete-set' },
    );

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Сохраняем подход…');
    expect(markup).toContain(longName);
    expect(markup).toContain('disabled');
  });
});

function renderView(
  value: MorningPhysicalExecutionOverview,
  additions: Partial<MorningPhysicalExecutionViewProps> = {},
): string {
  return renderToStaticMarkup(
    createElement(MorningPhysicalExecutionView, {
      overview: value,
      displayWorkedDurationMs: value.workedDurationMs,
      actualInput: '',
      pendingAction: null,
      mutationError: null,
      onBack: () => undefined,
      onActualInputChange: () => undefined,
      onRecover: () => undefined,
      onPause: () => undefined,
      onResume: () => undefined,
      onCompleteSet: () => undefined,
      onSkipSet: () => undefined,
      onAdvance: () => undefined,
      onFinish: () => undefined,
      ...additions,
    }),
  );
}

function overview(
  additions: Partial<MorningPhysicalExecutionOverview> = {},
): MorningPhysicalExecutionOverview {
  return {
    date: { toString: () => '2026-08-28' } as MorningPhysicalExecutionOverview['date'],
    mutable: true,
    state: MORNING_PHYSICAL_EXECUTION_VIEW_STATE.running,
    workedDurationMs: 60_000,
    selectedExerciseCount: 1,
    totalSets: 3,
    resolvedSets: 0,
    completedSets: 0,
    skippedSets: 0,
    totalActualReps: 0,
    totalActualDurationSeconds: 0,
    currentSet: {
      ...currentCommon(),
      measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
      targetReps: 10,
      actualReps: null,
    },
    canRecover: false,
    canPause: true,
    canResume: false,
    canResolve: true,
    canAdvance: false,
    canFinish: false,
    ...additions,
  };
}

function currentCommon() {
  return {
    exerciseDefinitionId: EntityId.create('push-ups'),
    name: 'Отжимания',
    exerciseIndex: 1,
    exerciseCount: 1,
    setNumber: 1,
    setCount: 3,
    globalSetIndex: 1,
    globalSetCount: 3,
    status: MORNING_PHYSICAL_SET_STATUS.pending,
    resolvedAt: null,
  } as const;
}
