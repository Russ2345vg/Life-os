import {
  WALK_INTENT,
  WALK_REFLECTION_TEMPLATE,
  WALK_TYPE,
  type WalkIntent,
  type WalkReflectionTemplate,
  type WalkType,
} from '../../domain';

const WALK_TYPE_BY_INTENT: Readonly<Record<WalkIntent, WalkType>> = {
  free: WALK_TYPE.mindful,
  recovery: WALK_TYPE.restorative,
  reflection: WALK_TYPE.reflection,
};

export function walkTypeForIntent(intent: WalkIntent): WalkType {
  return WALK_TYPE_BY_INTENT[intent];
}

export function walkReflectionTemplateForIntent(
  intent: WalkIntent,
  requested?: WalkReflectionTemplate,
): WalkReflectionTemplate | null {
  return (
    requested ?? (intent === WALK_INTENT.reflection ? WALK_REFLECTION_TEMPLATE.freeThought : null)
  );
}
