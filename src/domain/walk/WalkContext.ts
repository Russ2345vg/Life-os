import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';

export const WALK_LINKED_ENTITY_TYPE = {
  decision: 'decision',
  goal: 'goal',
  project: 'project',
  lifeAction: 'lifeAction',
  routine: 'routine',
} as const;

export type WalkLinkedEntityType =
  (typeof WALK_LINKED_ENTITY_TYPE)[keyof typeof WALK_LINKED_ENTITY_TYPE];

export interface WalkLinkedEntity {
  readonly type: WalkLinkedEntityType;
  readonly id: EntityId;
}

export const WALK_RETURN_ORIGIN = {
  walks: 'walks',
  today: 'today',
  decision: 'decision',
  goal: 'goal',
  project: 'project',
  lifeAction: 'lifeAction',
  routine: 'routine',
} as const;

export type WalkReturnOrigin = (typeof WALK_RETURN_ORIGIN)[keyof typeof WALK_RETURN_ORIGIN];

export interface WalkRoutineOccurrenceReference {
  readonly routineBlockId: EntityId;
  readonly occurrenceDate: DayDate;
  readonly effectiveDate: DayDate;
}

export interface WalkRoutineContext {
  readonly source: WalkRoutineOccurrenceReference;
  readonly sourceTitle: string;
  readonly next: WalkRoutineOccurrenceReference | null;
}

export interface WalkReturnContext {
  readonly origin: WalkReturnOrigin;
  readonly entity: WalkLinkedEntity | null;
  readonly nextStep: string | null;
  readonly routineContext?: WalkRoutineContext | null;
}

export function isWalkLinkedEntity(value: unknown): value is WalkLinkedEntity {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const entity = value as Record<string, unknown>;
  return isWalkLinkedEntityType(entity.type) && entity.id instanceof EntityId;
}

export function isWalkLinkedEntityType(value: unknown): value is WalkLinkedEntityType {
  return Object.values(WALK_LINKED_ENTITY_TYPE).some((type) => type === value);
}

export function isWalkReturnContext(value: unknown): value is WalkReturnContext {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  const entity = context.entity;
  const baseValid =
    isWalkReturnOrigin(context.origin) &&
    (entity === null || isWalkLinkedEntity(entity)) &&
    (context.nextStep === null || typeof context.nextStep === 'string');
  if (!baseValid) return false;

  const routineContext = Object.hasOwn(context, 'routineContext') ? context.routineContext : null;
  if (routineContext === null) return true;
  if (!isWalkRoutineContext(routineContext)) return false;

  return (
    context.origin === WALK_RETURN_ORIGIN.routine &&
    isWalkLinkedEntity(entity) &&
    entity.type === WALK_LINKED_ENTITY_TYPE.routine &&
    entity.id.equals(routineContext.source.routineBlockId)
  );
}

export function isWalkReturnOrigin(value: unknown): value is WalkReturnOrigin {
  return Object.values(WALK_RETURN_ORIGIN).some((origin) => origin === value);
}

export function isWalkRoutineOccurrenceReference(
  value: unknown,
): value is WalkRoutineOccurrenceReference {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  return (
    reference.routineBlockId instanceof EntityId &&
    reference.occurrenceDate instanceof DayDate &&
    reference.effectiveDate instanceof DayDate
  );
}

export function isWalkRoutineContext(value: unknown): value is WalkRoutineContext {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const context = value as Record<string, unknown>;
  if (
    !isWalkRoutineOccurrenceReference(context.source) ||
    typeof context.sourceTitle !== 'string' ||
    context.sourceTitle.trim().length === 0 ||
    !(context.next === null || isWalkRoutineOccurrenceReference(context.next))
  ) {
    return false;
  }
  return context.next === null || context.next.effectiveDate.equals(context.source.effectiveDate);
}

export function copyWalkRoutineContext(context: WalkRoutineContext): WalkRoutineContext {
  return {
    source: copyWalkRoutineOccurrenceReference(context.source),
    sourceTitle: context.sourceTitle.trim(),
    next: context.next === null ? null : copyWalkRoutineOccurrenceReference(context.next),
  };
}

export function sameWalkRoutineOccurrenceReference(
  left: WalkRoutineOccurrenceReference,
  right: WalkRoutineOccurrenceReference,
): boolean {
  return (
    left.routineBlockId.equals(right.routineBlockId) &&
    left.occurrenceDate.equals(right.occurrenceDate) &&
    left.effectiveDate.equals(right.effectiveDate)
  );
}

function copyWalkRoutineOccurrenceReference(
  reference: WalkRoutineOccurrenceReference,
): WalkRoutineOccurrenceReference {
  return {
    routineBlockId: EntityId.create(reference.routineBlockId.toString()),
    occurrenceDate: DayDate.create(reference.occurrenceDate.toString()),
    effectiveDate: DayDate.create(reference.effectiveDate.toString()),
  };
}
