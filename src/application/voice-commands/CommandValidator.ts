import { DayDate } from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { VoiceCommand, VoiceDestination } from './CommandSchema';

const destinations: readonly VoiceDestination[] = [
  'today',
  'goals',
  'journal',
  'projects',
  'routine',
  'walks',
  'management',
  'spheres',
  'analytics',
  'settings',
  'tasks',
];
const invalid = () =>
  failure(
    new DomainError('voice_command.invalid', 'Команда не распознана однозначно. Уточните текст.'),
  );

function record(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null)
  );
}

function keys(value: Record<string, unknown>, allowed: readonly string[]): boolean {
  return Reflect.ownKeys(value).every((key) => typeof key === 'string' && allowed.includes(key));
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= 4000;
}

function date(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    DayDate.create(value);
    return true;
  } catch {
    return false;
  }
}

function time(value: unknown): value is string {
  return typeof value === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value);
}

/** Reconstruct, then freeze: no object owned by the interpreter reaches a confirmation. */
export function validateCommand(input: unknown): Result<VoiceCommand, DomainError> {
  if (!record(input) || !keys(input, ['type', 'payload']) || !record(input.payload))
    return invalid();
  const p = input.payload;
  let command: VoiceCommand;
  switch (input.type) {
    case 'create_task':
      if (
        !keys(p, ['title', 'date', 'time']) ||
        !text(p.title) ||
        !date(p.date) ||
        ('time' in p && !time(p.time))
      )
        return invalid();
      command = {
        type: input.type,
        payload: {
          title: p.title.trim(),
          date: p.date,
          ...(typeof p.time === 'string' ? { time: p.time } : {}),
        },
      };
      break;
    case 'create_goal':
      if (
        !keys(p, ['title', 'deadline']) ||
        !text(p.title) ||
        ('deadline' in p && !date(p.deadline))
      )
        return invalid();
      command = {
        type: input.type,
        payload: {
          title: p.title.trim(),
          ...(typeof p.deadline === 'string' ? { deadline: p.deadline } : {}),
        },
      };
      break;
    case 'create_note':
      if (!keys(p, ['content']) || !text(p.content)) return invalid();
      command = { type: input.type, payload: { content: p.content.trim() } };
      break;
    case 'create_journal_entry':
      if (!keys(p, ['content', 'date']) || !text(p.content) || !date(p.date)) return invalid();
      command = { type: input.type, payload: { content: p.content.trim(), date: p.date } };
      break;
    case 'search':
      if (
        !keys(p, ['scope', 'query']) ||
        (p.scope !== 'goals' && p.scope !== 'tasks') ||
        !text(p.query)
      )
        return invalid();
      command = { type: input.type, payload: { scope: p.scope, query: p.query.trim() } };
      break;
    case 'list_tasks':
      if (!keys(p, ['date']) || !date(p.date)) return invalid();
      command = { type: input.type, payload: { date: p.date } };
      break;
    case 'list_goals':
      if (!keys(p, ['status']) || p.status !== 'active') return invalid();
      command = { type: input.type, payload: { status: 'active' } };
      break;
    case 'complete_task':
      if (!keys(p, ['query', 'actualResult']) || !text(p.query) || !text(p.actualResult))
        return invalid();
      command = {
        type: input.type,
        payload: { query: p.query.trim(), actualResult: p.actualResult.trim() },
      };
      break;
    case 'reschedule_task':
      if (
        !keys(p, ['query', 'date', 'reason', 'time']) ||
        !text(p.query) ||
        !date(p.date) ||
        !text(p.reason) ||
        ('time' in p && !time(p.time))
      )
        return invalid();
      command = {
        type: input.type,
        payload: {
          query: p.query.trim(),
          date: p.date,
          reason: p.reason.trim(),
          ...(typeof p.time === 'string' ? { time: p.time } : {}),
        },
      };
      break;
    case 'navigate':
      if (
        !keys(p, ['destination']) ||
        !destinations.some((destination) => destination === p.destination)
      )
        return invalid();
      command = { type: input.type, payload: { destination: p.destination as VoiceDestination } };
      break;
    default:
      return invalid();
  }
  Object.freeze(command.payload);
  return success(Object.freeze(command));
}
