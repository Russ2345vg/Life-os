import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { MorningPhysicalActivationOverview } from '../../application';
import { DayDate, EntityId, EXERCISE_MEASUREMENT_TYPE } from '../../domain';
import {
  MorningPhysicalActivationView,
  runMorningPhysicalStart,
  type MorningPhysicalActivationViewProps,
} from './MorningPhysicalActivationPage';
import { exerciseCountLabel, setsCountLabel } from './MorningPhysicalCopy';

const DATE = DayDate.create('2026-08-27');
const NOOP = () => undefined;

describe('MorningPhysicalActivationView', () => {
  it('показывает библиотеку, сегодняшний набор и компактную реальную сводку', () => {
    const markup = render(selectedProps());

    expect(markup).toContain('Физическая активация');
    expect(markup).toContain('Выбери упражнения и настрой нагрузку на сегодняшнее утро.');
    expect(markup).toContain('Библиотека');
    expect(markup).toContain('Сегодняшний набор');
    expect(markup).toContain('Выбрано 2 упражнения · 6 подходов · ≈ 12 мин');
    expect(markup).toContain('3 × 15 повторений');
    expect(markup).toContain('3 × 30 сек');
    expect(markup).toContain('morning-physical-plan');
    expect(markup).toContain('>Начать выполнение</button>');
    expect(markup).not.toContain('План на утро готов');
    expect(markup).not.toContain('MOR-03');
    expect(markup).not.toContain('будет реализовано позже');
  });

  it('оставляет начало выполнения недоступным для пустого набора', () => {
    const markup = render({ ...selectedProps(), overview: emptyOverview() });

    expect(markup).toContain('Упражнения не выбраны');
    expect(markup).toContain('disabled="">Начать выполнение</button>');
  });

  it('показывает persisted start как единственное pending-действие CTA', () => {
    const markup = render({ ...selectedProps(), pendingAction: 'start' });

    expect(markup).toContain('disabled="">Начинаем…</button>');
    expect(markup).not.toContain('План сохранён и готов к утру.');
  });

  it('отмечает выбранную карточку и даёт степперам доступные имена', () => {
    const markup = render(selectedProps());

    expect(markup).toContain('aria-pressed="true"');
    expect(markup).toContain('physical-exercise-card-selected');
    expect(markup).toContain('Увеличить подходы: Отжимания');
    expect(markup).toContain('Уменьшить повторения: Отжимания');
    expect(markup).toContain('Увеличить секунды: Планка');
  });

  it('показывает inline-форму своего упражнения и безопасно переносит длинное имя', () => {
    const overview = selectedOverview();
    const longName = 'Очень длинное пользовательское упражнение для спокойной утренней разминки';
    const markup = render({
      ...selectedProps(),
      overview: {
        ...overview,
        library: [
          ...overview.library,
          {
            id: EntityId.create('custom-long'),
            name: longName,
            measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
            selected: false,
          },
        ],
      },
      customFormOpen: true,
      customName: longName,
    });

    expect(markup).toContain('+ Добавить своё');
    expect(markup).toContain('Название упражнения');
    expect(markup).toContain('type="text"');
    expect(markup).toContain('morning-physical-segmented');
    expect(markup).toContain('Повторения');
    expect(markup).toContain('Время');
    expect(markup).toContain('Добавить упражнение');
    expect(markup).toContain(longName);
  });

  it('показывает read-only и pending/error состояния без mutating-контролов', () => {
    const markup = render({
      ...selectedProps(),
      overview: {
        ...selectedOverview(),
        mutable: false,
        canEditPlan: false,
        canCreateCustom: false,
      },
      pendingAction: 'adjust',
      mutationError: 'Не удалось сохранить план.',
    });

    expect(markup).toContain('aria-busy="true"');
    expect(markup).toContain('Режим просмотра');
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain('Увеличить подходы');
  });
});

describe('runMorningPhysicalStart', () => {
  it('переходит к выполнению только после команды и authoritative reload', async () => {
    const events: string[] = [];
    const start = vi.fn(async () => events.push('start'));
    const reload = vi.fn(async () => events.push('reload'));
    const onExecutionStarted = vi.fn(() => events.push('navigate'));

    await runMorningPhysicalStart(start, reload, onExecutionStarted);

    expect(start).toHaveBeenCalledOnce();
    expect(reload).toHaveBeenCalledOnce();
    expect(onExecutionStarted).toHaveBeenCalledOnce();
    expect(events).toEqual(['start', 'reload', 'navigate']);
  });

  it('не переходит к выполнению при ошибке команды или reload', async () => {
    const afterCommandFailure = vi.fn();
    await expect(
      runMorningPhysicalStart(
        async () => Promise.reject(new Error('start failed')),
        async () => undefined,
        afterCommandFailure,
      ),
    ).rejects.toThrow('start failed');
    expect(afterCommandFailure).not.toHaveBeenCalled();

    const afterReloadFailure = vi.fn();
    await expect(
      runMorningPhysicalStart(
        async () => undefined,
        async () => Promise.reject(new Error('reload failed')),
        afterReloadFailure,
      ),
    ).rejects.toThrow('reload failed');
    expect(afterReloadFailure).not.toHaveBeenCalled();
  });
});

describe('подписи количества', () => {
  it.each([
    [1, '1 упражнение', '1 подход'],
    [2, '2 упражнения', '2 подхода'],
    [5, '5 упражнений', '5 подходов'],
    [11, '11 упражнений', '11 подходов'],
    [21, '21 упражнение', '21 подход'],
  ])('склоняет %i', (count, exercises, sets) => {
    expect(exerciseCountLabel(count)).toBe(exercises);
    expect(setsCountLabel(count)).toBe(sets);
  });
});

function render(props: MorningPhysicalActivationViewProps): string {
  return renderToStaticMarkup(createElement(MorningPhysicalActivationView, props));
}

function selectedProps(): MorningPhysicalActivationViewProps {
  return {
    overview: selectedOverview(),
    pendingAction: null,
    mutationError: null,
    customFormOpen: false,
    customName: '',
    customMeasurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    onBack: NOOP,
    onToggleExercise: NOOP,
    onAdjustExercise: NOOP,
    onToggleCustomForm: NOOP,
    onCustomNameChange: NOOP,
    onCustomMeasurementTypeChange: NOOP,
    onCreateCustom: NOOP,
    onStartExecution: NOOP,
  };
}

function selectedOverview(): MorningPhysicalActivationOverview {
  return {
    date: DATE,
    mutable: true,
    canEditPlan: true,
    canCreateCustom: true,
    library: [
      {
        id: EntityId.create('morning-exercise.push-ups'),
        name: 'Отжимания',
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
        selected: true,
      },
      {
        id: EntityId.create('morning-exercise.plank'),
        name: 'Планка',
        measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
        selected: true,
      },
    ],
    selectedItems: [
      {
        id: EntityId.create('morning-exercise.push-ups'),
        name: 'Отжимания',
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
        sets: 3,
        targetReps: 15,
      },
      {
        id: EntityId.create('morning-exercise.plank'),
        name: 'Планка',
        measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
        sets: 3,
        targetDurationSeconds: 30,
      },
    ],
    summary: { selectedCount: 2, totalSets: 6, estimatedMinutes: 12 },
  };
}

function emptyOverview(): MorningPhysicalActivationOverview {
  return {
    ...selectedOverview(),
    library: selectedOverview().library.map((item) => ({ ...item, selected: false })),
    selectedItems: [],
    summary: { selectedCount: 0, totalSets: 0, estimatedMinutes: 0 },
  };
}
