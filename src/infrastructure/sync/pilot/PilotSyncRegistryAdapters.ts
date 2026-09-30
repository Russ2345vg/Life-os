import {
  DirectionIndicatorRecordMapper,
  BalanceMonthlySnapshotRecordMapper,
} from '../../persistence/BalanceRecordMappers';
import {
  PlanningPeriodRecordMapper,
  PeriodMembershipRecordMapper,
  PeriodDecisionRecordMapper,
  ContributionLinkRecordMapper,
  ProgressContributionRecordMapper,
  RecurrenceRuleRecordMapper,
} from '../../persistence/PlanningRecordMappers';
import {
  InboxIdeaRecordMapper,
  FocusPeriodRecordMapper,
} from '../../persistence/PlannerRecordMappers';
import { DomainError } from '../../../shared/errors/DomainError';
import { TaskScenarioRecordMapper } from '../../persistence/TaskScenarioRecordMapper';
import { normalizeLegacyGoalLinks } from '../../../shared/legacyGoalIdentity';
import { parseEveningRitualSettings } from '../../../application/evening-settings';
import type { PilotEntityType } from '../../../application/sync/pilot';
import { sortJsonValue } from '../../../application/sync/pilot/PilotSyncProtocol';
import type { SyncEntityRegistration } from '../../../application/sync/SyncRegistry';
import {
  ActionSessionRecordMapper,
  DayRecordMapper,
  DecisionRecordMapper,
  DiaryEntryRecordMapper,
  DirectionRecordMapper,
  EveningCycleRecordMapper,
  ExerciseDefinitionRecordMapper,
  GoalRecordMapper,
  JournalEntryRecordMapper,
  LifeActionRecordMapper,
  MorningCycleRecordMapper,
  MonthlyDirectionFocusRecordMapper,
  PreparationPlanRecordMapper,
  PreparationRuleRecordMapper,
  ProjectRecordMapper,
  RecommendationApplicationRecordMapper,
  RoutineBlockRecordMapper,
  RoutineOccurrenceExecutionRecordMapper,
  RoutineOccurrenceOverrideRecordMapper,
  SphereRecordMapper,
  TomorrowPlanRecordMapper,
  WalkRecordMapper,
} from '../../persistence/mappers';
import { WalkCaptureRecordMapper } from '../../persistence/mappers/WalkCaptureRecordMapper';
import { SleepScheduleRecordMapper } from '../../persistence/mappers/SleepScheduleRecordMapper';
import { MemoryEventRecordMapper } from '../../persistence/mappers/MemoryEventRecordMapper';
import { LIFE_OS_SYNC_REGISTRY } from '../LifeOsSyncRegistry';
import { attachmentReference } from '../../../application/sync/attachments/AttachmentContracts';
import {
  parseTimeCapacityRecord,
  type TimeCapacityRecord,
} from '../../../application/time/TimeCapacityService';

type PilotRegistration = Omit<SyncEntityRegistration, 'entityType'> & {
  readonly entityType: PilotEntityType;
};

export interface SyncRelationshipReference {
  readonly entityType: PilotEntityType;
  readonly objectId: string;
  readonly required: boolean;
}

interface PilotAdapterBinding {
  normalize(value: unknown): Readonly<Record<string, unknown>>;
  prepare(
    value: Readonly<Record<string, unknown>>,
    existing?: Readonly<Record<string, unknown>>,
  ): Readonly<Record<string, unknown>>;
  references(value: Readonly<Record<string, unknown>>): readonly SyncRelationshipReference[];
}

export interface PilotRuntimeRegistration {
  readonly registration: PilotRegistration;
  readonly normalize: PilotAdapterBinding['normalize'];
  readonly prepare: PilotAdapterBinding['prepare'];
  readonly references: PilotAdapterBinding['references'];
}

interface Mapper<TDomain, TRecord extends object> {
  fromRecord(value: TRecord): TDomain;
  toRecord(value: TDomain): TRecord;
}

