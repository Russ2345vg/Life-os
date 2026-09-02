import { describe, expect, it } from 'vitest';
import { EntityId } from '../shared/EntityId';
import { EXERCISE_MEASUREMENT_TYPE } from './ExerciseDefinition';
import {
  MORNING_PHYSICAL_SET_STATUS,
  MorningPhysicalExecution,
  type MorningPhysicalExecutionRehydrationData,
  type MorningPhysicalSetExecution,
} from './MorningPhysicalExecution';
import type { MorningPhysicalPlanItem } from './MorningPhysicalPlan';

describe('MorningPhysicalExecution', () => {
  it('раскрывает сохранённый план в стабильном порядке упражнений и подходов', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 2, 12), durationPlan('plank', 2, 30)],
      time('07:00'),
    );

    expect(execution.sets.map(setIdentity)).toEqual([
      'push-ups:1:REPETITIONS:PENDING',
      'push-ups:2:REPETITIONS:PENDING',
      'plank:1:DURATION:PENDING',
      'plank:2:DURATION:PENDING',
    ]);
    expect(execution.activeSetIndex).toBe(0);
    expect(execution.completedAt).toBeNull();
  });

  it('возвращает глубокие копии времени, пауз и подходов', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 1, 10)],
      time('07:00'),
    );
    execution.pause(time('07:05'));
    execution.resume(time('07:10'));

    execution.startedAt.setUTCFullYear(2030);
    execution.pauseIntervals[0]?.startedAt.setUTCFullYear(2030);
    const sets = execution.sets as MorningPhysicalSetExecution[];
    sets.splice(0, 1);

    expect(execution.startedAt).toEqual(time('07:00'));
    expect(execution.pauseIntervals[0]?.startedAt).toEqual(time('07:05'));
    expect(execution.sets).toHaveLength(1);
    expect(execution.copy()).not.toBe(execution);
  });

  it('вычитает закрытые и открытые паузы без сохраняемого счётчика', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 1, 10)],
      time('07:00'),
    );

    expect(execution.pause(time('07:05'))).toBe(true);
    expect(execution.pause(time('07:06'))).toBe(false);
    expect(execution.workedDurationAt(time('07:20'))).toBe(5 * 60_000);
    expect(execution.resume(time('07:25'))).toBe(true);
    expect(execution.resume(time('07:26'))).toBe(false);
    expect(execution.workedDurationAt(time('07:30'))).toBe(10 * 60_000);
  });

  it('восстанавливает результат, записанный в тот же момент перед открытой паузой', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 1, 10)],
      time('07:00'),
    );
    execution.completeSet(
      id('push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 12 },
      time('07:02'),
    );
    execution.pause(time('07:02'));

    const restored = rehydrateExecution(execution);

    expect(restored.pausedAt).toEqual(time('07:02'));
    expect(restored.currentSet).toMatchObject({
      status: MORNING_PHYSICAL_SET_STATUS.completed,
      actualReps: 12,
      resolvedAt: time('07:02'),
    });
  });

  it('восстанавливает результат на границе уже закрытой паузы', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 1, 10)],
      time('07:00'),
    );
    execution.completeSet(
      id('push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 12 },
      time('07:02'),
    );
    execution.pause(time('07:02'));
    execution.resume(time('07:03'));

    const restored = rehydrateExecution(execution);

    expect(restored.pauseIntervals).toEqual([{ startedAt: time('07:02'), endedAt: time('07:03') }]);
    expect(restored.currentSet.resolvedAt).toEqual(time('07:02'));
  });

  it('записывает типоспецифичные факты и продвигается только отдельной командой', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 1, 10), durationPlan('plank', 1, 30)],
      time('07:00'),
    );

    execution.completeSet(
      id('push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 14 },
      time('07:02'),
    );

    expect(execution.activeSetIndex).toBe(0);
    expect(execution.sets[0]).toMatchObject({
      status: MORNING_PHYSICAL_SET_STATUS.completed,
      actualReps: 14,
      resolvedAt: time('07:02'),
    });
    execution.advance();
    expect(execution.activeSetIndex).toBe(1);

    execution.completeSet(
      id('plank'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.duration, actualDurationSeconds: 42 },
      time('07:04'),
    );
    expect(execution.sets[1]).toMatchObject({
      status: MORNING_PHYSICAL_SET_STATUS.completed,
      actualDurationSeconds: 42,
    });
  });

  it('хранит явный пропуск без вымышленного фактического результата', () => {
    const execution = MorningPhysicalExecution.start([durationPlan('plank', 1, 30)], time('07:00'));

    execution.skipSet(id('plank'), 1, time('07:02'));

    expect(execution.sets[0]).toEqual({
      exerciseDefinitionId: id('plank'),
      setNumber: 1,
      measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
      status: MORNING_PHYSICAL_SET_STATUS.skipped,
      resolvedAt: time('07:02'),
    });
    expect(Object.hasOwn(execution.sets[0]!, 'actualDurationSeconds')).toBe(false);
    expect(Object.hasOwn(execution.sets[0]!, 'actualReps')).toBe(false);
  });

  it.each([0, 1001, 1.5, Number.NaN, Number.POSITIVE_INFINITY])(
    'отклоняет некорректные фактические повторения: %s',
    (actualReps) => {
      const execution = MorningPhysicalExecution.start(
        [repetitionPlan('push-ups', 1, 10)],
        time('07:00'),
      );

      expect(() =>
        execution.completeSet(
          id('push-ups'),
          1,
          { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps },
          time('07:02'),
        ),
      ).toThrowError('Фактический результат подхода указан неверно.');
    },
  );

  it.each([0, 3601, 1.5, Number.NaN, Number.NEGATIVE_INFINITY])(
    'отклоняет некорректкую фактическую длительность: %s',
    (actualDurationSeconds) => {
      const execution = MorningPhysicalExecution.start(
        [durationPlan('plank', 1, 30)],
        time('07:00'),
      );

      expect(() =>
        execution.completeSet(
          id('plank'),
          1,
          { measurementType: EXERCISE_MEASUREMENT_TYPE.duration, actualDurationSeconds },
          time('07:02'),
        ),
      ).toThrowError('Фактический результат подхода указан неверно.');
    },
  );

  it('отклоняет устаревшую идентичность, смешанный тип и перезапись результата', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 1, 10)],
      time('07:00'),
    );

    expectDomainError(
      () => execution.skipSet(id('plank'), 1, time('07:01')),
      'morning_physical_execution.stale_set',
    );
    expectDomainError(
      () =>
        execution.completeSet(
          id('push-ups'),
          1,
          { measurementType: EXERCISE_MEASUREMENT_TYPE.duration, actualDurationSeconds: 30 },
          time('07:01'),
        ),
      'morning_physical_execution.measurement_mismatch',
    );

    execution.skipSet(id('push-ups'), 1, time('07:02'));
    expectDomainError(
      () => execution.skipSet(id('push-ups'), 1, time('07:03')),
      'morning_physical_execution.set_resolved',
    );
  });

  it('не разрешает завершать или продвигать подход на паузе', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 2, 10)],
      time('07:00'),
    );
    execution.pause(time('07:01'));

    expectDomainError(
      () => execution.skipSet(id('push-ups'), 1, time('07:02')),
      'morning_physical_execution.paused',
    );
    expectDomainError(() => execution.advance(), 'morning_physical_execution.paused');
  });

  it('требует разрешённый текущий подход и следующий подход для продвижения', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 1, 10)],
      time('07:00'),
    );

    expectDomainError(() => execution.advance(), 'morning_physical_execution.current_set_pending');
    execution.skipSet(id('push-ups'), 1, time('07:01'));
    expectDomainError(() => execution.advance(), 'morning_physical_execution.no_next_set');
  });

  it('применяет сокращение только после разрешения текущего подхода', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 3, 10), durationPlan('plank', 2, 30)],
      time('07:00'),
    );

    expect(execution.requestRemainingSetStrategy('shorten')).toBe(true);
    expect(execution.currentSet).toMatchObject({ setNumber: 1, status: 'PENDING' });
    expect(execution.suppressedSetIndexes).toEqual([]);

    execution.completeSet(
      id('push-ups'),
      1,
      { measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions, actualReps: 12 },
      time('07:02'),
    );
    execution.advance();

    expect(execution.currentSet).toMatchObject({
      exerciseDefinitionId: id('plank'),
      setNumber: 1,
      status: 'PENDING',
    });
    expect(execution.suppressedSetIndexes).toEqual([1, 2, 4]);
    expect(execution.sets[0]).toMatchObject({ status: 'COMPLETED', actualReps: 12 });
    expect(execution.sets).toHaveLength(5);
  });

  it('пропускает всю оставшуюся физическую часть после безопасной границы', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 2, 10), durationPlan('plank', 1, 30)],
      time('07:00'),
    );

    execution.requestRemainingSetStrategy('skip');
    execution.skipSet(id('push-ups'), 1, time('07:01'));

    expect(execution.advance()).toBe(false);
    expect(execution.suppressedSetIndexes).toEqual([1, 2]);
    expect(execution.complete(time('07:02'))).toBe(true);
  });

  it('отменяет ожидающее сокращение до разрешения текущего подхода', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 2, 10)],
      time('07:00'),
    );

    execution.requestRemainingSetStrategy('shorten');
    expect(execution.cancelPendingRemainingSetStrategy()).toBe(true);
    execution.skipSet(id('push-ups'), 1, time('07:01'));
    expect(execution.advance()).toBe(true);

    expect(execution.activeSetIndex).toBe(1);
    expect(execution.suppressedSetIndexes).toEqual([]);
  });

  it('завершает полностью разрешённое выполнение и закрывает открытую паузу', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 1, 10)],
      time('07:00'),
    );
    execution.skipSet(id('push-ups'), 1, time('07:03'));
    execution.pause(time('07:05'));

    expect(execution.complete(time('07:10'))).toBe(true);
    expect(execution.complete(time('07:11'))).toBe(false);
    expect(execution.completedAt).toEqual(time('07:10'));
    expect(execution.pausedAt).toBeNull();
    expect(execution.pauseIntervals).toEqual([
      { startedAt: time('07:05'), endedAt: time('07:10') },
    ]);
    expect(execution.workedDurationAt(time('08:00'))).toBe(5 * 60_000);
  });

  it('не завершает выполнение до последнего разрешённого подхода', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 2, 10)],
      time('07:00'),
    );
    execution.skipSet(id('push-ups'), 1, time('07:01'));

    expectDomainError(
      () => execution.complete(time('07:02')),
      'morning_physical_execution.not_ready_to_complete',
    );
  });

  it('отклоняет время раньше последнего перехода', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 1, 10)],
      time('07:00'),
    );
    execution.pause(time('07:05'));

    expectDomainError(
      () => execution.resume(time('07:04')),
      'morning_physical_execution.time_before_last_transition',
    );
    expectDomainError(
      () => execution.workedDurationAt(time('06:59')),
      'morning_physical_execution.time_before_start',
    );
  });

  it.each([
    { label: 'пустой список', change: (data: MutableData) => (data.sets = []) },
    { label: 'индекс вне списка', change: (data: MutableData) => (data.activeSetIndex = 2) },
    {
      label: 'дубликат идентичности',
      change: (data: MutableData) =>
        (data.sets = [pendingRep('push-ups', 1), pendingRep('push-ups', 1)]),
    },
    {
      label: 'нарушенный номер подхода',
      change: (data: MutableData) => (data.sets = [pendingRep('push-ups', 2)]),
    },
    {
      label: 'разрешённый будущий подход',
      change: (data: MutableData) =>
        (data.sets = [pendingRep('push-ups', 1), skippedRep('push-ups', 2, '07:02')]),
    },
    {
      label: 'неизвестный тип измерения пропущенного подхода',
      change: (data: MutableData) =>
        (data.sets = [
          {
            ...skippedRep('push-ups', 1, '07:02'),
            measurementType: 'WEIGHT',
          } as unknown as MorningPhysicalSetExecution,
        ]),
    },
    {
      label: 'невалидный идентификатор упражнения',
      change: (data: MutableData) =>
        (data.sets = [
          {
            ...pendingRep('push-ups', 1),
            exerciseDefinitionId: { toString: () => 'push-ups' } as unknown as EntityId,
          },
        ]),
    },
    {
      label: 'обратная хронология результатов',
      change: (data: MutableData) => {
        data.activeSetIndex = 1;
        data.sets = [skippedRep('push-ups', 1, '07:03'), skippedRep('push-ups', 2, '07:02')];
      },
    },
    {
      label: 'пересекающиеся паузы',
      change: (data: MutableData) =>
        (data.pauseIntervals = [
          { startedAt: time('07:01'), endedAt: time('07:04') },
          { startedAt: time('07:03'), endedAt: time('07:05') },
        ]),
    },
    {
      label: 'результат внутри закрытой паузы',
      change: (data: MutableData) => {
        data.pauseIntervals = [{ startedAt: time('07:01'), endedAt: time('07:05') }];
        data.sets = [skippedRep('push-ups', 1, '07:03')];
      },
    },
    {
      label: 'невалидное время старта',
      change: (data: MutableData) => (data.startedAt = new Date(Number.NaN)),
    },
  ])('отклоняет некорректную rehydrate-структуру: $label', ({ change }) => {
    const data = mutableData();
    change(data);

    expect(() => MorningPhysicalExecution.rehydrate(data)).toThrowError(
      'Данные выполнения физической активации некорректны.',
    );
  });

  it('отклоняет невалидное время перехода', () => {
    const execution = MorningPhysicalExecution.start(
      [repetitionPlan('push-ups', 1, 10)],
      time('07:00'),
    );

    expect(() => execution.pause(new Date(Number.NaN))).toThrowError(
      'Данные выполнения физической активации некорректны.',
    );
  });
});

