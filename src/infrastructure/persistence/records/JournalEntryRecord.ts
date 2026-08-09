import type {
  JournalCorrectionField,
  JournalEntryType,
  JournalMetadata,
  JournalSubjectType,
} from '../../../domain';

export interface JournalCorrectionRecord {
  readonly sourceEntryId: string;
  readonly previousCorrectionId: string | null;
  readonly field: JournalCorrectionField;
  readonly previousValue: string | null;
  readonly newValue: string;
  readonly reason: string;
  readonly commandId: string;
}

export interface JournalEntryRecord {
  readonly id: string;
  readonly type: JournalEntryType;
  readonly occurredAt: string;
  readonly effectiveDate: string;
  readonly subjectType: JournalSubjectType;
  readonly subjectId: string | null;
  readonly sphereId: string | null;
  readonly labelAtEvent: string | null;
  readonly metadata: JournalMetadata | null;
  readonly correction?: JournalCorrectionRecord | null;
  readonly createdAt: string;
}