function mapped<TDomain, TRecord extends object>(
  mapper: Mapper<TDomain, TRecord>,
  references: PilotAdapterBinding['references'] = noReferences,
  preserveUnknown = false,
): PilotAdapterBinding {
  const roundTrip = (value: unknown): Readonly<Record<string, unknown>> => ({
    ...(preserveUnknown ? (isRecord(value) ? value : {}) : {}),
    ...asRecord(mapper.toRecord(mapper.fromRecord(value as TRecord))),
  });
  return {
    normalize: (value) =>
      withoutFields(roundTrip(withValidationVersion(value)), [
        'version',
        ...(preserveUnknown
          ? [
              'need',
              'priority',
              'occurrence',
              'completionGeneration',
              'completedOn',
              'expectedContributions',
              'parentActionId',
              'directionId',
              'estimateMinutes',
              'scheduledStartMinute',
              'scheduledDurationMinutes',
              'goalIdAtStart',
            ].filter((field) => !Object.hasOwn(isRecord(value) ? value : {}, field))
          : []),
      ]),
    prepare: (value, existing) =>
      roundTrip({
        ...(preserveUnknown ? existing : {}),
        ...value,
        version: receiverVersion(existing),
      }),
    references,
  };
}

function lifeActionMapped(): PilotAdapterBinding {
  const binding = mapped(
    LifeActionRecordMapper,
    (record) => [
      ...optional(record, 'decisionId', 'decision'),
      ...optional(record, 'directionId', 'direction'),
      ...optional(record, 'sphereId', 'sphere'),
      ...optional(record, 'goalId', 'goal'),
      ...optional(record, 'parentActionId', 'life_action'),
      ...(isRecord(record.occurrence)
        ? optional(record.occurrence, 'ruleId', 'recurrence_rule')
        : []),
    ],
    true,
  );
  return {
    ...binding,
    normalize: (value) =>
      binding.normalize(
        isRecord(value) && value.plannedDate === null
          ? { ...value, scheduledStartMinute: null, scheduledDurationMinutes: null }
          : value,
      ),
    prepare: (value, existing) =>
      binding.prepare(
        value.plannedDate === null
          ? { ...value, scheduledStartMinute: null, scheduledDurationMinutes: null }
          : value,
        existing,
      ),
  };
}

function balanceMapped<TDomain, TRecord extends object>(
  mapper: Mapper<TDomain, TRecord>,
  fields: readonly string[],
  references: PilotAdapterBinding['references'] = noReferences,
): PilotAdapterBinding {
  const binding = mapped(mapper, references, true);
  return {
    ...binding,
    normalize: (value) =>
      withoutFields(
        binding.normalize(value),
        fields.filter((field) => !Object.hasOwn(isRecord(value) ? value : {}, field)),
      ),
  };
}

