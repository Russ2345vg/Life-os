import type { JournalEntryType, JournalMetadata, JournalSubjectType } from '../../../domain';

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
  readonly createdAt: string;
}
