import type { SyncEntityRegistration, SyncRegistry } from '../../application/sync/SyncRegistry';
import { LIFE_OS_STORE } from '../persistence/indexed-db/LifeOsIndexedDb';

export const LIFE_OS_SYNC_REGISTRY = Object.freeze([
  registration(
    'direction_indicator',
    LIFE_OS_STORE.directionIndicators,
    'IndexedDbBalanceRepository',
    {
      dependencies: ['direction', 'goal'],
      deletionMode: 'soft_delete',
    },
  ),
  registration(
    'balance_monthly_snapshot',
    LIFE_OS_STORE.balanceMonthlySnapshots,
    'IndexedDbBalanceRepository',
    {
      dependencies: ['sphere', 'direction'],
      idSource: 'deterministic_recommendation_id',
    },
  ),
  registration('planning_period', LIFE_OS_STORE.planningPeriods, 'IndexedDbPlanningRepository', {
    dependencies: ['goal'],
  }),
  registration(
    'period_membership',
    LIFE_OS_STORE.periodMemberships,
    'IndexedDbPlanningRepository',
    { dependencies: ['planning_period', 'goal', 'life_action'] },
  ),
  registration('period_decision', LIFE_OS_STORE.periodDecisions, 'IndexedDbPlanningRepository', {
    dependencies: ['planning_period', 'goal', 'life_action'],
  }),
  registration(
    'contribution_link',
    LIFE_OS_STORE.contributionLinks,
    'IndexedDbPlanningRepository',
    { dependencies: ['goal', 'life_action', 'recurrence_rule'] },
  ),
  registration(
    'progress_contribution',
    LIFE_OS_STORE.progressContributions,
    'IndexedDbPlanningRepository',
    { dependencies: ['goal', 'life_action', 'contribution_link'] },
  ),
  registration('recurrence_rule', LIFE_OS_STORE.recurrenceRules, 'IndexedDbPlanningRepository', {
    dependencies: ['goal'],
  }),

  registration('day', LIFE_OS_STORE.days, 'IndexedDbDayRepository', {
    dependencies: ['sphere'],
  }),
  registration('decision', LIFE_OS_STORE.decisions, 'IndexedDbDecisionRepository', {
    deletionMode: 'soft_delete',
    dependencies: ['goal', 'sphere'],
  }),
  registration('life_action', LIFE_OS_STORE.lifeActions, 'IndexedDbLifeActionRepository', {
    deletionMode: 'archive',
    dependencies: ['decision', 'sphere', 'goal', 'recurrence_rule'],
  }),
  registration('action_session', LIFE_OS_STORE.actionSessions, 'IndexedDbActionSessionRepository', {
    dependencies: ['life_action'],
  }),
  registration('routine_block', LIFE_OS_STORE.routineBlocks, 'IndexedDbRoutineBlockRepository', {
    deletionMode: 'guarded_delete',
    dependencies: ['life_action'],
  }),
  registration(
    'routine_occurrence_override',
    LIFE_OS_STORE.routineOccurrenceOverrides,
    'IndexedDbRoutineOccurrenceOverrideRepository',
    {
      deletionMode: 'guarded_delete',
      dependencies: ['routine_block', 'life_action'],
    },
  ),
  registration(
    'routine_occurrence_execution',
    LIFE_OS_STORE.routineOccurrenceExecutions,
    'IndexedDbRoutineOccurrenceExecutionRepository',
    { dependencies: ['routine_block'] },
  ),
  registration('walk', LIFE_OS_STORE.walks, 'IndexedDbWalkRepository', {
    deletionMode: 'guarded_delete',
    dependencies: ['sphere', 'decision', 'goal', 'life_action', 'routine_block'],
    attachmentFields: ['photo'],
  }),
  registration('walk_capture', LIFE_OS_STORE.walkCaptures, 'IndexedDbWalkCaptureRepository', {
    dependencies: ['walk'],
  }),
  registration('sphere', LIFE_OS_STORE.spheres, 'IndexedDbSphereRepository', {
    idSource: 'fixed_or_crypto_uuid',
    deletionMode: 'archive',
  }),
  registration('journal_entry', LIFE_OS_STORE.journal, 'IndexedDbJournalRepository', {
    idSource: 'domain_event_id',
    recordSchemaVersion: null,
    applyMode: 'append_only',
    dependencies: [
      'day',
      'decision',
      'life_action',
      'action_session',
      'sphere',
      'direction',
      'goal',
    ],
  }),
  registration('direction', LIFE_OS_STORE.directions, 'IndexedDbDirectionRepository', {
    deletionMode: 'archive',
    dependencies: ['sphere'],
  }),
  registration('project', LIFE_OS_STORE.projects, 'IndexedDbProjectRepository', {
    deletionMode: 'archive',
    dependencies: ['sphere', 'direction'],
  }),
  registration('evening_cycle', LIFE_OS_STORE.eveningCycles, 'IndexedDbEveningCycleRepository', {
    dependencies: ['day', 'decision', 'life_action', 'action_session', 'goal'],
  }),
  registration(
    'exercise_definition',
    LIFE_OS_STORE.exerciseDefinitions,
    'IndexedDbExerciseDefinitionRepository',
    { idSource: 'fixed_or_crypto_uuid', deletionMode: 'archive' },
  ),
  registration('tomorrow_plan', LIFE_OS_STORE.tomorrowPlans, 'IndexedDbTomorrowPlanRepository', {
    dependencies: ['evening_cycle', 'day', 'direction', 'decision', 'life_action'],
  }),
  registration(
    'preparation_plan',
    LIFE_OS_STORE.preparationPlans,
    'IndexedDbPreparationPlanRepository',
    {
      dependencies: [
        'evening_cycle',
        'tomorrow_plan',
        'day',
        'life_action',
        'goal',
        'preparation_rule',
      ],
    },
  ),
  registration(
    'preparation_rule',
    LIFE_OS_STORE.preparationRules,
    'IndexedDbPreparationRuleRepository',
  ),
  registration(
    'recommendation_application',
    LIFE_OS_STORE.recommendationApplications,
    'IndexedDbRecommendationApplicationRepository',
    {
      idSource: 'deterministic_recommendation_id',
      dependencies: ['evening_cycle', 'tomorrow_plan', 'preparation_plan', 'decision'],
    },
  ),
  registration('morning_cycle', LIFE_OS_STORE.morningCycles, 'IndexedDbMorningCycleRepository', {
    dependencies: ['day', 'exercise_definition'],
  }),
  registration('goal', LIFE_OS_STORE.goals, 'IndexedDbGoalRepository', {
    deletionMode: 'archive',
    dependencies: ['direction', 'sphere'],
    attachmentFields: ['coverImage'],
  }),
  registration('inbox_idea', LIFE_OS_STORE.inboxIdeas, 'IndexedDbPlannerRepository', {
    dependencies: ['goal', 'life_action'],
    deletionMode: 'archive',
  }),
  registration('focus_period', LIFE_OS_STORE.focusPeriods, 'IndexedDbPlannerRepository', {
    dependencies: ['goal'],
    idSource: 'fixed_or_crypto_uuid',
  }),
  registration('user_settings', 'lifeos.local-settings.v1', 'BrowserLocalSettingsStore', {
    idSource: 'fixed_or_crypto_uuid',
    applyMode: 'local_storage',
    storageKind: 'local_storage',
  }),
] satisfies readonly SyncEntityRegistration[]);