const PILOT_BINDINGS: Readonly<Record<PilotEntityType, PilotAdapterBinding>> = Object.freeze({
  direction_indicator: mapped(
    DirectionIndicatorRecordMapper,
    (r) => [
      ...required(r, 'directionId', 'direction'),
      ...(r.sourceGoalId === null ? [] : orphanSafe(r, 'sourceGoalId', 'goal')),
    ],
    true,
  ),
  balance_monthly_snapshot: mapped(
    BalanceMonthlySnapshotRecordMapper,
    (r) => orphanSafe(r, 'entityId', r.entityType === 'sphere' ? 'sphere' : 'direction'),
    true,
  ),
  planning_period: mapped(PlanningPeriodRecordMapper, (r) => optional(r, 'primaryGoalId', 'goal')),
  recurrence_rule: mapped(RecurrenceRuleRecordMapper, (r) => [
    ...optional(r, 'goalId', 'goal'),
    ...optional(r, 'directionId', 'direction'),
    ...optional(r, 'sphereId', 'sphere'),
  ]),
  period_membership: mapped(PeriodMembershipRecordMapper, (r) => [
    ...optional(r, 'periodId', 'planning_period'),
    ...optional(
      r,
      'entityId',
      r.entityType === 'goal'
        ? 'goal'
        : r.entityType === 'rule'
          ? 'recurrence_rule'
          : 'life_action',
    ),
  ]),
  period_decision: mapped(PeriodDecisionRecordMapper, (r) => [
    ...optional(r, 'periodId', 'planning_period'),
    ...optional(r, 'targetPeriodId', 'planning_period'),
    ...optional(
      r,
      'entityId',
      r.entityType === 'goal'
        ? 'goal'
        : r.entityType === 'rule'
          ? 'recurrence_rule'
          : 'life_action',
    ),
  ]),
  contribution_link: mapped(ContributionLinkRecordMapper, (r) => [
    ...optional(r, 'goalId', 'goal'),
    ...optional(r, 'sourceId', r.sourceType === 'rule' ? 'recurrence_rule' : 'life_action'),
  ]),
  progress_contribution: mapped(ProgressContributionRecordMapper, (r) => [
    ...optional(r, 'goalId', 'goal'),
    ...optional(r, 'actionId', 'life_action'),
    ...optional(r, 'linkId', 'contribution_link'),
  ]),
  sphere: balanceMapped(SphereRecordMapper, [
    'importance',
    'manualScore',
    'desiredLevel',
    'includeInBalanceWheel',
  ]),
  direction: balanceMapped(
    DirectionRecordMapper,
    ['importance', 'manualScore', 'mode', 'currentStateText', 'need'],
    (record) => optional(record, 'sphereId', 'sphere'),
  ),
  project: mapped(ProjectRecordMapper, (record) => [
    ...optional(record, 'sphereId', 'sphere'),
    ...optional(record, 'directionId', 'direction'),
  ]),
  goal: {
    normalize: normalizeGoalWireRecord,
    prepare: (value, existing) => {
      if (
        existing &&
        typeof value.legacyProjectId === 'string' &&
        existing.legacyProjectId !== value.legacyProjectId
      )
        throw new DomainError(
          'goal.migration_id_collision',
          'Идентификатор перенесённой цели занят. Исходные данные сохранены.',
        );
      return {
        ...existing,
        ...value,
        ...asRecord(
          GoalRecordMapper.toRecord(
            GoalRecordMapper.fromRecord({
              ...existing,
              ...value,
              coverImage: existing?.coverImage ?? null,
              version: receiverVersion(existing),
            }),
          ),
        ),
      };
    },
    references: (record) => [
      ...optional(record, 'directionId', 'direction'),
      ...optional(record, 'sphereId', 'sphere'),
    ],
  },
  day: balanceMapped(DayRecordMapper, ['mainDirectionId'], (record) => [
    ...optional(record, 'sphereId', 'sphere'),
    ...optional(record, 'mainDirectionId', 'direction'),
  ]),
  decision: mapped(DecisionRecordMapper, (record) => [
    ...optional(record, 'projectId', 'project'),
    ...optional(record, 'sphereId', 'sphere'),
  ]),
  diary_entry: mapped(DiaryEntryRecordMapper),
  memory_event: {
    normalize: (value) => {
      const candidate = isRecord(value) ? { ...withValidationVersion(value), photo: null } : value;
      const record = withoutFields(
        asRecord(MemoryEventRecordMapper.toRecord(MemoryEventRecordMapper.fromRecord(candidate))),
        ['photo', 'version'],
      );
      return isRecord(value) && Object.hasOwn(value, 'syncAttachment')
        ? { ...record, syncAttachment: attachmentReference(value.syncAttachment) }
        : record;
    },
    prepare: (value, existing) =>
      asRecord(
        MemoryEventRecordMapper.toRecord(
          MemoryEventRecordMapper.fromRecord({
            ...value,
            photo: existing?.photo ?? null,
            version: receiverVersion(existing),
          }),
        ),
      ),
    references: (record) => [
      ...(isRecord(record.context)
        ? [
            ...optional(record.context, 'sphereId', 'sphere'),
            ...optional(record.context, 'directionId', 'direction'),
            ...optional(record.context, 'goalId', 'goal'),
          ].map((reference) => ({ ...reference, required: false }))
        : []),
      ...(isRecord(record.diarySource)
        ? orphanSafe(record.diarySource, 'entryId', 'diary_entry')
        : []),
    ],
  },
  life_action: lifeActionMapped(),
  time_capacity: mapped({
    fromRecord: parseTimeCapacityRecord,
    toRecord: (record: TimeCapacityRecord) => record,
  }),
  action_session: mapped(
    ActionSessionRecordMapper,
    (record) => [
      ...orphanSafe(record, 'lifeActionId', 'life_action'),
      ...optional(record, 'goalIdAtStart', 'goal').map((reference) => ({
        ...reference,
        required: false,
      })),
    ],
    true,
  ),
  journal_entry: {
    normalize: (value) =>
      asRecord(JournalEntryRecordMapper.toRecord(JournalEntryRecordMapper.fromRecord(value))),
    prepare: (value) =>
      asRecord(JournalEntryRecordMapper.toRecord(JournalEntryRecordMapper.fromRecord(value))),
    references: journalReferences,
  },
  routine_block: mapped(RoutineBlockRecordMapper, (record) =>
    record.assignment === 'existingSeries'
      ? required(record, 'ruleId', 'recurrence_rule')
      : optional(record, 'actionId', 'life_action'),
  ),
  routine_occurrence_override: mapped(RoutineOccurrenceOverrideRecordMapper, (record) => [
    ...orphanSafe(record, 'routineBlockId', 'routine_block'),
    ...optional(record, 'replacementActionId', 'life_action'),
  ]),
  routine_occurrence_execution: mapped(RoutineOccurrenceExecutionRecordMapper, (record) =>
    orphanSafe(record, 'routineBlockId', 'routine_block'),
  ),
  walk: {
    normalize: normalizeWalkWireRecord,
    prepare: (value, existing) =>
      asRecord(
        WalkRecordMapper.toRecord(
          WalkRecordMapper.fromRecord({
            ...value,
            photo: existing?.photo ?? null,
            version: receiverVersion(existing),
          }),
        ),
      ),
    references: walkReferences,
  },
  walk_capture: mapped(WalkCaptureRecordMapper, (record) => orphanSafe(record, 'walkId', 'walk')),
  evening_cycle: mapped(EveningCycleRecordMapper, eveningCycleReferences),
  exercise_definition: mapped(ExerciseDefinitionRecordMapper),
  tomorrow_plan: mapped(TomorrowPlanRecordMapper, tomorrowPlanReferences),
  preparation_plan: mapped(PreparationPlanRecordMapper, (record) => [
    ...required(record, 'cycleId', 'evening_cycle'),
    ...required(record, 'tomorrowPlanId', 'tomorrow_plan'),
    ...required(record, 'targetDayId', 'day'),
    ...preparationItemReferences(record),
  ]),
  preparation_rule: mapped(PreparationRuleRecordMapper),
  recommendation_application: mapped(
    RecommendationApplicationRecordMapper,
    recommendationApplicationReferences,
  ),
  morning_cycle: mapped(MorningCycleRecordMapper, morningCycleReferences),
  monthly_direction_focus: mapped(MonthlyDirectionFocusRecordMapper, (record) =>
    optional(record, 'directionId', 'direction'),
  ),
  sleep_schedule: mapped(SleepScheduleRecordMapper),
  inbox_idea: mapped(InboxIdeaRecordMapper, (record) =>
    record.targetType === 'goal'
      ? optional(record, 'targetId', 'goal')
      : optional(record, 'targetId', 'life_action'),
  ),
  focus_period: mapped(FocusPeriodRecordMapper, (record) =>
    FocusPeriodRecordMapper.fromRecord({ ...record, version: 1 }).goals.map((g) => ({
      entityType: 'goal',
      objectId: g.goalId,
      required: true,
    })),
  ),
  task_scenario: mapped(TaskScenarioRecordMapper, (record) =>
    TaskScenarioRecordMapper.fromRecord({ ...record, version: 1 }).actionIds.map((objectId) => ({
      entityType: 'life_action',
      objectId,
      required: false,
    })),
  ),
  user_settings: {
    normalize: normalizeUserSettings,
    prepare: normalizeUserSettings,
    references: noReferences,
  },
});

