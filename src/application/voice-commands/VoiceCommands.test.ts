import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { RussianCommandInterpreter } from './RussianCommandInterpreter';
import { validateCommand } from './CommandValidator';
import { CommandRegistry } from './CommandRegistry';
import { VoiceCommandController } from './VoiceCommandController';
import type { CommandInterpreter } from './CommandInterpreter';
import type { VoiceCommand } from './CommandSchema';

const today = DayDate.create('2026-09-08');
const task = {
  type: 'create_task',
  payload: { title: 'Купить продукты', date: '2026-09-09' },
} as const;

function setup(interpreter: CommandInterpreter = new RussianCommandInterpreter()) {
  const executions: VoiceCommand[] = [];
  const registry = new CommandRegistry({
    create_task: async (command) => {
      executions.push(command);
      return { message: 'Создано' };
    },
    create_goal: async (command) => {
      executions.push(command);
      return { message: 'Создано' };
    },
    navigate: async (command) => {
      executions.push(command);
      return { message: 'Открыто' };
    },
    search: async (command) => {
      executions.push(command);
      return { message: 'Найдено' };
    },
  });
  const controller = new VoiceCommandController(interpreter, registry, {
    getCurrentDate: () => today,
  });
  return { controller, executions };
}

describe('RussianCommandInterpreter', () => {
  const interpreter = new RussianCommandInterpreter();
  it.each([
    ['Открой настройки', { type: 'navigate', payload: { destination: 'settings' } }],
    ['Открой сферы', { type: 'navigate', payload: { destination: 'spheres' } }],
    ['Перейди к управлению', { type: 'navigate', payload: { destination: 'management' } }],
    ['Открой аналитику', { type: 'navigate', payload: { destination: 'analytics' } }],
    ['Открой задачи', { type: 'navigate', payload: { destination: 'tasks' } }],
    ['Добавь задачу Купить продукты завтра', task],
    [
      'Добавь задачу Позвонить в банк',
      { type: 'create_task', payload: { title: 'Позвонить в банк', date: '2026-09-08' } },
    ],
    [
      'Создай цель Переехать в квартиру',
      { type: 'create_goal', payload: { title: 'Переехать в квартиру' } },
    ],
    [
      'Пожалуйста, создай задачу Позвонить в банк послезавтра',
      { type: 'create_task', payload: { title: 'Позвонить в банк', date: '2026-09-10' } },
    ],
    [
      'Создай цель Устроиться помощником машиниста до первого декабря',
      {
        type: 'create_goal',
        payload: { title: 'Устроиться помощником машиниста', deadline: '2026-12-01' },
      },
    ],
    [
      'Создай цель Накопить 300 тысяч',
      { type: 'create_goal', payload: { title: 'Накопить 300 тысяч' } },
    ],
    [
      'Запиши мысль: попробовать новый формат дневника',
      { type: 'create_note', payload: { content: 'попробовать новый формат дневника' } },
    ],
    [
      'Добавь в дневник: сегодня хорошо поработал',
      {
        type: 'create_journal_entry',
        payload: { content: 'сегодня хорошо поработал', date: '2026-09-08' },
      },
    ],
    [
      'Добавь в дневник: Сегодня хорошо поработал.',
      {
        type: 'create_journal_entry',
        payload: { content: 'Сегодня хорошо поработал.', date: '2026-09-08' },
      },
    ],
    ['Найди цель про квартиру', { type: 'search', payload: { scope: 'goals', query: 'квартиру' } }],
    ['Открой дневник', { type: 'navigate', payload: { destination: 'journal' } }],
    ['Перейди к целям', { type: 'navigate', payload: { destination: 'goals' } }],
  ])('interprets %s without executing it', async (text, expected) => {
    expect(await interpreter.interpret(text, today)).toEqual(expected);
  });

  it('resolves dates using the supplied calendar date across a year boundary', async () => {
    expect(
      await interpreter.interpret('Добавь задачу Купить хлеб завтра', DayDate.create('2026-12-31')),
    ).toMatchObject({ payload: { date: '2027-01-01' } });
  });

  it.each([
    'Удали цель Машина',
    'Добавь задачу',
    'Добавь задачу Банк 31 февраля',
    'Добавь задачу Банк вчера',
    'Добавь задачу Банк завтра послезавтра',
    'Добавь задачу Банк через неделю завтра',
    'Добавь задачу Банк завтра и создай цель Квартира',
  ])('rejects unsupported or ambiguous input: %s', async (text) => {
    await expect(interpreter.interpret(text, today)).rejects.toThrow();
  });
});

describe('CommandValidator', () => {
  it.each([
    { type: 'delete_goal', payload: { title: 'Машина' } },
    { ...task, confirmed: true },
    { type: 'create_task', payload: { ...task.payload, confirmed: true } },
    { type: 'create_task', payload: { title: ' ', date: '2026-09-09' } },
    { type: 'create_task', payload: { title: 'Банк', date: '2026-02-30' } },
    { type: 'navigate', payload: { destination: 'https://example.com' } },
    null,
    [task],
  ])('rejects invalid output from an interpreter', (value) => {
    expect(validateCommand(value).ok).toBe(false);
  });

  it('copies and freezes an accepted payload so the preview cannot be changed behind confirmation', () => {
    const input = { type: 'create_task', payload: { title: 'Банк', date: '2026-09-09' } };
    const result = validateCommand(input);
    input.payload.title = 'Другой заголовок';
    expect(result).toMatchObject({ ok: true, value: { payload: { title: 'Банк' } } });
    if (result.ok) expect(Object.isFrozen(result.value.payload)).toBe(true);
  });
});

