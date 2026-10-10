import type { RoutineBlock } from '../../domain/routine-block/RoutineBlock';
export interface RoutineBlockRepository {
  findAll(): Promise<readonly RoutineBlock[]>;
}