export function buildPilotRuntimeRegistry(
  registrations: readonly SyncEntityRegistration[],
): readonly PilotRuntimeRegistration[] {
  const remaining = registrations
    .filter(
      (registration): registration is PilotRegistration =>
        registration.readiness === 'sync_ready' && isPilotEntityType(registration.entityType),
    )
    .map((registration) => ({
      registration,
      normalize: PILOT_BINDINGS[registration.entityType].normalize,
      prepare: PILOT_BINDINGS[registration.entityType].prepare,
      references: PILOT_BINDINGS[registration.entityType].references,
    }));
  const ordered: PilotRuntimeRegistration[] = [];
  while (remaining.length > 0) {
    const readyIndex = remaining.findIndex(({ registration }) =>
      registration.dependencies.every(
        (dependency) =>
          dependency === registration.entityType ||
          ordered.some(({ registration: applied }) => applied.entityType === dependency),
      ),
    );
    if (readyIndex < 0) throw new Error('Sync Registry contains a dependency cycle.');
    ordered.push(remaining.splice(readyIndex, 1)[0]!);
  }
  return Object.freeze(ordered);
}

export const PILOT_RUNTIME_REGISTRY = buildPilotRuntimeRegistry(LIFE_OS_SYNC_REGISTRY);
export const PILOT_DEPENDENCY_ORDER = Object.freeze(
  PILOT_RUNTIME_REGISTRY.map(({ registration }) => registration.entityType),
);