describe('VoiceCommandController', () => {
  it('performs no mutation before confirming the current preview, and consumes confirmation once', async () => {
    const { controller, executions } = setup();
    await controller.submit('Добавь задачу Купить продукты завтра');
    expect(executions).toEqual([]);
    const preview = controller.getSnapshot();
    expect(preview.status).toBe('preview');
    if (preview.status !== 'preview') throw new Error('Expected preview');
    await Promise.all([controller.confirm(preview.revision), controller.confirm(preview.revision)]);
    expect(executions).toEqual([task]);
    expect(controller.getSnapshot().status).toBe('success');
  });

  it('invalidates confirmation on cancel or replacement', async () => {
    const { controller, executions } = setup();
    await controller.submit('Добавь задачу Банк завтра');
    const old = controller.getSnapshot();
    if (old.status !== 'preview') throw new Error('Expected preview');
    controller.cancel();
    await controller.confirm(old.revision);
    await controller.submit('Создай цель Квартира');
    await controller.confirm(old.revision);
    expect(executions).toEqual([]);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'preview',
      command: { type: 'create_goal' },
    });
  });

  it.each(['Открой дневник', 'Найди цель про квартиру'])(
    'executes read-only commands immediately: %s',
    async (text) => {
      const { controller, executions } = setup();
      await controller.submit(text);
      expect(executions).toHaveLength(1);
      expect(controller.getSnapshot().status).toBe('success');
    },
  );

  it('ignores delayed interpretation after cancellation', async () => {
    let resolve: (value: unknown) => void = () => {};
    const { controller, executions } = setup({
      interpret: () =>
        new Promise((done) => {
          resolve = done;
        }),
    });
    const pending = controller.submit('Открой дневник');
    controller.cancel();
    resolve({ type: 'navigate', payload: { destination: 'journal' } });
    await pending;
    expect(controller.getSnapshot().status).toBe('idle');
    expect(executions).toEqual([]);
  });

  it('keeps the latest preview when interpretations finish out of order', async () => {
    const resolvers: Array<(value: unknown) => void> = [];
    const { controller, executions } = setup({
      interpret: () =>
        new Promise((done) => {
          resolvers.push(done);
        }),
    });
    const first = controller.submit('первая');
    const second = controller.submit('вторая');
    resolvers[1]!({ type: 'create_goal', payload: { title: 'Квартира' } });
    await second;
    resolvers[0]!({ type: 'navigate', payload: { destination: 'journal' } });
    await first;
    expect(controller.getSnapshot()).toMatchObject({
      status: 'preview',
      text: 'вторая',
      command: { type: 'create_goal' },
    });
    expect(executions).toEqual([]);
  });

  it('does not accept a replacement or promise cancellation while an execution is in flight', async () => {
    let finish: (value: { message: string }) => void = () => {};
    let writes = 0;
    const controller = new VoiceCommandController(
      new RussianCommandInterpreter(),
      new CommandRegistry({
        create_goal: () => {
          writes++;
          return new Promise((done) => {
            finish = done;
          });
        },
      }),
      { getCurrentDate: () => today },
    );
    await controller.submit('Создай цель Квартира');
    const preview = controller.getSnapshot();
    if (preview.status !== 'preview') throw new Error('Expected preview');
    const pending = controller.confirm(preview.revision);
    controller.cancel();
    await controller.submit('Создай цель Машина');
    await controller.confirm(preview.revision);
    expect(controller.getSnapshot().status).toBe('executing');
    expect(writes).toBe(1);
    finish({ message: 'Цель создана' });
    await pending;
    expect(controller.getSnapshot().status).toBe('success');
  });

  it('does not preview or execute an unregistered operation', async () => {
    const { controller, executions } = setup();
    await controller.submit('Запиши мысль: хороший день');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'error',
      code: 'voice_command.unavailable',
    });
    expect(executions).toEqual([]);
  });

  it('does not allow the interpreter to declare a mutation confirmed', async () => {
    const { controller, executions } = setup({
      interpret: async () => ({ ...task, confirmed: true }),
    });
    await controller.submit('команда');
    expect(controller.getSnapshot().status).toBe('error');
    expect(executions).toEqual([]);
  });

  it('reports uncertain failures without allowing automatic or repeated execution', async () => {
    let writes = 0;
    const controller = new VoiceCommandController(
      new RussianCommandInterpreter(),
      new CommandRegistry({
        create_task: async () => {
          writes++;
          throw new Error('response lost after write');
        },
      }),
      { getCurrentDate: () => today },
    );
    await controller.submit('Добавь задачу Банк завтра');
    const preview = controller.getSnapshot();
    if (preview.status !== 'preview') throw new Error('Expected preview');
    await controller.confirm(preview.revision);
    await controller.confirm(preview.revision);
    expect(writes).toBe(1);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'error',
      code: 'voice_command.execution_unknown',
    });
  });
});
