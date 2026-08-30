import { describe, expect, it, vi } from 'vitest';
import {
  EVENING_CYCLE_COMPLETION,
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  EVENING_MODE_REASON,
  EVENING_STAGE_SKIP_REASON,
  PREPARATION_CATEGORY,
  PREPARATION_PLAN_STATUS,
  PREPARATION_SOURCE_TYPE,
  PreparationItem,
  PreparationPlan,
  TOMORROW_PLANNING_QUALITY,
  TomorrowPlan,
  DayDate,
  EntityId,
  EveningCycle,
  Day,
  createShutdownRecord,
} from '../../domain';
import { PREPARATION_AREA } from '../../domain/preparation';
import { EveningCycleApplicationService } from '../../application/evening-cycle/EveningCycleApplicationService';
import { EveningCycleRecordMapper } from '../../infrastructure/persistence/mappers/EveningCycleRecordMapper';
import { InMemoryEveningCycleRepository } from '../../infrastructure/persistence/InMemoryEveningCycleRepository';
import { InMemoryPreparationPlanRepository } from '../../infrastructure/persistence/InMemoryPreparationPlanRepository';
import {
  eveningModeProgress,
  visiblePreparationItemsForMode,
} from '../../presentation/pages/EveningModePresentation';
import { createDayJournalEntries } from '../../application/journal/createJournalEntries';
import { FakeClock, FakeDayRepository, FakeIdGenerator } from '../helpers/Fakes';

const DATE = DayDate.create('2026-08-14');
const TOMORROW = DayDate.create('2026-08-15');
const NOW = new Date('2026-08-14T23:58:00.000+09:00');
const LATER = new Date('2026-08-15T00:04:00.000+09:00');

