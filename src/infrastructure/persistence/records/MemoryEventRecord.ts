import type {
  MemoryContext,
  MemoryDiarySource,
  MemoryKind,
  MemoryPhoto,
} from '../../../domain/memory';
import type { AttachmentReference } from '../../../application/sync/attachments/AttachmentContracts';

export interface MemoryEventRecord {
  readonly id: string;
  readonly occurredOn: string;
  readonly title: string;
  readonly body: string;
  readonly kind: MemoryKind;
  readonly isHighlight: boolean;
  readonly context: MemoryContext | null;
  readonly diarySource: MemoryDiarySource | null;
  readonly photo: MemoryPhoto | null;
  readonly syncAttachment?: AttachmentReference | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly deletedAt: string | null;
  readonly version: number;
}
