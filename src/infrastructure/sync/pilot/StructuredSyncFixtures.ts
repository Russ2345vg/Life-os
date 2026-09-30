import {
  ActionSession,
  Day,
  DayDate,
  Decision,
  DecisionTitle,
  completeDiaryEntry,
  createDiaryDraft,
  diaryPeriod,
  Direction,
  EveningCycle,
  ExerciseDefinition,
  Goal,
  JournalEntry,
  LifeAction,
  LifeActionTitle,
  MorningCycle,
  changeMonthlyDirectionFocus,
  PreparationPlan,
  PreparationRule,
  Project,
  reviseDiaryEntry,
  RoutineBlock,
  RoutineBlockRecurrence,
  RoutineOccurrenceExecution,
  RoutineOccurrenceOverride,
  Sphere,
  Walk,
  WalkCapture,
  EntityId,
  TomorrowPlan,
} from '../../../domain';
import * as mappers from '../../persistence/mappers';
import { WalkCaptureRecordMapper } from '../../persistence/mappers/WalkCaptureRecordMapper';
import { SleepScheduleRecordMapper } from '../../persistence/mappers/SleepScheduleRecordMapper';
import { createEmptySleepSchedule, updateSleepSettings } from '../../../domain/sleep/SleepSchedule';
import { DEFAULT_EVENING_RITUAL_SETTINGS } from '../../../application/evening-settings';
import type { SyncEntityType } from '../../../application/sync/SyncRegistry';

// Synthetic records built by the real domain factories, shared by SYNC-04 contract tests.
export function structuredSyncFixtures(): Readonly<
  Record<SyncEntityType, Readonly<Record<string, unknown>>>
