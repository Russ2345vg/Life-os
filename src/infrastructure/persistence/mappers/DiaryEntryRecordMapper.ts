import { DayDate, EntityId, validateDiaryEntry, type DiaryEntry } from '../../../domain';
import { DomainError } from '../../../shared/errors/DomainError';
import type { DiaryEntryRecord } from '../records/DiaryEntryRecord';

export const DiaryEntryRecordMapper = {
  toRecord(entry: DiaryEntry): DiaryEntryRecord {
    const valid = validateDiaryEntry(entry, { persisted: true });
    return {
      id: valid.id.toString(),
      periodKey: valid.periodKey,
      kind: valid.kind,
      periodStart: valid.periodStart.toString(),
      periodEnd: valid.periodEnd.toString(),
      status: valid.status,
      promptVersion: valid.promptVersion,
      payload: { ...valid.payload },
      createdAt: valid.createdAt,
      updatedAt: valid.updatedAt,
      version: valid.version,
    };
  },

  fromRecord(value: unknown): DiaryEntry {
    if (!isRecord(value)) throw invalidRecord();
    const id = readString(value, 'id');
    const periodKey = readString(value, 'periodKey');
    const kind = readString(value, 'kind');
    const periodStart = readString(value, 'periodStart');
    const periodEnd = readString(value, 'periodEnd');
    const status = readString(value, 'status');
    const createdAt = readString(value, 'createdAt');
    const updatedAt = readString(value, 'updatedAt');
    if (!Number.isInteger(value.promptVersion) || !Number.isInteger(value.version))
      throw invalidRecord();
    return validateDiaryEntry(
      {
        id: EntityId.create(id),
        periodKey,
        kind,
        periodStart: DayDate.create(periodStart),
        periodEnd: DayDate.create(periodEnd),
        status,
        promptVersion: value.promptVersion,
        payload: value.payload,
        createdAt,
        updatedAt,
        version: value.version,
      },
      { persisted: true },
    );
  },
};

function readString(value: Record<string, unknown>, field: string): string {
  const result = value[field];
  if (typeof result !== 'string') throw invalidRecord();
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function invalidRecord(): DomainError {
  return new DomainError(
    'persistence.diary_record_invalid',
    'Сохранённая запись дневника содержит некорректные данные.',
  );
}
