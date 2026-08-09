import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { copyDate } from '../shared/dateCopy';

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
} as const;

export type JournalEntryType = (typeof JOURNAL_ENTRY_TYPE)[keyof typeof JOURNAL_ENTRY_TYPE];

export const JOURNAL_SUBJECT_TYPE = {
  day: 'Day',
  decision: 'Decision',
  lifeAction: 'LifeAction',
  workSession: 'WorkSession',
} as const;

export type JournalSubjectType = (typeof JOURNAL_SUBJECT_TYPE)[keyof typeof JOURNAL_SUBJECT_TYPE];

export type JournalMetadataValue = string | number | boolean | null;
export type JournalMetadata = Readonly<Record<string, JournalMetadataValue>>;

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

function normalizeOptionalLabel(value: string | null | undefined): string | null {
  if (value === undefined || value === null) return null;
  const normalized = value.trim();
  return normalized.length === 0 ? null : normalized;
}
