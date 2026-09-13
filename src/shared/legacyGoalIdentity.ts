const PREFIX = 'goal-from-project:';

/** Stable across installations; legacy and canonical sync object IDs must not collide. */
export function legacyProjectGoalId(id: string): string {
  return `${PREFIX}${id}`;
}

/** Translate declared references only, never titles, descriptions or historical user text. */
export function normalizeLegacyGoalLinks<T extends object>(source: T): T {
  if ('goalLinksVersion' in source && source.goalLinksVersion === 1) return source;
  let changed = false;
  const visit = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(visit);
    if (typeof value !== 'object' || value === null) return value;
    const input = value as Record<string, unknown>;
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(input)) {
      const projectReference =
        key === 'projectId' ||
        key === 'mainProjectId' ||
        (key === 'sourceId' && input.sourceType === 'PROJECT') ||
        (key === 'subjectId' && String(input.subjectType).toLowerCase() === 'project') ||
        (key === 'entityId' && String(input.entityType).toLowerCase() === 'project') ||
        (key === 'id' && String(input.type).toLowerCase() === 'project');
      if (projectReference && typeof item === 'string') changed = true;
      output[key] =
        projectReference && typeof item === 'string' ? legacyProjectGoalId(item) : visit(item);
    }
    return output;
  };
  const converted = visit(source) as T;
  return changed ? { ...converted, goalLinksVersion: 1 } : source;
}
