import type { TaskScenario } from '../../domain/planner/TaskScenario';

export interface TaskScenarioRepository {
  list(): Promise<readonly TaskScenario[]>;
  create(value: TaskScenario): Promise<void>;
  change(id: string, update: (current: TaskScenario) => TaskScenario): Promise<TaskScenario>;
}
