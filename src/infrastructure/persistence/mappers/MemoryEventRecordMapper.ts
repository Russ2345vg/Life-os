import { DayDate, EntityId } from '../../../domain';
import { validateMemoryEvent, type MemoryEvent } from '../../../domain/memory';
import { DomainError } from '../../../shared/errors/DomainError';
import type { MemoryEventRecord } from '../records/MemoryEventRecord';

export const MemoryEventRecordMapper = {
  toRecord(entry: MemoryEvent): MemoryEventRecord {
    const valid = validateMemoryEvent(entry, { persisted: true });
    return { ...valid, id: valid.id.toString(), occurredOn: valid.occurredOn.toString() };
  },
  fromRecord(value: unknown): MemoryEvent {
    if (
      typeof value !== 'object' ||
      value === null ||
      !('id' in value) ||
      !('occurredOn' in value) ||
      typeof value.id !== 'string' ||
      typeof value.occurredOn !== 'string'
    )
      throw new DomainError('memory.invalid_record', 'Не удалось прочитать воспоминание.');
    return validateMemoryEvent(
      { ...value, id: EntityId.create(value.id), occurredOn: DayDate.create(value.occurredOn) },
      { persisted: true },
    );
  },
};