> {
  const now = new Date('2026-09-07T00:00:00.000Z');
  const date = DayDate.create('2026-09-07');
  const id = (type: string) => EntityId.create(`sync04-${type}`);
  const common = { now, occurredAt: now, createdAt: now };
  const diaryDraft = createDiaryDraft(diaryPeriod('day', date), now);
  const diaryEntry = completeDiaryEntry(
    reviseDiaryEntry(
      diaryDraft,
      {
        ...diaryDraft.payload,
        productivity: 4,
        energy: 3,
        mood: 5,
        overall: 4,
        worldBetter: 'Помог коллеге\nи позвонил родителям.',
      },
      now,
    ),
    now,
  );
  return {
    memory_event: {
      id: 'sync04-memory',
      occurredOn: '2026-09-07',
      title: 'Важный момент',
      body: 'Запомнить',
      kind: 'moment',
      isHighlight: true,
      context: null,
      diarySource: null,
      photo: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      deletedAt: null,
      version: 1,
    },
    monthly_direction_focus: {
      ...mappers.MonthlyDirectionFocusRecordMapper.toRecord(
        changeMonthlyDirectionFocus(null, '2026-09', 'sync04-direction', now),
      ),
    },
    time_capacity: {
      schemaVersion: 1,
      id: 'time-capacity',
      weekdays: [360, 360, 360, 360, 300, null, null],
      version: 1,
    },
    task_scenario: {
      id: 'sync04-task-scenario',
      title: 'За компьютером',
      actionIds: ['sync04-life_action'],
      date: null,
      archived: false,
      updatedAt: now.toISOString(),
      version: 1,
      schemaVersion: 1,
    },
    direction_indicator: {
      id: 'indicator:sync04-direction:0',
      directionId: 'sync04-direction',
      name: 'Состояние',
      type: 'rating',
      value: 7,
      target: null,
      importance: 'high',
      sourceType: 'manual',
      sourceGoalId: null,
      removed: false,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
      schemaVersion: 1,
    },
    balance_monthly_snapshot: {
      id: 'monthly:sphere:sync04-sphere:2026-09',
      entityId: 'sync04-sphere',
      entityType: 'sphere',
      month: '2026-09',
      automaticScore: 7,
      manualScore: null,
      effectiveScore: 7,
      desiredLevel: 8,
      attentionNeed: 2,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
      schemaVersion: 1,
    },
    planning_period: {
      id: 'week:2026-09-07',
      kind: 'week',
      startDate: '2026-09-07',
      endDate: '2026-09-13',
      outcome: 'Result',
      primaryGoalId: null,
      version: 1,
      schemaVersion: 1,
      updatedAt: now.toISOString(),
    },
    period_membership: {
      id: 'sync04-membership',
      periodId: 'week:2026-09-07',
      entityType: 'goal',
      entityId: 'sync04-goal',
      focused: false,
      removed: false,
      version: 1,
      schemaVersion: 1,
      updatedAt: now.toISOString(),
    },
    period_decision: {
      id: 'sync04-period-decision',
      periodId: 'week:2026-09-07',
      entityType: 'goal',
      entityId: 'sync04-goal',
      decision: 'stop',
      targetPeriodId: null,
      statusAtDecision: 'active',
      version: 1,
      schemaVersion: 1,
      updatedAt: now.toISOString(),
    },
    recurrence_rule: {
      id: 'sync04-recurrence',
      title: 'Repeat',
      goalId: null,
      priority: null,
      startDate: '2026-09-07',
      endDate: null,
      maxCompletions: null,
      paused: false,
      pauseUntil: null,
      schedule: { kind: 'daily' },
      revision: 1,
      effectiveFrom: '2026-09-07',
      version: 1,
      schemaVersion: 1,
      updatedAt: now.toISOString(),
    },
    contribution_link: {
      id: 'sync04-link',
      sourceType: 'rule',
      sourceId: 'sync04-recurrence',
      goalId: 'sync04-goal',
      mode: 'fixed',
      amount: 1,
      effectiveFrom: now.toISOString(),
      removed: false,
      version: 1,
      schemaVersion: 1,
      updatedAt: now.toISOString(),
    },
    progress_contribution: {
      id: 'sync04-contribution',
      goalId: 'sync04-goal',
      actionId: null,
      linkId: null,
      completionKey: null,
      source: 'manual',
      amount: 1,
      effectiveDate: '2026-09-07',
      occurredAt: now.toISOString(),
      voided: false,
      reason: 'Test',
      version: 1,
      schemaVersion: 1,
      updatedAt: now.toISOString(),
    },
    day: {
      ...mappers.DayRecordMapper.toRecord(
        Day.createCurrentPlanned({
          id: id('day'),
          currentDate: date,
          occurredAt: now,
          createdEventId: id('day-event'),
        }),
      ),
    },
    decision: {
      ...mappers.DecisionRecordMapper.toRecord(
        Decision.createDraft({
          id: id('decision'),
          title: DecisionTitle.create('Synthetic decision'),
          kind: 'additional',
          projectId: id('goal'),
          occurredAt: now,
          eventId: id('decision-event'),
        }),
      ),
    },
    diary_entry: {
      ...mappers.DiaryEntryRecordMapper.toRecord({ ...diaryEntry, version: 1 }),
    },
    life_action: {
      ...mappers.LifeActionRecordMapper.toRecord(
        LifeAction.createDraft({
          id: id('life_action'),
          title: LifeActionTitle.create('Synthetic action'),
          decisionId: id('decision'),
          createdAt: now,
          eventId: id('action-event'),
        }),
      ),
    },
    action_session: {
      ...mappers.ActionSessionRecordMapper.toRecord(
        ActionSession.start({
          id: id('action_session'),
          lifeActionId: id('life_action'),
          startedAt: now,
          eventId: id('session-event'),
        }),
      ),
    },
    sphere: {
      ...mappers.SphereRecordMapper.toRecord(
        Sphere.create({ id: id('sphere'), name: 'Synthetic sphere', now }),
      ),
    },
    direction: {
      ...mappers.DirectionRecordMapper.toRecord(
        Direction.create({
          id: id('direction'),
          name: 'Synthetic direction',
          sphereId: id('sphere'),
          now,
        }),
      ),
    },
    project: {
      ...mappers.ProjectRecordMapper.toRecord(
        Project.create({
          id: id('project'),
          title: 'Synthetic project',
          directionId: id('direction'),
          now,
        }),
      ),
    },
    goal: {
      ...mappers.GoalRecordMapper.toRecord(
        Goal.create({ id: id('goal'), title: 'Synthetic goal', directionId: id('direction'), now }),
      ),
    },
    journal_entry: {
      ...mappers.JournalEntryRecordMapper.toRecord(
        JournalEntry.create({
          id: id('journal_entry'),
          type: 'decisionCreated',
          subjectType: 'Decision',
          subjectId: id('decision'),
          occurredAt: now,
          createdAt: now,
          effectiveDate: date,
          labelAtEvent: 'Synthetic journal',
        }),
      ),
    },
    routine_block: {
      ...mappers.RoutineBlockRecordMapper.toRecord(
        RoutineBlock.create({
          id: id('routine_block'),
          anchorDate: date,
          title: 'Synthetic routine',
          startTime: '09:00',
          endTime: '10:00',
          category: 'work',
          recurrence: RoutineBlockRecurrence.create('daily'),
          required: false,
          now,
        }),
      ),
    },
    routine_occurrence_override: {
      ...mappers.RoutineOccurrenceOverrideRecordMapper.toRecord(
        RoutineOccurrenceOverride.create({
          id: id('routine_occurrence_override'),
          routineBlockId: id('routine_block'),
          occurrenceDate: date,
          type: 'skipped',
          now,
        }),
      ),
    },
    routine_occurrence_execution: {
      ...mappers.RoutineOccurrenceExecutionRecordMapper.toRecord(
        RoutineOccurrenceExecution.start({
          id: id('routine_occurrence_execution'),
          routineBlockId: id('routine_block'),
          occurrenceDate: date,
          occurredAt: now,
        }),
      ),
    },
    walk: {
      ...mappers.WalkRecordMapper.toRecord(
        Walk.create({ id: id('walk'), date, type: 'mindful', now }),
      ),
    },
    walk_capture: {
      ...WalkCaptureRecordMapper.toRecord(
        WalkCapture.create({
          id: id('walk_capture'),
          walkId: id('walk'),
          content: 'Synthetic capture',
          capturedAt: now,
          walkElapsedMs: 0,
        }),
      ),
    },
    evening_cycle: {
      ...mappers.EveningCycleRecordMapper.toRecord(
        EveningCycle.create({
          id: id('evening_cycle'),
          dayId: id('day'),
          dateKey: date,
          occurredAt: now,
        }),
      ),
    },
    morning_cycle: {
      ...mappers.MorningCycleRecordMapper.toRecord(
        MorningCycle.create({
          id: id('morning_cycle'),
          dayId: id('day'),
          dateKey: date,
          occurredAt: now,
        }),
      ),
    },
    sleep_schedule: {
      coldShowerEntries: [
        {
          date: '2026-09-08',
          status: 'completed',
          energy: 4,
          feeling: 'better',
          skipReason: null,
          recordedAt: now.toISOString(),
          updatedAt: now.toISOString(),
        },
      ],
      ...SleepScheduleRecordMapper.toRecord(
        updateSleepSettings(
          createEmptySleepSchedule(),
          {
            bedtime: '22:00',
            wakeTime: '07:00',
            timeZone: 'Asia/Chita',
            enabled: true,
          },
          now,
        ),
      ),
    },
    exercise_definition: {
      ...mappers.ExerciseDefinitionRecordMapper.toRecord(
        ExerciseDefinition.create({
          id: id('exercise_definition'),
          name: 'Synthetic exercise',
          source: 'CUSTOM',
          measurementType: 'REPETITIONS',
          occurredAt: now,
        }),
      ),
    },
    tomorrow_plan: {
      ...mappers.TomorrowPlanRecordMapper.toRecord(
        TomorrowPlan.create({
          id: id('tomorrow_plan'),
          cycleId: id('evening_cycle'),
          sourceDayId: id('day'),
          targetDayId: id('target-day'),
          targetDateKey: DayDate.create('2026-09-08'),
          createdAt: now,
        }),
      ),
    },
    preparation_plan: {
      ...mappers.PreparationPlanRecordMapper.toRecord(
        PreparationPlan.create({
          id: id('preparation_plan'),
          cycleId: id('evening_cycle'),
          tomorrowPlanId: id('tomorrow_plan'),
          targetDayId: id('target-day'),
          sourceVersion: 1,
          generationSignature: 'synthetic',
          createdAt: now,
        }),
      ),
    },
    preparation_rule: {
      ...mappers.PreparationRuleRecordMapper.toRecord(
        PreparationRule.create({
          id: id('preparation_rule'),
          condition: 'HAS_LINKED_PROJECT',
          conditionValue: null,
          category: 'DIGITAL',
          title: 'Synthetic rule',
          required: false,
          ...common,
        }),
      ),
    },
    recommendation_application: {
      id: 'sync04-recommendation_application',
      status: 'PENDING',
      targetType: null,
      targetId: null,
      resultMessage: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      appliedAt: null,
      dismissedAt: null,
      version: 1,
      schemaVersion: 1,
    },
    inbox_idea: {
      id: 'sync04-inbox',
      title: 'Idea',
      note: null,
      status: 'inbox',
      targetId: null,
      targetType: null,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      version: 1,
      schemaVersion: 1,
    },
    focus_period: {
      id: 'focus:week:2026-09-07',
      startDate: '2026-09-07',
      endDate: '2026-09-13',
      goals: [{ goalId: 'sync04-goal', role: 'primary' }],
      updatedAt: now.toISOString(),
      version: 1,
      schemaVersion: 1,
    },
    user_settings: {
      id: 'lifeos-user-settings',
      schemaVersion: 1,
      eveningRitual: DEFAULT_EVENING_RITUAL_SETTINGS,
    },
  };
}
