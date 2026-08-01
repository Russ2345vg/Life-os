import type { IdGenerator } from '../../application';
import { EntityId } from '../../domain';

export class CryptoIdGenerator implements IdGenerator {
  public generate(): EntityId {
    return EntityId.create(globalThis.crypto.randomUUID());
  }
}
