import { DomainError } from '../../shared/errors/DomainError';

export interface InboxIdea {
  readonly id: string;
  readonly title: string;
  readonly note: string | null;
  readonly status: 'inbox' | 'converted' | 'archived';
  readonly targetType: 'goal' | 'action' | null;
  readonly targetId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly version: number;
  readonly schemaVersion: 1;
}

export function inboxIdea(value: InboxIdea): InboxIdea {
  const title = typeof value.title === 'string' ? value.title.trim() : '';
  const note = typeof value.note === 'string' ? value.note.trim() || null : value.note;
  if (
    !title ||
    title.length > 200 ||
    (note !== null && (typeof note !== 'string' || note.length > 4000))
  )
    throw new DomainError(
      'inbox.invalid_text',
      'Укажите название до 200 символов и заметку до 4000 символов.',
    );
  if (
    !value.id ||
    typeof value.id !== 'string' ||
    !['inbox', 'converted', 'archived'].includes(value.status) ||
    !Number.isInteger(value.version) ||
    value.version < 1 ||
    value.schemaVersion !== 1 ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    !Number.isFinite(Date.parse(value.updatedAt)) ||
    (value.status === 'converted'
      ? !['goal', 'action'].includes(value.targetType ?? '') ||
        typeof value.targetId !== 'string' ||
        !value.targetId
      : value.targetType !== null || value.targetId !== null)
  )
    throw new DomainError('inbox.invalid_record', 'Не удалось прочитать входящую запись.');
  return Object.freeze({ ...value, title, note });
}
