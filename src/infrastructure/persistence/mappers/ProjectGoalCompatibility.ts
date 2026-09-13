import { Project } from '../../../domain';
import type { GoalRecord } from '../records/GoalRecord';
import { GoalRecordMapper } from './GoalRecordMapper';

/** A legacy port projection. All mutable state is stored in the canonical Goal record. */
export class ProjectGoalCompatibility {
  public static fromRecord(value: unknown): Project {
    const goal = GoalRecordMapper.fromRecord(value);
    return Project.rehydrate({
      id: goal.id,
      sphereId: goal.sphereId,
      directionId: goal.directionId,
      title: goal.title,
      description: goal.description,
      desiredResult: goal.achievementCriteria,
      status:
        goal.status === 'achieved'
          ? 'completed'
          : goal.status === 'future'
            ? 'paused'
            : goal.status,
      isMain: goal.isMain,
      createdAt: goal.createdAt,
      updatedAt: goal.updatedAt,
      version: goal.version,
    });
  }

  public static toRecord(project: Project, existing?: GoalRecord): GoalRecord {
    const status =
      project.status === 'completed'
        ? 'achieved'
        : project.status === 'paused' && existing?.status === 'future'
          ? 'future'
          : project.status;
    const stage =
      status === 'achieved'
        ? 'achieved'
        : status === 'archived'
          ? (existing?.stage ?? 'active_goal')
          : existing?.stage === 'achieved'
            ? 'active_goal'
            : (existing?.stage ?? 'active_goal');
    const record: GoalRecord = {
      schemaVersion: 1,
      id: project.id.toString(),
      sphereId: project.sphereId?.toString() ?? null,
      directionId: project.directionId?.toString() ?? null,
      isMain: project.isMain,
      legacyProjectId: existing?.legacyProjectId ?? null,
      title: project.title,
      description: project.description,
      achievementCriteria: project.desiredResult,
      status,
      stage,
      whyImportant: existing?.whyImportant ?? null,
      whyNow: existing?.whyNow ?? null,
      intentionLevel: existing?.intentionLevel ?? null,
      horizon: existing?.horizon ?? null,
      progressType: existing?.progressType ?? null,
      progress: existing?.progress ?? null,
      nextProgress: existing?.nextProgress ?? null,
      coverImage: existing?.coverImage ?? null,
      createdAt: project.createdAt.toISOString(),
      updatedAt: project.updatedAt.toISOString(),
      archivedAt:
        status === 'archived' ? (existing?.archivedAt ?? project.updatedAt.toISOString()) : null,
      version: project.version,
    };
    return GoalRecordMapper.toRecord(GoalRecordMapper.fromRecord(record));
  }
}
