import { EntityId, Project } from '../../../domain';
import type { RecoveryItem, RecoveryState } from '../../../application/sync/recovery/SyncRecovery';
import { legacyProjectGoalId, normalizeLegacyGoalLinks } from '../../../shared/legacyGoalIdentity';
import { ProjectRecordMapper } from '../../persistence/mappers/ProjectRecordMapper';
import { ProjectGoalCompatibility } from '../../persistence/mappers/ProjectGoalCompatibility';

export function normalizeGoalRecoveryState(state: RecoveryState): RecoveryState {
  const canonical = new Map(
    state.items.filter((item) => item.entityType === 'goal').map((item) => [item.record.id, item]),
  );
  const items: RecoveryItem[] = [];
  for (const item of state.items) {
    if (item.entityType !== 'project') {
      items.push({
        ...item,
        record: ['decision', 'journal_entry', 'walk', 'preparation_plan', 'evening_cycle'].includes(
          item.entityType,
        )
          ? normalizeLegacyGoalLinks(item.record)
          : item.record,
      });
      continue;
    }
    const project = ProjectRecordMapper.fromRecord({
      ...item.record,
      version: item.record.version ?? 1,
    });
    const goalId = legacyProjectGoalId(project.id.toString());
    const existing = canonical.get(goalId);
    if (existing) {
      if (existing.record.legacyProjectId !== project.id.toString())
        throw new Error('Идентификатор цели в снимке занят другой записью.');
      continue;
    }
    const projected = Project.rehydrate({
      ...project,
      id: EntityId.create(goalId),
      sphereId: project.sphereId,
      directionId: project.directionId,
    });
    items.push({
      entityType: 'goal',
      record: {
        ...ProjectGoalCompatibility.toRecord(projected),
        legacyProjectId: project.id.toString(),
      },
    });
  }
  return { ...state, items };
}
