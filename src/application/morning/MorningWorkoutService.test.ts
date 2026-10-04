import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EXERCISE_DEFINITION_SOURCE,
  EXERCISE_MEASUREMENT_TYPE,
  ExerciseDefinition,
  MORNING_PHYSICAL_RECOMMENDATION_STATUS,
  SYSTEM_EXERCISE_DEFINITION_SEEDS,
  type MorningCycle,
} from '../../domain';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import type { ExerciseDefinitionRepository } from './ExerciseDefinitionRepository';
import type { MorningCycleRepository } from './MorningCycleRepository';
import { MorningWorkoutService } from './MorningWorkoutService';

describe('MorningWorkoutService', () => {
  it('создаёт готовый комплекс, запускает первый подход и восстанавливает его после reload', async () => {
    const context = createContext('2026-10-04');

    const started = await context.service.start();

    expect(started).toMatchObject({
      status: 'IN_PROGRESS',
      estimatedMinutes: 30,
      totalSets: 15,
      completedSets: 0,
      focusUnlocked: false,
      currentSet: {
        exerciseDefinitionId: 'morning-exercise.warm-up',
        exerciseName: 'Разминка',
        setNumber: 1,
        target: 150,
        measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
      },
    });

    const reloaded = new MorningWorkoutService({
      cycles: context.cycles,
      exercises: context.exercises,
      clock: context.clock,
      ids: context.ids,
      dayId: EntityId.create('day:2026-10-04'),
      date: DayDate.create('2026-10-04'),
    });
    expect(await reloaded.get()).toMatchObject(started);
  });

  it('сериализует двойное завершение и не переносит второй клик на следующий подход', async () => {
    const { service, clock } = createContext('2026-10-04');
    const started = await service.start();
    const command = {
      exerciseDefinitionId: started.currentSet!.exerciseDefinitionId,
      setNumber: started.currentSet!.setNumber,
      actual: started.currentSet!.target,
    };
    clock.advanceMinute();

    const results = await Promise.allSettled([
      service.completeCurrentSet(command),
      service.completeCurrentSet(command),
    ]);

    expect(results.map(({ status }) => status)).toEqual(['fulfilled', 'rejected']);
    expect(results[1]).toMatchObject({
      status: 'rejected',
      reason: { code: 'morning_physical_execution.stale_set' },
    });
    expect(await service.get()).toMatchObject({ completedSets: 1, currentSet: { setNumber: 2 } });
  });

  it('строит предложение, принимает его и использует как план следующего утра', async () => {
    const context = createContext('2026-10-04');
    await context.service.start();
    await completeWorkout(context.service, context.clock);

    const completed = await context.service.get();
    expect(completed).toMatchObject({
      status: 'COMPLETED',
      focusUnlocked: true,
      recommendation: { status: MORNING_PHYSICAL_RECOMMENDATION_STATUS.pending },
    });
    expect(
      completed.recommendation?.changes.find(
        ({ exerciseDefinitionId }) =>
          exerciseDefinitionId === 'morning-exercise.pull-ups',
      ),
    ).toMatchObject({ from: 4, to: 5 });

    context.clock.advanceMinute();
    await context.service.acceptRecommendation();
    const next = createContext('2026-10-05', context);
    const nextStarted = await next.service.start();
    expect(
      nextStarted.items.find(
        ({ exerciseDefinitionId }) =>
          exerciseDefinitionId === 'morning-exercise.pull-ups',
      ),
    ).toMatchObject({ target: 5 });
  });

  it('после отклонения повторяет текущий план, а явный пропуск разблокирует фокус', async () => {
    const context = createContext('2026-10-04');
    await context.service.start();
    await completeWorkout(context.service, context.clock);
    context.clock.advanceMinute();
    await context.service.dismissRecommendation();

    const next = createContext('2026-10-05', context);
    expect((await next.service.start()).items.find(isPullUps)).toMatchObject({ target: 4 });

    const skipped = createContext('2026-10-06', context);
    expect(await skipped.service.skip()).toMatchObject({
      status: 'SKIPPED',
      focusUnlocked: true,
    });
  });
});

async function completeWorkout(service: MorningWorkoutService, clock: MutableClock): Promise<void> {
  while (true) {
    const snapshot = await service.get();
    if (snapshot.status !== 'IN_PROGRESS' || snapshot.currentSet === null) return;
    clock.advanceMinute();
    await service.completeCurrentSet({
      exerciseDefinitionId: snapshot.currentSet.exerciseDefinitionId,
      setNumber: snapshot.currentSet.setNumber,
      actual: snapshot.currentSet.target,
    });
  }
}

function createContext(
  date: string,
  reuse?: MorningWorkoutTestContext,
): MorningWorkoutTestContext {
  const cycles = reuse?.cycles ?? new MemoryCycles();
  const exercises = reuse?.exercises ?? new MemoryExercises();
  const clock = reuse?.clock ?? new MutableClock();
  const ids = reuse?.ids ?? new SequentialIds();
  return {
    cycles,
    exercises,
    clock,
    ids,
    service: new MorningWorkoutService({
      cycles,
      exercises,
      clock,
      ids,
      dayId: EntityId.create(`day:${date}`),
      date: DayDate.create(date),
    }),
  };
}

interface MorningWorkoutTestContext {
  readonly service: MorningWorkoutService;
  readonly cycles: MemoryCycles;
  readonly exercises: MemoryExercises;
  readonly clock: MutableClock;
  readonly ids: SequentialIds;
}

class MemoryCycles implements MorningCycleRepository {
  readonly values = new Map<string, MorningCycle>();

  public async findByDate(date: DayDate): Promise<MorningCycle | null> {
    return this.values.get(date.toString()) ?? null;
  }

  public async latestBefore(date: DayDate): Promise<MorningCycle | null> {
    return (
      [...this.values.values()]
        .filter((cycle) => cycle.dateKey.toString() < date.toString())
        .sort((left, right) => right.dateKey.toString().localeCompare(left.dateKey.toString()))[0] ??
      null
    );
  }

  public async save(cycle: MorningCycle): Promise<void> {
    this.values.set(cycle.dateKey.toString(), cycle);
  }

  public subscribe(): () => void {
    return () => undefined;
  }
}

class MemoryExercises implements ExerciseDefinitionRepository {
  public async list() {
    return SYSTEM_EXERCISE_DEFINITION_SEEDS.map((seed) =>
      ExerciseDefinition.create({
        id: EntityId.create(seed.id),
        name: seed.name,
        measurementType: seed.measurementType,
        source: EXERCISE_DEFINITION_SOURCE.system,
        occurredAt: new Date(0),
      }),
    );
  }
}

class MutableClock implements Clock {
  #now = new Date('2026-10-04T06:00:00.000Z');

  public now(): Date {
    return new Date(this.#now.getTime());
  }

  public advanceMinute(): void {
    this.#now = new Date(this.#now.getTime() + 60_000);
  }
}

class SequentialIds implements IdGenerator {
  #next = 1;

  public generate(): EntityId {
    return EntityId.create(`generated-${this.#next++}`);
  }
}

function isPullUps(item: { readonly exerciseDefinitionId: string }): boolean {
  return item.exerciseDefinitionId === 'morning-exercise.pull-ups';
}
