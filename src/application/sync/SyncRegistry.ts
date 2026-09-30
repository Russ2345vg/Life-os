export type SyncEntityType =
  | 'direction_indicator'
  | 'balance_monthly_snapshot'
  | 'planning_period'
  | 'period_membership'
  | 'period_decision'
  | 'contribution_link'
  | 'progress_contribution'
  | 'recurrence_rule'
  | 'day'
  | 'decision'
  | 'diary_entry'
  | 'memory_event'
  | 'life_action'
  | 'time_capacity'
  | 'action_session'
  | 'routine_block'
  | 'routine_occurrence_override'
  | 'routine_occurrence_execution'
  | 'walk'
  | 'walk_capture'
  | 'sphere'
  | 'journal_entry'
  | 'direction'
  | 'project'
  | 'evening_cycle'
  | 'exercise_definition'
  | 'tomorrow_plan'
  | 'preparation_plan'
  | 'preparation_rule'
  | 'recommendation_application'
  | 'morning_cycle'
  | 'monthly_direction_focus'
  | 'sleep_schedule'
  | 'goal'
  | 'inbox_idea'
  | 'focus_period'
  | 'task_scenario'
  | 'user_settings';

export const SYNC_ENTITY_TYPES: readonly SyncEntityType[] = Object.freeze([
  'direction_indicator',
  'balance_monthly_snapshot',
  'planning_period',
  'period_membership',
  'period_decision',
  'contribution_link',
  'progress_contribution',
  'recurrence_rule',
  'day',
  'decision',
  'diary_entry',
  'memory_event',
  'life_action',
  'time_capacity',
  'action_session',
  'routine_block',
  'routine_occurrence_override',
  'routine_occurrence_execution',
  'walk',
  'walk_capture',
  'sphere',
  'journal_entry',
  'direction',
  'project',
  'evening_cycle',
  'exercise_definition',
  'tomorrow_plan',
  'preparation_plan',
  'preparation_rule',
  'recommendation_application',
  'morning_cycle',
  'monthly_direction_focus',
  'sleep_schedule',
  'goal',
  'inbox_idea',
  'focus_period',
  'task_scenario',
  'user_settings',
]);

export type SyncApplyMode = 'repository' | 'unit_of_work' | 'append_only' | 'local_storage';
export type SyncDeletionMode = 'none' | 'archive' | 'soft_delete' | 'guarded_delete';
export type SyncRegistrationReadiness =
  'registered' | 'pilot_ready' | 'requires_later_adapter' | 'sync_ready';
export type SyncIdSource =
  | 'crypto_uuid'
  | 'fixed_or_crypto_uuid'
  | 'domain_event_id'
  | 'deterministic_recommendation_id'
  | 'deterministic_period_id';

export interface SyncEntityRegistration {
  readonly entityType: SyncEntityType;
  readonly storeName: string;
  readonly storageKind: 'indexed_db' | 'local_storage';
  readonly stableIdField: 'id';
  readonly idSource: SyncIdSource;
  readonly recordSchemaVersion: number | null;
  readonly localRepository: string;
  readonly applyMode: SyncApplyMode;
  readonly deletionMode: SyncDeletionMode;
  readonly dependencies: readonly SyncEntityType[];
  readonly attachmentFields: readonly string[];
  readonly readiness: SyncRegistrationReadiness;
}

export interface SyncRegistry {
  readonly registrations: readonly SyncEntityRegistration[];
}
