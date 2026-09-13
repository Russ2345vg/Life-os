import { describe, expect, it } from 'vitest';
import { LIFE_OS_SYNC_REGISTRY } from './LifeOsSyncRegistry';

const EXPECTED_ENTITY_TYPES = [
  'action_session',
  'day',
  'decision',
  'direction',
  'evening_cycle',
  'exercise_definition',
  'goal',
  'journal_entry',
  'life_action',
  'morning_cycle',
  'preparation_plan',
  'preparation_rule',
  'project',
  'recommendation_application',
  'routine_block',
  'routine_occurrence_execution',
  'routine_occurrence_override',
  'sphere',
  'tomorrow_plan',
  'user_settings',
  'walk',
  'walk_capture',
] as const;

const EXPECTED_ENTITY_STORES = {
  action_session: 'actionSessions',
  day: 'days',
  decision: 'decisions',
  direction: 'directions',
  evening_cycle: 'eveningCycles',
  exercise_definition: 'exerciseDefinitions',
  goal: 'goals',
  journal_entry: 'journal',
  life_action: 'lifeActions',
  morning_cycle: 'morningCycles',
  preparation_plan: 'preparationPlans',
  preparation_rule: 'preparationRules',
  project: 'projects',
  recommendation_application: 'recommendationApplications',
  routine_block: 'routineBlocks',
  routine_occurrence_execution: 'routineOccurrenceExecutions',
  routine_occurrence_override: 'routineOccurrenceOverrides',
  sphere: 'spheres',
  tomorrow_plan: 'tomorrowPlans',
  walk: 'walks',
  walk_capture: 'walkCaptures',
  user_settings: 'lifeos.local-settings.v1',
} as const;

describe('LIFE_OS_SYNC_REGISTRY', () => {
  it('declares the future Goal dependency while retaining legacy action dependencies', () => {
    expect(registration('life_action')).toMatchObject({
      recordSchemaVersion: 1,
      dependencies: ['decision', 'sphere', 'goal'],
    });
  });

  it('registers exactly the durable entity families discovered in the current database', () => {
    expect(LIFE_OS_SYNC_REGISTRY.map(({ entityType }) => entityType).sort()).toEqual(
      EXPECTED_ENTITY_TYPES,
    );
    expect(
      Object.fromEntries(
        LIFE_OS_SYNC_REGISTRY.map(({ entityType, storeName }) => [entityType, storeName]),
      ),
    ).toEqual(EXPECTED_ENTITY_STORES);
    expect(LIFE_OS_SYNC_REGISTRY.every(({ stableIdField }) => stableIdField === 'id')).toBe(true);
    expect(
      LIFE_OS_SYNC_REGISTRY.filter(({ storageKind }) => storageKind === 'indexed_db').every(
        ({ storeName }) => !storeName.startsWith('sync_'),
      ),
    ).toBe(true);
    expect(
      LIFE_OS_SYNC_REGISTRY.filter(({ storageKind }) => storageKind === 'indexed_db').map(
        ({ storeName }) => storeName,
      ),
    ).toHaveLength(21);
    expect(LIFE_OS_SYNC_REGISTRY.every(({ readiness }) => readiness === 'sync_ready')).toBe(true);
  });

  it('records the current exceptional schema, identity, deletion and media contracts', () => {
    expect(registration('journal_entry')).toMatchObject({
      recordSchemaVersion: null,
      applyMode: 'append_only',
      deletionMode: 'none',
      readiness: 'sync_ready',
    });
    expect(registration('recommendation_application')).toMatchObject({
      idSource: 'deterministic_recommendation_id',
      readiness: 'sync_ready',
    });
    expect(registration('decision')).toMatchObject({ deletionMode: 'soft_delete' });
    expect(registration('routine_block')).toMatchObject({ deletionMode: 'guarded_delete' });
    expect(registration('goal').attachmentFields).toEqual(['coverImage']);
    expect(registration('walk').attachmentFields).toEqual(['photo']);
    expect(registration('user_settings')).toMatchObject({
      storageKind: 'local_storage',
      applyMode: 'local_storage',
      idSource: 'fixed_or_crypto_uuid',
      recordSchemaVersion: 1,
    });
  });
});

function registration(entityType: (typeof EXPECTED_ENTITY_TYPES)[number]) {
  const found = LIFE_OS_SYNC_REGISTRY.find((entry) => entry.entityType === entityType);
  expect(found).toBeDefined();
  return found!;
}