export function normalizePilotRecord(
  entityType: PilotEntityType,
  value: unknown,
): Readonly<Record<string, unknown>> {
  const normalized = runtimeFor(entityType).normalize(normalizeLinks(entityType, value));
  return (entityType === 'goal' || entityType === 'walk') &&
    isRecord(value) &&
    Object.hasOwn(value, 'syncAttachment')
    ? { ...normalized, syncAttachment: attachmentReference(value.syncAttachment) }
    : normalized;
}

export function shouldSyncPilotRecord(entityType: PilotEntityType, value: unknown): boolean {
  return !(entityType === 'exercise_definition' && isRecord(value) && value.source === 'SYSTEM');
}

export function pilotRelationshipReferences(
  entityType: PilotEntityType,
  value: Readonly<Record<string, unknown>>,
): readonly SyncRelationshipReference[] {
  return runtimeFor(entityType)
    .references(normalizeLinks(entityType, value) as Readonly<Record<string, unknown>>)
    .map((ref) => (ref.entityType === 'project' ? { ...ref, entityType: 'goal' } : ref));
}

export function haveSamePilotSemanticContent(
  entityType: PilotEntityType,
  local: unknown,
  incoming: unknown,
): boolean {
  return (
    JSON.stringify(sortJsonValue(semanticContent(normalizePilotRecord(entityType, local)))) ===
    JSON.stringify(sortJsonValue(semanticContent(normalizePilotRecord(entityType, incoming))))
  );
}

export async function applyRemotePilotRecord(
  database: IDBDatabase,
  entityType: PilotEntityType,
  value: Readonly<Record<string, unknown>>,
): Promise<void> {
  if (entityType === 'user_settings') throw new Error('User settings require localStorage apply.');
  const storeName = pilotStoreFor(entityType);
  const transaction = database.transaction(storeName, 'readwrite');
  const store = transaction.objectStore(storeName);
  const id = value.id;
  const existing =
    typeof id === 'string'
      ? await request<Readonly<Record<string, unknown>> | undefined>(store.get(id))
      : undefined;
  await request(store.put(prepareRemotePilotRecord(entityType, value, existing)));
  await done(transaction);
}

export async function applyRemotePilotTombstone(
  database: IDBDatabase,
  entityType: PilotEntityType,
  objectId: string,
): Promise<void> {
  if (entityType === 'user_settings') throw new Error('User settings cannot be tombstoned.');
  const storeName = pilotStoreFor(entityType);
  const transaction = database.transaction(storeName, 'readwrite');
  await request(transaction.objectStore(storeName).delete(objectId));
  await done(transaction);
}

export function pilotStoreFor(entityType: PilotEntityType): string {
  return runtimeFor(entityType).registration.storeName;
}