describe('E8 — Fast & Emergency Evening Modes', () => {
  it('оставляет NORMAL авторитетным полным маршрутом', () => {
    const cycle = createCycle();
    cycle.start(NOW);
    cycle.beginResolving(NOW);
    cycle.completeResolving(NOW);

    expect(cycle.mode).toBe(EVENING_CYCLE_MODE.normal);
    expect(() => cycle.skipReflection(NOW)).toThrowError(
      expect.objectContaining({ code: 'evening_cycle.normal_reflection_required' }),
    );
  });

  it('не теряет выполненные состояния при NORMAL → QUICK → NORMAL', () => {
    const cycle = createCycle();
    cycle.start(NOW);
    cycle.beginResolving(NOW);
    const versionBeforeSwitch = cycle.version;

    cycle.switchMode(EVENING_CYCLE_MODE.quick, EVENING_MODE_REASON.userSelected, NOW);
    cycle.switchMode(EVENING_CYCLE_MODE.normal, EVENING_MODE_REASON.userSelected, LATER);

    expect(cycle.state).toBe(EVENING_CYCLE_STATE.resolving);
    expect(cycle.startedAt).toEqual(NOW);
    expect(cycle.version).toBe(versionBeforeSwitch + 2);
  });

  it('не разрешает автопереход из EMERGENCY и изменение режима после COMPLETED', () => {
    const cycle = completeSpecial(EVENING_CYCLE_MODE.emergency);

    expect(() =>
      cycle.switchMode(EVENING_CYCLE_MODE.normal, EVENING_MODE_REASON.userSelected, LATER),
    ).toThrowError(expect.objectContaining({ code: 'evening_cycle.completed_mode_immutable' }));
  });

  it('считает прогресс относительно выбранного режима', () => {
    expect(eveningModeProgress(EVENING_CYCLE_MODE.normal, EVENING_CYCLE_STATE.preparing)).toEqual({
      completed: 3,
      total: 5,
    });
    expect(eveningModeProgress(EVENING_CYCLE_MODE.quick, EVENING_CYCLE_STATE.preparing)).toEqual({
      completed: 2,
      total: 4,
    });
    expect(eveningModeProgress(EVENING_CYCLE_MODE.emergency, EVENING_CYCLE_STATE.shutdown)).toEqual(
      { completed: 2, total: 3 },
    );
  });

  it('QUICK фильтрует тот же сохранённый core, а NORMAL показывает required и optional', () => {
    const plan = configuredPreparationPlan();

    expect(
      visiblePreparationItemsForMode(plan.activeItems, EVENING_CYCLE_MODE.quick).map((item) => item.key),
    ).toEqual(['required-completed', 'required-skipped', 'required-pending', 'required-fourth']);
    expect(
      visiblePreparationItemsForMode(plan.activeItems, EVENING_CYCLE_MODE.normal).map((item) => item.key),
    ).toEqual([
      'required-completed',
      'required-skipped',
      'required-pending',
      'required-fourth',
      'optional',
    ]);
  });

  it('EMERGENCY проходит application entry/skip PREPARING без генерации или сохранения PreparationPlan', async () => {
    const cycles = new InMemoryEveningCycleRepository();
    const preparationPlans = new InMemoryPreparationPlanRepository();
    const cycle = emergencyTomorrowCycle();
    const eveningCycle = new EveningCycleApplicationService(
      cycles,
      new FakeDayRepository(),
      new FakeClock(NOW),
      new FakeIdGenerator('emergency-skip'),
    );
    await cycles.createIfAbsent(cycle);
    const createPlan = vi.spyOn(preparationPlans, 'createIfAbsent');
    const savePlan = vi.spyOn(preparationPlans, 'saveIfVersionMatches');

    const entered = await eveningCycle.beginPreparation(DATE);
    const skipped = await eveningCycle.skipPreparation(DATE);

    expect(entered.state).toBe(EVENING_CYCLE_STATE.preparing);
    expect(skipped.skippedStages.at(-1)).toMatchObject({
      stage: EVENING_CYCLE_STATE.preparing,
      reason: EVENING_STAGE_SKIP_REASON.emergencyMode,
    });
    expect(await preparationPlans.findByCycleId(skipped.id)).toBeNull();
    expect(createPlan).not.toHaveBeenCalled();
    expect(savePlan).not.toHaveBeenCalled();
  });

  it('NORMAL → QUICK → NORMAL сохраняет исходы и configured core одного плана', () => {
    const cycle = createCycle();
    const plan = configuredPreparationPlan();
    const coreBefore = plan.requiredCoreKeys;
    const outcomesBefore = plan.items.map((item) => ({ key: item.key, status: item.status }));

    cycle.start(NOW);
    cycle.beginResolving(NOW);
    cycle.switchMode(EVENING_CYCLE_MODE.quick, EVENING_MODE_REASON.userSelected, NOW);
    cycle.switchMode(EVENING_CYCLE_MODE.normal, EVENING_MODE_REASON.userSelected, LATER);

    expect(cycle.mode).toBe(EVENING_CYCLE_MODE.normal);
    expect(plan.requiredCoreKeys).toEqual(coreBefore);
    expect(plan.items.map((item) => ({ key: item.key, status: item.status }))).toEqual(outcomesBefore);
    expect(visiblePreparationItemsForMode(plan.activeItems, cycle.mode)).toHaveLength(5);
  });

  it('EMERGENCY завершает TomorrowPlan с явным MINIMAL и не придумывает данные', () => {
    const plan = createTomorrowPlan();
    plan.setFirstAttentionItem('Открыть LifeOS', NOW);
    plan.completeMinimal(LATER);

    expect(plan.planningQuality).toBe(TOMORROW_PLANNING_QUALITY.minimal);
    expect(plan.firstAttentionItem).toBe('Открыть LifeOS');
    expect(plan.primaryDecisionId).toBeNull();
    expect(plan.minimumOutcome).toBeNull();
    expect(plan.firstActionId).toBeNull();
  });

  it('не допускает пустой минимальный TomorrowPlan', () => {
    expect(() => createTomorrowPlan().completeMinimal(NOW)).toThrowError(
      expect.objectContaining({ code: 'tomorrow_plan.minimal_attention_required' }),
    );
  });

  it.each([EVENING_CYCLE_MODE.quick, EVENING_CYCLE_MODE.emergency] as const)(
    'восстанавливает %s, причину и пропущенные этапы из persistence',
    (mode) => {
      const stored = EveningCycleRecordMapper.toRecord(completeSpecial(mode));
      const restored = EveningCycleRecordMapper.fromRecord(stored);

      expect(restored.mode).toBe(mode);
      expect(restored.modeReason).toBe(EVENING_MODE_REASON.userSelected);
      expect(restored.skippedStages.map((item) => item.reason)).toEqual([
        mode === EVENING_CYCLE_MODE.quick
          ? EVENING_STAGE_SKIP_REASON.quickMode
          : EVENING_STAGE_SKIP_REASON.emergencyMode,
        mode === EVENING_CYCLE_MODE.quick
          ? EVENING_STAGE_SKIP_REASON.quickMode
          : EVENING_STAGE_SKIP_REASON.emergencyMode,
      ]);
    },
  );

  it('отличает SKIPPED от EMERGENCY', () => {
    const skipped = createCycle();
    skipped.skip(NOW);
    const emergency = completeSpecial(EVENING_CYCLE_MODE.emergency);

    expect(skipped.completion).toBe(EVENING_CYCLE_COMPLETION.skipped);
    expect(skipped.startedAt).toBeNull();
    expect(emergency.completion).toBe(EVENING_CYCLE_COMPLETION.completed);
    expect(emergency.startedAt).toEqual(NOW);
  });

  it('сохраняет mode, startedAt, completedAt и факты пропуска в ShutdownRecord', () => {
    const cycle = completeSpecial(EVENING_CYCLE_MODE.quick);
    const record = createShutdownRecord({
      cycleId: cycle.id,
      dayId: cycle.dayId,
      mode: cycle.mode,
      modeReason: cycle.modeReason,
      startedAt: cycle.startedAt!,
      completedAt: cycle.completedAt!,
      skippedStages: cycle.skippedStages,
    });

    expect(record.mode).toBe(EVENING_CYCLE_MODE.quick);
    expect(record.startedAt).toEqual(NOW);
    expect(record.completedAt).toEqual(LATER);
    expect(record.skippedStages).toHaveLength(2);
  });

  it('сохраняет режим и пропущенные этапы в журнале без вывода аналитики', () => {
    const day = Day.openCurrent({
      id: id('day'),
      currentDate: DATE,
      occurredAt: NOW,
      createdEventId: id('day-created'),
      openedEventId: id('day-opened'),
    });
    day.clearUncommittedEvents();
    day.complete(LATER, id('day-completed'), 'Итог');
    const cycle = completeSpecial(EVENING_CYCLE_MODE.quick);

    const [entry] = createDayJournalEntries(day, cycle);
    expect(entry?.metadata).toMatchObject({
      eveningMode: EVENING_CYCLE_MODE.quick,
      eveningCompletion: EVENING_CYCLE_COMPLETION.completed,
      eveningStartedAt: NOW.toISOString(),
      eveningCompletedAt: LATER.toISOString(),
    });
    expect(entry?.metadata?.eveningSkippedStages).toContain('REFLECTING:QUICK_MODE');
  });
});

