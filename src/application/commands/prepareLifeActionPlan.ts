import { LIFE_ACTION_STATUS, type LifeAction, type JournalEntry } from '../../domain';
import type { SetLifeActionPlanInput } from './SetLifeActionPlan';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import { DomainError } from '../../shared/errors/DomainError';
import { createLifeActionJournalEntries } from '../journal/createJournalEntries';
import { planningJournal } from '../planner/planningSupport';

export function prepareLifeActionPlan(
  action: LifeAction,
  input: SetLifeActionPlanInput,
  clock: Clock,
  ids: IdGenerator,
): readonly JournalEntry[] {
  if (input.allowedStatuses && !input.allowedStatuses.includes(action.status))
    throw new DomainError(
      'life_action.status_changed',
      'Состояние действия изменилось. Обновите список и повторите попытку.',
    );
  const previousDate = action.plannedDate?.toString() ?? null;
  const completed = action.status === LIFE_ACTION_STATUS.completed;
  const isNext = input.isNext ?? (input.plannedDate === null ? false : action.isNext);
  if (
    action.status !== LIFE_ACTION_STATUS.draft &&
    !completed &&
    previousDate !== (input.plannedDate?.toString() ?? null)
  ) {
    if (action.status === LIFE_ACTION_STATUS.inProgress)
      throw new DomainError(
        'life_action.plan_in_progress',
        'Дату выполняемого действия можно менять только через прежний рабочий процесс.',
      );
    if (input.plannedDate === null)
      throw new DomainError(
        'life_action.legacy_date_required',
        'У подготовленного действия можно изменить дату, но нельзя убрать её.',
      );
    action.reschedule(input.plannedDate, clock.now(), ids.generate());
  }
  action.setPlan(input.plannedDate, isNext);
  const occurrenceChanged =
    action.occurrence && previousDate !== (input.plannedDate?.toString() ?? null);
  if (occurrenceChanged)
    action.setPlanningMetadata({ occurrence: { ...action.occurrence!, manualDate: true } });
  return [
    ...createLifeActionJournalEntries(action),
    ...(occurrenceChanged
      ? [
          planningJournal(
            ids.generate().toString(),
            'LifeAction',
            action.id.toString(),
            'Дата повторения изменена',
            clock.now(),
            {
              ruleId: action.occurrence!.ruleId,
              slot: action.occurrence!.slot,
              previousDate,
              nextDate: action.plannedDate?.toString() ?? null,
            },
          ),
        ]
      : []),
  ];
}