interface MutableData {
  startedAt: Date;
  completedAt: Date | null;
  pausedAt: Date | null;
  pauseIntervals: { startedAt: Date; endedAt: Date }[];
  activeSetIndex: number;
  sets: MorningPhysicalSetExecution[];
}

function mutableData(): MutableData {
  return {
    startedAt: time('07:00'),
    completedAt: null,
    pausedAt: null,
    pauseIntervals: [],
    activeSetIndex: 0,
    sets: [pendingRep('push-ups', 1)],
  } satisfies MorningPhysicalExecutionRehydrationData;
}

function rehydrateExecution(execution: MorningPhysicalExecution): MorningPhysicalExecution {
  return MorningPhysicalExecution.rehydrate({
    startedAt: execution.startedAt,
    completedAt: execution.completedAt,
    pausedAt: execution.pausedAt,
    pauseIntervals: execution.pauseIntervals,
    activeSetIndex: execution.activeSetIndex,
    sets: execution.sets,
  });
}

function pendingRep(exerciseDefinitionId: string, setNumber: number): MorningPhysicalSetExecution {
  return {
    exerciseDefinitionId: id(exerciseDefinitionId),
    setNumber,
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    status: MORNING_PHYSICAL_SET_STATUS.pending,
    actualReps: null,
    resolvedAt: null,
  };
}

