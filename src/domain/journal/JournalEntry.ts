import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { copyDate } from '../shared/dateCopy';
import { DomainError } from '../../shared/errors/DomainError';

export const JOURNAL_ENTRY_TYPE = {
  dayStarted: 'dayStarted',
  decisionCreated: 'decisionCreated',
  workSessionStarted: 'workSessionStarted',
  workSessionPaused: 'workSessionPaused',
  workSessionResumed: 'workSessionResumed',
  workSessionCompleted: 'workSessionCompleted',
  decisionRescheduled: 'decisionRescheduled',
  decisionCancelled: 'decisionCancelled',
  actionRescheduled: 'actionRescheduled',
  actionCompleted: 'actionCompleted',
  actionCancelled: 'actionCancelled',
  dayCompleted: 'dayCompleted',
  dataCorrected: 'dataCorrected',
  directionStrategicReviewed: 'directionStrategicReviewed',
} as const;

export type JournalEntryType = (typeof JOURNAL_ENTRY_TYPE)[keyof typeof JOURNAL_ENTRY_TYPE];

export const JOURNAL_SUBJECT_TYPE = {
  day: 'Day',
  decision: 'Decision',
  lifeAction: 'LifeAction',
  workSession: 'WorkSession',
  direction: 'Direction',
} as const;

export type JournalSubjectType = (typeof JOURNAL_SUBJECT_TYPE)[keyof typeof JOURNAL_SUBJECT_TYPE];

export type JournalMetadataValue = string | number | boolean | null;
export type JournalMetadata = Readonly<Record<string, JournalMetadataValue>>;

export const JOURNAL_CORRECTION_FIELD = {
  decisionCancelReason: 'decision.cancelReason',
  lifeActionActualResult: 'lifeAction.actualResult',
  lifeActionCancelReason: 'lifeAction.cancelReason',
} as const;

export type JournalCorrectionField =
  (typeof JOURNAL_CORRECTION_FIELD)[keyof typeof JOURNAL_CORRECTION_FIELD];

export interface JournalCorrectionData {
  readonly sourceEntryId: EntityId;
  readonly previousCorrectionId: EntityId | null;
  readonly field: JournalCorrectionField;
  readonly previousValue: string | null;
  readonly newValue: string;
  readonly reason: string;
  readonly commandId: EntityId;
}

export interface JournalEntryData {
  readonly id: EntityId;
  readonly type: JournalEntryType;
  readonly occurredAt: Date;
  readonly effectiveDate: DayDate;
  readonly subjectType: JournalSubjectType;
  readonly subjectId?: EntityId | null;
  readonly sphereId?: EntityId | null;
  readonly labelAtEvent?: string | null;
  readonly metadata?: JournalMetadata | null;
  readonly correction?: JournalCorrectionData | null;
  readonly createdAt: Date;
}

export class JournalEntry {
  public readonly id: EntityId;
  public readonly type: JournalEntryType;
  public readonly effectiveDate: DayDate;
  public readonly subjectType: JournalSubjectType;
  public readonly subjectId: EntityId | null;
  public readonly sphereId: EntityId | null;
  public readonly labelAtEvent: string | null;
  public readonly metadata: JournalMetadata | null;
  public readonly correction: JournalCorrectionData | null;
  readonly #occurredAt: Date;
  readonly #createdAt: Date;

  private constructor(data: JournalEntryData) {
    this.id = data.id;
    this.type = data.type;
    this.#occurredAt = copyDate(data.occurredAt);
    this.effectiveDate = data.effectiveDate;
    this.subjectType = data.subjectType;
    this.subjectId = data.subjectId ?? null;
    this.sphereId = data.sphereId ?? null;
    this.labelAtEvent = normalizeOptionalLabel(data.labelAtEvent);
    this.metadata =
      data.metadata === undefined || data.metadata === null
        ? null
        : Object.freeze({ ...data.metadata });
    this.correction = normalizeCorrection(data);
    this.#createdAt = copyDate(data.createdAt);
  }

  public static create(data: JournalEntryData): JournalEntry {
    return new JournalEntry(data);
  }

  public static rehydrate(data: JournalEntryData): JournalEntry {
    return new JournalEntry(data);
  }

  public get occurredAt(): Date {
    return copyDate(this.#occurredAt);
  }

  public get createdAt(): Date {
    return copyDate(this.#createdAt);
  }
}

function normalizeCorrection(data: JournalEntryData): JournalCorrectionData | null {
  const correction = data.correction ?? null;
  if (data.type !== JOURNAL_ENTRY_TYPE.dataCorrected) {
    if (correction !== null)
      throw invalidCorrection('Обычное событие не может содержать исправление.');
    return null;
  }
  if (correction === null)
    throw invalidCorrection('Для исправления не указаны проверяемые данные.');
  if (data.subjectId === undefined || data.subjectId === null) {
    throw invalidCorrection('Для исправления не указана связанная сущность.');
  }
  if (!correction.commandId.equals(data.id)) {
    throw invalidCorrection('Идентификатор команды не совпадает с идентификатором исправления.');
  }
  assertCorrectionFieldMatchesSubject(correction.field, data.subjectType);

  const newValue = correction.newValue.trim();
  const reason = correction.reason.trim();
  if (newValue.length === 0) throw invalidCorrection('Новое значение не может быть пустым.');
  if (reason.length === 0) throw invalidCorrection('Причина исправления обязательна.');
  if (reason.length > 2_000) throw invalidCorrection('Причина исправления слишком длинная.');
  const maximumValueLength =
    correction.field === JOURNAL_CORRECTION_FIELD.lifeActionActualResult ? 2_000 : 1_000;
  if (newValue.length > maximumValueLength) {
    throw invalidCorrection('Новое значение исправления слишком длинное.');
  }
  const previousValue = correction.previousValue?.trim() ?? null;
  if (previousValue !== null && previousValue.length > maximumValueLength) {
    throw invalidCorrection('Прежнее значение исправления слишком длинное.');
  }
  if (previousValue === newValue) {
    throw invalidCorrection('Новое значение должно отличаться от прежнего.');
  }

  return Object.freeze({
    sourceEntryId: correction.sourceEntryId,
    previousCorrectionId: correction.previousCorrectionId,
    field: correction.field,
    previousValue,
    newValue,
    reason,
    commandId: correction.commandId,
  });
}

function assertCorrectionFieldMatchesSubject(
  field: JournalCorrectionField,
  subjectType: JournalSubjectType,
): void {
  const expectedSubject =
    field === JOURNAL_CORRECTION_FIELD.decisionCancelReason
      ? JOURNAL_SUBJECT_TYPE.decision
      : JOURNAL_SUBJECT_TYPE.lifeAction;
  if (subjectType !== expectedSubject) {
    throw invalidCorrection('Поле исправления не соответствует типу связанной сущности.');
  }
}

function invalidCorrection(message: string): DomainError {
  return new DomainError('journal.invalid_correction', message);
}

function normalizeOptionalLabel(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}
