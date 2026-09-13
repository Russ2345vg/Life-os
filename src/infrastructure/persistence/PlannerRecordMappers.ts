import { inboxIdea, type InboxIdea } from '../../domain/planner/InboxIdea';
import { focusPeriod, type FocusPeriod } from '../../domain/planner/FocusPeriod';
import { DomainError } from '../../shared/errors/DomainError';

function record(value: unknown): object {
  if (!value || typeof value !== 'object')
    throw new DomainError('planner.invalid_record', 'Не удалось прочитать запись.');
  return value;
}
export const InboxIdeaRecordMapper = {
  fromRecord: (value: unknown): InboxIdea => inboxIdea(record(value) as InboxIdea),
  toRecord: (value: InboxIdea): InboxIdea => inboxIdea(value),
};
export const FocusPeriodRecordMapper = {
  fromRecord: (value: unknown): FocusPeriod => focusPeriod(record(value) as FocusPeriod),
  toRecord: (value: FocusPeriod): FocusPeriod => focusPeriod(value),
};