export const LIFE_OS_SYNC_REGISTRY_CONTRACT: SyncRegistry = Object.freeze({
  registrations: LIFE_OS_SYNC_REGISTRY,
});

interface RegistrationOverrides {
  readonly idSource?: SyncEntityRegistration['idSource'];
  readonly recordSchemaVersion?: number | null;
  readonly applyMode?: SyncEntityRegistration['applyMode'];
  readonly deletionMode?: SyncEntityRegistration['deletionMode'];
  readonly dependencies?: readonly SyncEntityRegistration['entityType'][];
  readonly attachmentFields?: readonly string[];
  readonly readiness?: SyncEntityRegistration['readiness'];
  readonly storageKind?: SyncEntityRegistration['storageKind'];
}

function registration(
  entityType: SyncEntityRegistration['entityType'],
  storeName: string,
  localRepository: string,
  overrides: RegistrationOverrides = {},
): SyncEntityRegistration {
  return Object.freeze({
    entityType,
    storeName,
    storageKind: overrides.storageKind ?? 'indexed_db',
    stableIdField: 'id',
    idSource: overrides.idSource ?? 'crypto_uuid',
    recordSchemaVersion:
      overrides.recordSchemaVersion === undefined ? 1 : overrides.recordSchemaVersion,
    localRepository,
    applyMode: overrides.applyMode ?? 'repository',
    deletionMode: overrides.deletionMode ?? 'none',
    dependencies: Object.freeze([...(overrides.dependencies ?? [])]),
    attachmentFields: Object.freeze([...(overrides.attachmentFields ?? [])]),
    readiness: overrides.readiness ?? 'sync_ready',
  });
}
