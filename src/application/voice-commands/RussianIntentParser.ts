import { DomainError } from '../../shared/errors/DomainError';
import type { VoiceCommand, VoiceDestination } from './CommandSchema';
import type { CommandDraft } from './CommandClarification';

const destinations: Readonly<Record<string, VoiceDestination>> = {
  управление: 'management',
  управлению: 'management',
  сферы: 'spheres',
  сферам: 'spheres',
  аналитику: 'analytics',
  аналитике: 'analytics',
  настройки: 'settings',
  настройкам: 'settings',
  задачи: 'tasks',
  задачам: 'tasks',
  решения: 'tasks',
  решениям: 'tasks',
  день: 'today',
  сегодня: 'today',
  цели: 'goals',
  целям: 'goals',
  дневник: 'journal',
  дневнику: 'journal',
  историю: 'journal',
  истории: 'journal',
  проекты: 'goals',
  проектам: 'goals',
  распорядок: 'routine',
  распорядку: 'routine',
  прогулки: 'walks',
  прогулкам: 'walks',
};
export function normalizeSpeech(text: string): string {
  return text
    .trim()
    .replace(/^(?:ну[,\s]+)?(?:пожалуйста[,\s]+)?/iu, '')
    .replace(/[,\s]+пожалуйста[.!?]*$/iu, '')
    .replace(/[.!?]+$/u, '')
    .replace(/\s+/gu, ' ')
    .trim();
}
export function assertSingleCommand(text: string): void {
  if (
    !text.trim() ||
    text.length > 4000 ||
    /(?:\sи\s|\sзатем\s|\sпотом\s|[;.!?]\s*)(?:создай|добавь|удали|открой|запиши|перейди|перенеси|отметь|запланируй|покажи)/iu.test(
      text,
    )
  )
    throw unsupported();
}
export function unsupported(): DomainError {
  return new DomainError(
    'voice_command.unsupported',
    'Не удалось понять команду. Укажите одно действие и его содержание.',
  );
}
export function parseDirectIntent(text: string, date: string): VoiceCommand | null {
  const navigation =
    /^(?:открой|открыть|покажи|перейди|мне нужны)(?:\s+(?:к|в|на))?\s+(?:мои\s+)?(.+)$/iu.exec(
      text,
    );
  const destination = navigation?.[1]?.toLocaleLowerCase('ru-RU');
  if (destination && Object.hasOwn(destinations, destination))
    return { type: 'navigate', payload: { destination: destinations[destination]! } };
  if (/^покажи\s+(?:мои\s+)?активные цели$/iu.test(text))
    return { type: 'list_goals', payload: { status: 'active' } };
  const search = /^(?:найди|найти|покажи)\s+(?:цель|цели|задачу|задачи)(?:\s+про)?\s+(.+)$/iu.exec(
    text,
  );
  if (
    search &&
    !/^(?:мои )?задачи (?:на )?(?:сегодня|завтра)/iu.test(text.replace(/^покажи /iu, ''))
  )
    return {
      type: 'search',
      payload: {
        scope: /задач/iu.test(text.split(' ')[1] ?? '') ? 'tasks' : 'goals',
        query: search[1]!.trim(),
      },
    };
  const journal = /^(?:добавь|запиши|добавить)\s+в\s+дневник\s*:?\s+(.+)$/iu.exec(text);
  if (journal)
    return { type: 'create_journal_entry', payload: { content: journal[1]!.trim(), date } };
  const note = /^(?:запиши|добавь|создай|сохрани)\s+(?:мысль|заметку)\s*:?\s+(.+)$/iu.exec(text);
  if (note) return { type: 'create_note', payload: { content: note[1]!.trim() } };
  return null;
}
export function parseDraftIntent(text: string): CommandDraft {
  const patterns: readonly [CommandDraft['type'], RegExp][] = [
    ['list_tasks', /^(?:что у меня запланировано|покажи (?:мои )?задачи)(?:\s+|$)/iu],
    ['create_goal', /^(?:(?:создай|создать|добавь|добавить) цель|хочу поставить цель)(?:\s+|$)/iu],
    ['complete_task', /^(?:отметь (?:задачу )?|заверши (?:задачу )?)/iu],
    ['reschedule_task', /^(?:перенеси|перенести)\s+(?:задачу\s+)?/iu],
    [
      'create_task',
      /^(?:(?:создай|создать|добавь|добавить) задачу|запланируй(?: задачу)?|мне (?:нужно|надо|необходимо))(?:\s*[:,]\s*|\s+|$)/iu,
    ],
  ];
  for (const [type, pattern] of patterns) {
    const match = pattern.exec(text);
    if (match) {
      let title = text.slice(match[0].length).trim();
      if (type === 'complete_task')
        title = title.replace(/\s+(?:выполненной|выполненным|выполнено)$/iu, '');
      if (type === 'create_task') title = title.replace(/^звонок\s+/iu, 'позвонить ');
      return { type, title };
    }
  }
  throw unsupported();
}