function createCycle(): EveningCycle {
  return EveningCycle.create({
    id: id('cycle'),
    dayId: id('day'),
    dateKey: DATE,
    occurredAt: NOW,
  });
}

function completeSpecial(
  mode: typeof EVENING_CYCLE_MODE.quick | typeof EVENING_CYCLE_MODE.emergency,
): EveningCycle {
  const cycle = createCycle();
  cycle.start(NOW);
  cycle.switchMode(mode, EVENING_MODE_REASON.userSelected, NOW);
  cycle.beginResolving(NOW);
  cycle.completeResolving(NOW);
  cycle.skipReflection(NOW);
  cycle.completeTomorrowPlanning(NOW);
  cycle.skipPreparation(NOW);
  cycle.complete(LATER);
  return cycle;
}

function createTomorrowPlan(): TomorrowPlan {
  return TomorrowPlan.create({
    id: id('tomorrow-plan'),
    cycleId: id('cycle'),
    sourceDayId: id('day'),
    targetDayId: id('tomorrow-day'),
    targetDateKey: TOMORROW,
    createdAt: NOW,
  });
}

function preparationItem(key: string, required: boolean): PreparationItem {
  return PreparationItem.create({
    id: id(`item-${key}`),
    planId: id('preparation-plan'),
    key,
    area: PREPARATION_AREA.tomorrowStart,
    category: PREPARATION_CATEGORY.physical,
    title: key,
    sourceType: PREPARATION_SOURCE_TYPE.rule,
    sourceId: null,
    required,
  });
}

function emergencyTomorrowCycle(): EveningCycle {
  return EveningCycle.rehydrate({
    id: id('emergency-cycle'),
    dayId: id('emergency-day'),
    dateKey: DATE,
    state: EVENING_CYCLE_STATE.planningTomorrow,
    mode: EVENING_CYCLE_MODE.emergency,
    modeReason: EVENING_MODE_REASON.userSelected,
    startedAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    version: 4,
  });
}

function configuredPreparationPlan(): PreparationPlan {
  const items = [
    preparationItem('required-completed', false).complete(NOW),
    preparationItem('required-skipped', false).skip(NOW, 'Не требуется сегодня'),
    preparationItem('required-pending', false),
    preparationItem('required-fourth', false),
    preparationItem('optional', false),
  ];
  return PreparationPlan.rehydrate({
    id: id('preparation-plan'),
    cycleId: id('cycle'),
    tomorrowPlanId: id('tomorrow-plan'),
    targetDayId: id('tomorrow-day'),
    items,
    requiredCoreKeys: items.slice(0, 4).map((item) => item.key),
    sourceVersion: 4,
    generationSignature: 'modes',
    status: PREPARATION_PLAN_STATUS.inProgress,
    createdAt: NOW,
    updatedAt: NOW,
    completedAt: null,
    version: 3,
  });
}

function id(value: string): EntityId {
  return EntityId.create(value);
}