export function prepareRemotePilotRecord(
  entityType: PilotEntityType,
  value: Readonly<Record<string, unknown>>,
  existing?: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  const prepared = runtimeFor(entityType).prepare(
    normalizeLinks(entityType, value) as Readonly<Record<string, unknown>>,
    existing,
  );
  return (entityType === 'goal' || entityType === 'walk' || entityType === 'memory_event') &&
    Object.hasOwn(value, 'syncAttachment')
    ? { ...prepared, syncAttachment: attachmentReference(value.syncAttachment) }
    : prepared;
}

export function pilotRegistrationFor(entityType: PilotEntityType): PilotRegistration {
  return runtimeFor(entityType).registration;
}

function runtimeFor(entityType: PilotEntityType): PilotRuntimeRegistration {
  const runtime = PILOT_RUNTIME_REGISTRY.find(
    ({ registration }) => registration.entityType === entityType,
  );
  if (runtime === undefined) throw new Error(`Sync adapter is missing for ${entityType}.`);
  return runtime;
}

function isPilotEntityType(entityType: string): entityType is PilotEntityType {
  return Object.hasOwn(PILOT_BINDINGS, entityType);
}

function normalizeGoalWireRecord(value: unknown): Readonly<Record<string, unknown>> {
  const candidate = isRecord(value) ? { ...withValidationVersion(value), coverImage: null } : value;
  const normalized = withoutFields(
    asRecord(GoalRecordMapper.toRecord(GoalRecordMapper.fromRecord(candidate))),
    ['coverImage', 'version'],
  );
  return isRecord(value)
    ? withoutFields(
        { ...withoutFields(asRecord(value), ['coverImage', 'version']), ...normalized },
        [
          'sphereId',
          'isMain',
          'legacyProjectId',
          'measurement',
          'dueDate',
          'nextActionId',
          'need',
        ].filter((field) => !Object.hasOwn(value, field)),
      )
    : normalized;
}

function normalizeWalkWireRecord(value: unknown): Readonly<Record<string, unknown>> {
  const candidate = isRecord(value) ? { ...withValidationVersion(value), photo: null } : value;
  return withoutFields(
    asRecord(WalkRecordMapper.toRecord(WalkRecordMapper.fromRecord(candidate))),
    ['photo', 'version'],
  );
}

function normalizeUserSettings(value: unknown): Readonly<Record<string, unknown>> {
  if (!isRecord(value) || value.id !== 'lifeos-user-settings' || value.schemaVersion !== 1) {
    throw new Error('Structured user settings record is invalid.');
  }
  const parsed = parseEveningRitualSettings(value.eveningRitual);
  if (parsed.recoveredFromInvalidValue) throw new Error('Evening ritual settings are invalid.');
  return { id: 'lifeos-user-settings', schemaVersion: 1, eveningRitual: parsed.settings };
}

function journalReferences(record: Readonly<Record<string, unknown>>): SyncRelationshipReference[] {
  const references = [...optional(record, 'sphereId', 'sphere')];
  if (record.subjectId === null || record.subjectId === undefined) return references;
  if (typeof record.subjectId !== 'string' || typeof record.subjectType !== 'string') {
    throw new Error('Journal relationship is invalid.');
  }
  const entityType = subjectEntityType(record.subjectType);
  if (entityType !== null)
    references.push({ entityType, objectId: record.subjectId, required: false });
  return references;
}

function subjectEntityType(value: string): PilotEntityType | null {
  const normalized = value.toLowerCase();
  if (normalized.includes('worksession') || normalized.includes('action_session'))
    return 'action_session';
  if (normalized.includes('decision')) return 'decision';
  if (normalized.includes('action')) return 'life_action';
  if (normalized.includes('day')) return 'day';
  if (normalized.includes('sphere')) return 'sphere';
  if (normalized.includes('direction')) return 'direction';
  if (normalized.includes('project')) return 'project';
  if (normalized.includes('goal')) return 'goal';
  if (normalized === 'planningperiod') return 'planning_period';
  if (normalized === 'recurrencerule') return 'recurrence_rule';
  if (normalized.includes('routine')) return 'routine_block';
  return null;
}

