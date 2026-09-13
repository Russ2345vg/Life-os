import type { DayDate, LifeAction } from '../../domain';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { JournalLifeActionChange } from '../ports/JournalUnitOfWork';

export async function clearPreviousMainActions(
  repository: LifeActionRepository,
  date: DayDate,
  selected: LifeAction,
): Promise<JournalLifeActionChange[]> {
  const actions = await repository.findByDate(date);
  return actions
    .filter(
      (action) =>
        !action.id.equals(selected.id) &&
        action.isNext &&
        !action.isArchived() &&
        action.status !== 'completed' &&
        action.status !== 'cancelled',
    )
    .map((action) => {
      const expectedVersion = action.version;
      action.setPlan(action.plannedDate, false);
      return { lifeAction: action, expectedVersion };
    });
}
