import { taskScenario, type TaskScenario } from '../../domain/planner/TaskScenario';

export const TaskScenarioRecordMapper = {
  fromRecord: (value: unknown): TaskScenario => taskScenario(value as TaskScenario),
  toRecord: (value: TaskScenario): TaskScenario => taskScenario(value),
};
