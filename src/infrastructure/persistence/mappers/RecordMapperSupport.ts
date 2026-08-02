import { DayDate } from '../../../domain/day/DayDate';
import { EntityId } from '../../../domain/shared/EntityId';
import { DomainError } from '../../../shared/errors/DomainError';

export type UnknownRecord = Readonly<Record<string, unknown>>;

const ISO_UTC_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export function assertRecordAndSchemaVersion(value: unknown): asserts value is UnknownRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw invalidRecord('Запись должна быть обычным объектом.');
  }

  const record = value as UnknownRecord;
  if (!Object.hasOwn(record, 'schemaVersion')) {
    throw invalidRecord('В записи отсутствует обязательное поле schemaVersion.');
  }

  if (typeof record.schemaVersion !== 'number') {
    throw invalidRecord('Поле schemaVersion должно быть числом.');
  }

  if (record.schemaVersion !== 1) {
    throw new DomainError(
      'persistence.unsupported_schema_version',
      `Версия схемы ${String(record.schemaVersion)} не поддерживается.`,
    );
  }
}

export function readString(record: UnknownRecord, field: string): string {
  const value = readRequired(record, field);
  if (typeof value !== 'string') {
    throw invalidRecord(`Поле ${field} должно быть строкой.`);
  }
  return value;
}

export function readNullableString(record: UnknownRecord, field: string): string | null {
  const value = readRequired(record, field);
  if (value !== null && typeof value !== 'string') {
    throw invalidRecord(`Поле ${field} должно быть строкой или null.`);
  }
  return value;
}

export function readNumber(record: UnknownRecord, field: string): number {
  const value = readRequired(record, field);
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw invalidRecord(`Поле ${field} должно быть конечным числом.`);
  }
  return value;
}

export function readNullableNumber(record: UnknownRecord, field: string): number | null {
  const value = readRequired(record, field);
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    throw invalidRecord(`Поле ${field} должно быть конечным числом или null.`);
  }
  return value;
}

export function readStringArray(record: UnknownRecord, field: string): string[] {
  const value = readRequired(record, field);
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    throw invalidRecord(`Поле ${field} должно быть массивом строк.`);
  }
  return [...value];
}

export function readRecordArray(record: UnknownRecord, field: string): UnknownRecord[] {
  const value = readRequired(record, field);
  if (!Array.isArray(value)) {
    throw invalidRecord(`Поле ${field} должно быть массивом объектов.`);
  }

  return value.map((item) => {
    if (typeof item !== 'object' || item === null || Array.isArray(item)) {
      throw invalidRecord(`Поле ${field} должно быть массивом объектов.`);
    }
    return item as UnknownRecord;
  });
}

export function readEntityId(record: UnknownRecord, field: string): EntityId {
  const value = readRequired(record, field);
  if (typeof value !== 'string') {
    throw new DomainError(
      'persistence.invalid_entity_id',
      `Поле ${field} должно содержать строковый идентификатор.`,
    );
  }

  if (value.trim() !== value) {
    throw new DomainError(
      'persistence.invalid_entity_id',
      `Поле ${field} содержит идентификатор с внешними пробелами.`,
    );
  }

  try {
    return EntityId.create(value);
  } catch (error: unknown) {
    throw new DomainError(
      'persistence.invalid_entity_id',
      `Поле ${field} содержит некорректный идентификатор.`,
      { cause: error },
    );
  }
}

export function readNullableEntityId(record: UnknownRecord, field: string): EntityId | null {
  const value = readRequired(record, field);
  if (value === null) {
    return null;
  }
  return readEntityId({ [field]: value }, field);
}

export function readIsoDate(record: UnknownRecord, field: string): Date {
  const value = readRequired(record, field);
  if (typeof value !== 'string') {
    throw invalidDate(field);
  }
  return parseIsoDate(value, field);
}

export function readNullableIsoDate(record: UnknownRecord, field: string): Date | null {
  const value = readRequired(record, field);
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw invalidDate(field);
  }
  return parseIsoDate(value, field);
}

export function readDayDate(record: UnknownRecord, field: string): DayDate {
  const value = readRequired(record, field);
  if (typeof value !== 'string') {
    throw invalidDate(field);
  }
  return parseDayDate(value, field);
}

export function readNullableDayDate(record: UnknownRecord, field: string): DayDate | null {
  const value = readRequired(record, field);
  if (value === null) {
    return null;
  }
  if (typeof value !== 'string') {
    throw invalidDate(field);
  }
  return parseDayDate(value, field);
}

export function createValueObject<T>(
  record: UnknownRecord,
  field: string,
  create: (value: string) => T,
): T {
  const value = readString(record, field);
  try {
    return create(value);
  } catch (error: unknown) {
    throw invalidRecord(`Поле ${field} содержит некорректное значение.`, error);
  }
}

export function createNullableValueObject<T>(
  record: UnknownRecord,
  field: string,
  create: (value: string) => T,
): T | null {
  const value = readNullableString(record, field);
  if (value === null) {
    return null;
  }
  try {
    return create(value);
  } catch (error: unknown) {
    throw invalidRecord(`Поле ${field} содержит некорректное значение.`, error);
  }
}

export function toNullableIsoDate(value: Date | null): string | null {
  return value?.toISOString() ?? null;
}

export function invalidRecord(message: string, cause?: unknown): DomainError {
  return cause === undefined
    ? new DomainError('persistence.invalid_record', message)
    : new DomainError('persistence.invalid_record', message, { cause });
}

function readRequired(record: UnknownRecord, field: string): unknown {
  if (!Object.hasOwn(record, field) || record[field] === undefined) {
    throw invalidRecord(`В записи отсутствует обязательное поле ${field}.`);
  }
  return record[field];
}

function parseIsoDate(value: string, field: string): Date {
  if (!ISO_UTC_PATTERN.test(value)) {
    throw invalidDate(field);
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime()) || date.toISOString() !== value) {
    throw invalidDate(field);
  }
  return date;
}

function parseDayDate(value: string, field: string): DayDate {
  try {
    return DayDate.create(value);
  } catch (error: unknown) {
    throw new DomainError(
      'persistence.invalid_date',
      `Поле ${field} содержит некорректную календарную дату.`,
      { cause: error },
    );
  }
}

function invalidDate(field: string): DomainError {
  return new DomainError(
    'persistence.invalid_date',
    `Поле ${field} должно содержать ISO-строку UTC.`,
  );
}