function walkReferences(record: Readonly<Record<string, unknown>>): SyncRelationshipReference[] {
  const references = [...optional(record, 'sphereId', 'sphere')];
  appendNestedEntityReference(references, record.linkedEntity);
  appendWalkContextReferences(references, record.returnContext);
  if (isRecord(record.reentry) && isRecord(record.reentry.action)) {
    appendNestedEntityReference(references, record.reentry.action.entity);
    appendWalkRoutineReferences(references, record.reentry.action.routineContext);
  }
  return references;
}

function eveningCycleReferences(
  record: Readonly<Record<string, unknown>>,
): SyncRelationshipReference[] {
  const references = [
    ...required(record, 'dayId', 'day'),
    ...stringArray(record, 'decisionIds', 'decision'),
    ...stringArray(record, 'lifeActionIds', 'life_action'),
  ];
  const openLoops = record.openLoopReferences;
  if (Array.isArray(openLoops)) {
    for (const openLoop of openLoops) {
      if (!isRecord(openLoop)) continue;
      const entityType =
        typeof openLoop.entityType === 'string' ? subjectEntityType(openLoop.entityType) : null;
      if (entityType !== null && typeof openLoop.entityId === 'string') {
        references.push({ entityType, objectId: openLoop.entityId, required: true });
      }
    }
  }
  return references;
}

function tomorrowPlanReferences(
  record: Readonly<Record<string, unknown>>,
): SyncRelationshipReference[] {
  return [
    ...required(record, 'cycleId', 'evening_cycle'),
    ...required(record, 'sourceDayId', 'day'),
    ...required(record, 'targetDayId', 'day'),
    ...optional(record, 'directionId', 'direction'),
    ...optional(record, 'primaryDecisionId', 'decision'),
    ...optional(record, 'firstActionId', 'life_action'),
    ...stringArray(record, 'supportingDecisionIds', 'decision'),
  ];
}

function morningCycleReferences(
  record: Readonly<Record<string, unknown>>,
): SyncRelationshipReference[] {
  const references = [...required(record, 'dayId', 'day')];
  const items = record.physicalPlanItems;
  if (Array.isArray(items)) {
    for (const item of items) {
      if (isRecord(item) && typeof item.exerciseDefinitionId === 'string') {
        references.push({
          entityType: 'exercise_definition',
          objectId: item.exerciseDefinitionId,
          required: true,
        });
      }
    }
  }
  const execution = record.physicalExecution;
  if (isRecord(execution) && Array.isArray(execution.sets)) {
    for (const set of execution.sets) {
      if (isRecord(set) && typeof set.exerciseDefinitionId === 'string') {
        references.push({
          entityType: 'exercise_definition',
          objectId: set.exerciseDefinitionId,
          required: true,
        });
      }
    }
  }
  return references;
}

function preparationItemReferences(
  record: Readonly<Record<string, unknown>>,
): SyncRelationshipReference[] {
  if (!Array.isArray(record.items)) return [];
  const references: SyncRelationshipReference[] = [];
  for (const item of record.items) {
    if (!isRecord(item) || typeof item.sourceId !== 'string') continue;
    const entityType = preparationSourceEntityType(item.sourceType);
    if (entityType !== null) {
      references.push({ entityType, objectId: item.sourceId, required: true });
    }
  }
  return references;
}

function preparationSourceEntityType(value: unknown): PilotEntityType | null {
  if (value === 'FIRST_ACTION') return 'life_action';
  if (value === 'PROJECT') return 'project';
  if (value === 'RULE') return 'preparation_rule';
  return null;
}

function recommendationApplicationReferences(
  record: Readonly<Record<string, unknown>>,
): SyncRelationshipReference[] {
  if (record.targetId === null || record.targetId === undefined) return [];
  if (typeof record.targetId !== 'string') throw new Error('targetId is invalid.');
  const entityType = recommendationTargetEntityType(record.targetType);
  return entityType === null ? [] : [{ entityType, objectId: record.targetId, required: true }];
}

