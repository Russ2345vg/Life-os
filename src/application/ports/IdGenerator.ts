import type { EntityId } from '../../domain';

export interface IdGenerator {
  generate(): EntityId;
}