function skippedRep(
  exerciseDefinitionId: string,
  setNumber: number,
  resolvedAt: string,
): MorningPhysicalSetExecution {
  return {
    exerciseDefinitionId: id(exerciseDefinitionId),
    setNumber,
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    status: MORNING_PHYSICAL_SET_STATUS.skipped,
    resolvedAt: time(resolvedAt),
  };
}

function repetitionPlan(
  exerciseDefinitionId: string,
  sets: number,
  targetReps: number,
): MorningPhysicalPlanItem {
  return {
    exerciseDefinitionId: id(exerciseDefinitionId),
    measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
    sets,
    targetReps,
  };
}

function durationPlan(
  exerciseDefinitionId: string,
  sets: number,
  targetDurationSeconds: number,
): MorningPhysicalPlanItem {
  return {
    exerciseDefinitionId: id(exerciseDefinitionId),
    measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
    sets,
    targetDurationSeconds,
  };
}

function id(value: string): EntityId {
  return EntityId.create(value);
}

function time(hhmm: string): Date {
  return new Date(`2026-08-28T${hhmm}:00.000Z`);
}

function setIdentity(set: MorningPhysicalSetExecution): string {
  return `${set.exerciseDefinitionId.toString()}:${set.setNumber}:${set.measurementType}:${set.status}`;
}

function expectDomainError(action: () => unknown, code: string): void {
  try {
    action();
    throw new Error(`expected function to throw ${code}`);
  } catch (error: unknown) {
    const actualCode =
      typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
    expect(actualCode).toBe(code);
  }
}
