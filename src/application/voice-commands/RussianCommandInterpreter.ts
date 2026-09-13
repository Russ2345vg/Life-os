import type { DayDate } from '../../domain';
import type { CommandInterpreter } from './CommandInterpreter';
import { CommandClarification, type CommandDraft } from './CommandClarification';
import { normalizeCommand } from './CommandNormalizer';
import type { VoiceCommand } from './CommandSchema';
import { extractRussianCommandDate } from './parseRussianCommandDate';
import { parseRussianCommandTime } from './parseRussianCommandTime';
import {
  assertSingleCommand,
  normalizeSpeech,
  parseDirectIntent,
  parseDraftIntent,
} from './RussianIntentParser';

/** Deterministic adapter. No services, entity IDs, database or execution access. */
export class RussianCommandInterpreter implements CommandInterpreter {
  public async interpret(text: string, today: DayDate): Promise<VoiceCommand> {
    assertSingleCommand(text);
    if (
      /^(?:пожалуйста[,\s]+)?(?:запиши|добавь|создай|сохрани|добавить)\s+(?:мысль|заметку|в дневник)/iu.test(
        text.trim(),
      )
    ) {
      const direct = parseDirectIntent(
        text.trim().replace(/^пожалуйста[,\s]+/iu, ''),
        today.toString(),
      );
      if (direct) return direct;
    }
    const source = normalizeSpeech(text);
    if (
      !/^(?:что у меня запланировано|покажи (?:мои )?задачи\s+(?:на |сегодня|завтра|послезавтра|через |в |\d))/iu.test(
        source,
      )
    ) {
      const direct = parseDirectIntent(source, today.toString());
      if (direct) return direct;
    }
    const date = extractRussianCommandDate(source, today);
    const time = parseRussianCommandTime(date.title);
    const intent = parseDraftIntent(time.title);
    const draft: CommandDraft = {
      ...intent,
      ...(date.value ? { date: date.value } : {}),
      ...(time.value ? { time: time.value } : {}),
      ...(date.issue ? { dateIssue: date.issue } : {}),
      ...(time.issue ? { timeIssue: time.issue } : {}),
    };
    return normalizeCommand(draft, today);
  }

  public async clarify(
    context: CommandClarification,
    answer: string,
    today: DayDate,
  ): Promise<VoiceCommand> {
    assertSingleCommand(answer);
    const text = normalizeSpeech(answer);
    let draft = { ...context.draft };
    switch (context.field) {
      case 'omit_time':
        if (!/^(?:без времени|продолжить без времени)$/iu.test(text)) throw context;
        delete draft.time;
        delete draft.timeIssue;
        break;
      case 'omit_deadline':
        if (!/^(?:без срока|продолжить без срока)$/iu.test(text)) throw context;
        delete draft.date;
        break;
      case 'date': {
        const date = extractRussianCommandDate(text, today);
        const time = parseRussianCommandTime(date.title);
        if (date.issue || !date.value || time.title)
          throw new CommandClarification(draft, 'date', date.issue ?? 'Укажите только новую дату.');
        draft = { ...draft, date: date.value, ...(time.value ? { time: time.value } : {}) };
        delete draft.dateIssue;
        if (time.value) delete draft.timeIssue;
        if (time.issue) draft = { ...draft, timeIssue: time.issue };
        if (draft.type === 'list_tasks') draft = { ...draft, title: '' };
        break;
      }
      case 'time': {
        if (/^без времени$/iu.test(text)) {
          delete draft.time;
          delete draft.timeIssue;
          break;
        }
        const time = parseRussianCommandTime(text);
        if (time.issue || !time.value || time.title)
          throw new CommandClarification(
            draft,
            'time',
            time.issue ?? 'Укажите только время, например «в 11 утра», или «без времени».',
          );
        draft = { ...draft, time: time.value };
        delete draft.timeIssue;
        break;
      }
      case 'title':
        draft = { ...draft, title: text };
        if (draft.type === 'complete_task') {
          delete draft.date;
          delete draft.time;
        }
        break;
      case 'reason':
        draft = { ...draft, reason: text };
        break;
      case 'actualResult':
        draft = { ...draft, actualResult: text };
        break;
    }
    return normalizeCommand(draft, today);
  }
}
