import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  EXERCISE_DEFINITION_SOURCE,
  EXERCISE_MEASUREMENT_TYPE,
  ExerciseDefinition,
  MORNING_CYCLE_STATE,
  MORNING_PHYSICAL_STATUS,
  MorningCycle,
  SYSTEM_EXERCISE_DEFINITION_SEEDS,
  type MorningPhysicalPlanItem,
} from '../../domain';
import {
  InMemoryExerciseDefinitionRepository,
  InMemoryMorningCycleRepository,
} from '../../infrastructure';
import { FakeCurrentDateProvider } from '../../test/helpers/Fakes';
import { GetMorningPhysicalActivationOverview } from './GetMorningPhysicalActivationOverview';

const TODAY = DayDate.create('2026-08-27');
const YESTERDAY = DayDate.create('2026-08-26');
const NOW = new Date('2026-08-27T07:10:00.000+09:00');

describe('GetMorningPhysicalActivationOverview', () => {
  it('отдаёт активную библиотеку в системном порядке и пустую реальную сводку', async () => {
    const definitions = systemDefinitions();
    const cycles = new InMemoryMorningCycleRepository();
    await cycles.createIfAbsent(activeCycle(TODAY, []));

    const overview = await query(cycles, definitions, TODAY).execute(TODAY);

    expect(overview.library.map(({ name }) => name)).toEqual([
      'Отжимания',
      'Подтягивания',
      'Приседания',
      'Планка',
      'Пресс',
    ]);
    expect(overview.library.every(({ selected }) => !selected)).toBe(true);
    expect(overview.summary).toEqual({ selectedCount: 0, totalSets: 0, estimatedMinutes: 0 });
    expect(overview).toMatchObject({ mutable: true, canEditPlan: true, canCreateCustom: true });
  });

  it('сохраняет порядок выбранных строк, точный тип цели и вычисляет шесть подходов', async () => {
    const definitions = systemDefinitions();
    const cycles = new InMemoryMorningCycleRepository();
    await cycles.createIfAbsent(
      activeCycle(TODAY, [
        {
          exerciseDefinitionId: EntityId.create('morning-exercise.push-ups'),
          measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
          sets: 3,
          targetReps: 15,
        },
        {
          exerciseDefinitionId: EntityId.create('morning-exercise.pull-ups'),
          measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
          sets: 3,
          targetReps: 6,
        },
      ]),
    );

    const overview = await query(cycles, definitions, TODAY).execute(TODAY);

    expect(overview.selectedItems).toEqual([
      {
        id: EntityId.create('morning-exercise.push-ups'),
        name: 'Отжимания',
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
        sets: 3,
        targetReps: 15,
      },
      {
        id: EntityId.create('morning-exercise.pull-ups'),
        name: 'Подтягивания',
        measurementType: EXERCISE_MEASUREMENT_TYPE.repetitions,
        sets: 3,
        targetReps: 6,
      },
    ]);
    expect(overview.summary).toEqual({ selectedCount: 2, totalSets: 6, estimatedMinutes: 12 });
  });

  it('разрешает выбранное архивное определение, но скрывает его из библиотеки', async () => {
    const archived = ExerciseDefinition.create({
      id: EntityId.create('custom-hang'),
      name: 'Вис на перекладине',
      measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
      source: EXERCISE_DEFINITION_SOURCE.custom,
      occurredAt: NOW,
    });
    archived.archive(new Date(NOW.getTime() + 1_000));
    const definitions = new InMemoryExerciseDefinitionRepository([
      ...systemDefinitionsList(),
      archived,
    ]);
    const cycles = new InMemoryMorningCycleRepository();
    await cycles.createIfAbsent(
      activeCycle(TODAY, [
        {
          exerciseDefinitionId: archived.id,
          measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
          sets: 3,
          targetDurationSeconds: 45,
        },
      ]),
    );

    const overview = await query(cycles, definitions, TODAY).execute(TODAY);

    expect(overview.library.some(({ id }) => id.equals(archived.id))).toBe(false);
    expect(overview.selectedItems[0]).toMatchObject({
      name: 'Вис на перекладине',
      targetDurationSeconds: 45,
    });
  });

  it('делает историческую дату и начавшееся выполнение физики read-only', async () => {
    const definitions = systemDefinitions();
    const cycles = new InMemoryMorningCycleRepository();
    await cycles.createIfAbsent(activeCycle(YESTERDAY, []));
    const executing = activeCycle(TODAY, [
      {
        exerciseDefinitionId: EntityId.create('morning-exercise.plank'),
        measurementType: EXERCISE_MEASUREMENT_TYPE.duration,
        sets: 3,
        targetDurationSeconds: 30,
      },
    ]);
    executing.startPhysicalExecution(NOW);
    await cycles.createIfAbsent(executing);

    const historical = await query(cycles, definitions, TODAY).execute(YESTERDAY);
    const current = await query(cycles, definitions, TODAY).execute(TODAY);

    expect(historical).toMatchObject({
      mutable: false,
      canEditPlan: false,
      canCreateCustom: false,
    });
    expect(current).toMatchObject({ mutable: true, canEditPlan: false, canCreateCustom: false });
  });
});

function query(
  cycles: InMemoryMorningCycleRepository,
  definitions: InMemoryExerciseDefinitionRepository,
  currentDate: DayDate,
): GetMorningPhysicalActivationOverview {
  return new GetMorningPhysicalActivationOverview(
    cycles,
    definitions,
    new FakeCurrentDateProvider(currentDate),
  );
}

function systemDefinitions(): InMemoryExerciseDefinitionRepository {
  return new InMemoryExerciseDefinitionRepository(systemDefinitionsList());
}

function systemDefinitionsList(): readonly ExerciseDefinition[] {
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

function activeCycle(
  date: DayDate,
  physicalPlanItems: readonly MorningPhysicalPlanItem[],
): MorningCycle {
  return MorningCycle.rehydrate({
    id: EntityId.create(`cycle-${date.toString()}`),
    dayId: EntityId.create(`day-${date.toString()}`),
    dateKey: date,
    state: MORNING_CYCLE_STATE.inProgress,
    startedAt: NOW,
    finishedAt: null,
    shortenedMode: false,
    stageStates: [],
    waterCompletedAt: null,
    waterAmountMl: null,
    physicalStatus:
      physicalPlanItems.length === 0
        ? MORNING_PHYSICAL_STATUS.notConfigured
        : MORNING_PHYSICAL_STATUS.ready,
    physicalUpdatedAt: physicalPlanItems.length === 0 ? null : NOW,
    physicalPlanItems,
    updatedAt: NOW,
    version: 2,
  });
}
