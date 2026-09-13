import { DayDate } from '../../domain';
import { CommandClarification, type CommandDraft } from './CommandClarification';
import type { VoiceCommand } from './CommandSchema';

export function normalizeCommand(draft: CommandDraft, today: DayDate): VoiceCommand {
  if (draft.dateIssue) throw new CommandClarification(draft, 'date', draft.dateIssue);
  if (draft.timeIssue) throw new CommandClarification(draft, 'time', draft.timeIssue);
  if (!draft.title && draft.type !== 'list_tasks')
    throw new CommandClarification(
      draft,
      'title',
      draft.type === 'reschedule_task' || draft.type === 'complete_task'
        ? 'Как называется нужная задача?'
        : 'Как назвать объект?',
    );
  if (draft.date && draft.type !== 'list_tasks' && DayDate.create(draft.date).isBefore(today))
    throw new CommandClarification(
      draft,
      'date',
      'Указана прошедшая дата. Укажите сегодня или будущую дату.',
    );
  const time = draft.time ? { time: draft.time } : {};
  switch (draft.type) {
    case 'create_task':
      return {
        type: draft.type,
        payload: { title: draft.title, date: draft.date ?? today.toString(), ...time },
      };
    case 'create_goal':
      if (draft.time)
        throw new CommandClarification(
          draft,
          'omit_time',
          `Время ${draft.time} распознано, но цель не хранит время. Продолжить без времени?`,
        );
      return {
        type: draft.type,
        payload: { title: draft.title, ...(draft.date ? { deadline: draft.date } : {}) },
      };
    case 'list_tasks':
      if (!draft.date)
        throw new CommandClarification(draft, 'date', 'На какую дату показать задачи?');
      if (draft.time)
        throw new CommandClarification(
          draft,
          'omit_time',
          'Список задач доступен только на весь день. Продолжить без времени?',
        );
      if (draft.title)
        throw new CommandClarification(draft, 'date', 'Укажите только дату списка задач.');
      return { type: draft.type, payload: { date: draft.date } };
    case 'reschedule_task':
      if (!draft.date)
        throw new CommandClarification(draft, 'date', 'На какую дату перенести задачу?');
      if (!draft.reason)
        throw new CommandClarification(draft, 'reason', 'Укажите причину переноса.');
      return {
        type: draft.type,
        payload: { query: draft.title, date: draft.date, reason: draft.reason, ...time },
      };
    case 'complete_task':
      if (draft.date || draft.time)
        throw new CommandClarification(
          draft,
          'title',
          'Укажите точное название задачи без даты и времени.',
        );
      if (!draft.actualResult)
        throw new CommandClarification(
          draft,
          'actualResult',
          'Какой фактический результат получен?',
        );
      return {
        type: draft.type,
        payload: { query: draft.title, actualResult: draft.actualResult },
      };
  }
}
