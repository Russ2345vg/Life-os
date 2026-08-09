import {
  JOURNAL_ENTRY_TYPE,
  JOURNAL_CORRECTION_FIELD,
  JOURNAL_SUBJECT_TYPE,
  DayDate,
  EntityId,
  JournalEntry,
  type JournalEntryType,
  type JournalCorrectionData,
  type JournalCorrectionField,
  type JournalMetadata,
  type JournalMetadataValue,
  type JournalSubjectType,
} from '../../../domain';
import { DomainError } from '../../../shared/errors/DomainError';
import type { JournalEntryRecord } from '../records/JournalEntryRecord';

export class JournalEntryRecordMapper {
  public static toRecord(entry: JournalEntry): JournalEntryRecord {
    return {
      id: entry.id.toString(),
      type: entry.type,
      occurredAt: entry.occurredAt.toISOString(),
      effectiveDate: entry.effectiveDate.toString(),
      subjectType: entry.subjectType,
      subjectId: entry.subjectId?.toString() ?? null,
      sphereId: entry.sphereId?.toString() ?? null,
      labelAtEvent: entry.labelAtEvent,
      metadata: entry.metadata === null ? null : { ...entry.metadata },
      correction:
        entry.correction === null
          ? null
          : {
              sourceEntryId: entry.correction.sourceEntryId.toString(),
              previousCorrectionId: entry.correction.previousCorrectionId?.toString() ?? null,
              field: entry.correction.field,
              previousValue: entry.correction.previousValue,
              newValue: entry.correction.newValue,
              reason: entry.correction.reason,
              commandId: entry.correction.commandId.toString(),
            },
      createdAt: entry.createdAt.toISOString(),
    };
  }

  public static fromRecord(value: unknown): JournalEntry {
    if (!isRecord(value)) throw invalidRecord();
    const type = value.type;
    const subjectType = value.subjectType;
    if (!isJournalEntryType(type) || !isJournalSubjectType(subjectType)) throw invalidRecord();

    return JournalEntry.rehydrate({
      id: EntityId.create(readString(value, 'id')),
      type,
      occurredAt: readDate(value, 'occurredAt'),
      effectiveDate: DayDate.create(readString(value, 'effectiveDate')),
      subjectType,
      subjectId: readOptionalId(value.subjectId),
      sphereId: readOptionalId(value.sphereId),
      labelAtEvent: readOptionalString(value.labelAtEvent),
      metadata: readMetadata(value.metadata),
      correction: readCorrection(value.correction),
      createdAt: readDate(value, 'createdAt'),
    });
  }
}

function readCorrection(value: unknown): JournalCorrectionData | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw invalidRecord();
  const field = value.field;
  if (!isJournalCorrectionField(field)) throw invalidRecord();
  return {
    sourceEntryId: EntityId.create(readString(value, 'sourceEntryId')),
    previousCorrectionId: readOptionalId(value.previousCorrectionId),
    field,
    previousValue: readOptionalString(value.previousValue),
    newValue: readString(value, 'newValue'),
    reason: readString(value, 'reason'),
    commandId: EntityId.create(readString(value, 'commandId')),
  };
}

function isJournalCorrectionField(value: unknown): value is JournalCorrectionField {
  return (
    typeof value === 'string' &&
    Object.values(JOURNAL_CORRECTION_FIELD).includes(value as JournalCorrectionField)
  );
}

function isJournalEntryType(value: unknown): value is JournalEntryType {
  return (
    typeof value === 'string' &&
    Object.values(JOURNAL_ENTRY_TYPE).includes(value as JournalEntryType)
  );
}

function isJournalSubjectType(value: unknown): value is JournalSubjectType {
  return (
    typeof value === 'string' &&
    Object.values(JOURNAL_SUBJECT_TYPE).includes(value as JournalSubjectType)
  );
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null;
}

function readString(record: Readonly<Record<string, unknown>>, key: string): string {
  const value = record[key];
  if (typeof value !== 'string') throw invalidRecord();
  return value;
}

function readDate(record: Readonly<Record<string, unknown>>, key: string): Date {
  const value = new Date(readString(record, key));
  if (Number.isNaN(value.getTime())) throw invalidRecord();
  return value;
}

function readOptionalId(value: unknown): EntityId | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw invalidRecord();
  return EntityId.create(value);
}

function readOptionalString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') throw invalidRecord();
  return value;
}

function readMetadata(value: unknown): JournalMetadata | null {
  if (value === null || value === undefined) return null;
  if (!isRecord(value)) throw invalidRecord();
  const metadata: Record<string, JournalMetadataValue> = {};
  for (const [key, item] of Object.entries(value)) {
    if (
      item !== null &&
      typeof item !== 'string' &&
      typeof item !== 'number' &&
      typeof item !== 'boolean'
    ) {
      throw invalidRecord();
    }
    metadata[key] = item;
  }
  return metadata;
}

function invalidRecord(): DomainError {
  return new DomainError('journal.invalid_record', 'Некорректная запись журнала.');
}