function recommendationTargetEntityType(value: unknown): PilotEntityType | null {
  if (value === 'TOMORROW_PLAN') return 'tomorrow_plan';
  if (value === 'DECISION') return 'decision';
  if (value === 'PREPARATION_PLAN') return 'preparation_plan';
  return null;
}

function appendNestedEntityReference(
  references: SyncRelationshipReference[],
  value: unknown,
): void {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.type !== 'string') return;
  const entityType = subjectEntityType(value.type);
  if (entityType !== null) {
    references.push({ entityType, objectId: value.id, required: true });
  }
}

function appendWalkContextReferences(
  references: SyncRelationshipReference[],
  value: unknown,
): void {
  if (!isRecord(value)) return;
  appendNestedEntityReference(references, value.entity);
  appendWalkRoutineReferences(references, value.routineContext);
}

function appendWalkRoutineReferences(
  references: SyncRelationshipReference[],
  value: unknown,
): void {
  if (!isRecord(value)) return;
  for (const occurrence of [value.source, value.next]) {
    if (isRecord(occurrence) && typeof occurrence.routineBlockId === 'string') {
      references.push({
        entityType: 'routine_block',
        objectId: occurrence.routineBlockId,
        required: false,
      });
    }
  }
}

function optional(
  record: Readonly<Record<string, unknown>>,
  field: string,
  entityType: PilotEntityType,
): SyncRelationshipReference[] {
  const value = record[field];
  if (value === null || value === undefined) return [];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} is invalid.`);
  return [{ entityType, objectId: value, required: true }];
}

function required(
  record: Readonly<Record<string, unknown>>,
  field: string,
  entityType: PilotEntityType,
): SyncRelationshipReference[] {
  const value = record[field];
  if (typeof value !== 'string' || value.length === 0) throw new Error(`${field} is invalid.`);
  return [{ entityType, objectId: value, required: true }];
}

// These durable history records intentionally survive deletion of their Walk/routine.
function orphanSafe(
  record: Readonly<Record<string, unknown>>,
  field: string,
  entityType: PilotEntityType,
): SyncRelationshipReference[] {
  return required(record, field, entityType).map((reference) => ({
    ...reference,
    required: false,
  }));
}

function stringArray(
  record: Readonly<Record<string, unknown>>,
  field: string,
  entityType: PilotEntityType,
): SyncRelationshipReference[] {
  const value = record[field];
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string')) {
    throw new Error(`${field} is invalid.`);
  }
  return value.map((objectId) => ({ entityType, objectId, required: true }));
}

function noReferences(): readonly SyncRelationshipReference[] {
  return [];
}

function semanticContent(
  record: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>> {
  return withoutFields(record, ['version', 'createdAt', 'updatedAt']);
}

function receiverVersion(existing: Readonly<Record<string, unknown>> | undefined): number {
  if (existing === undefined) return 1;
  const version = existing.version;
  if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
    throw new Error('Existing sync record has an invalid local version.');
  }
  return version + 1;
}

function withValidationVersion(
  value: Readonly<Record<string, unknown>>,
): Readonly<Record<string, unknown>>;
function withValidationVersion(value: unknown): unknown;
function withValidationVersion(value: unknown): unknown {
  return isRecord(value) && !Object.hasOwn(value, 'version') ? { ...value, version: 1 } : value;
}

function withoutFields(
  record: Readonly<Record<string, unknown>>,
  fields: readonly string[],
): Readonly<Record<string, unknown>> {
  const excluded = new Set(fields);
  return Object.fromEntries(Object.entries(record).filter(([key]) => !excluded.has(key)));
}

function asRecord(value: object): Readonly<Record<string, unknown>> {
  return Object.fromEntries(Object.entries(value));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function request<T>(value: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    value.onsuccess = () => resolve(value.result);
    value.onerror = () => reject(value.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () => reject(transaction.error);
    transaction.onerror = () => reject(transaction.error);
  });
}

function normalizeLinks(type: PilotEntityType, value: unknown): unknown {
  return ['decision', 'journal_entry', 'walk', 'preparation_plan', 'evening_cycle'].includes(
    type,
  ) && isRecord(value)
    ? normalizeLegacyGoalLinks(value)
    : value;
}
