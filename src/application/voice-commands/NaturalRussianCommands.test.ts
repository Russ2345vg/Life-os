import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { RussianCommandInterpreter } from './RussianCommandInterpreter';

const today = DayDate.create('2026-09-08');
const interpreter = new RussianCommandInterpreter();
describe('natural Russian commands', () => {
  it.each([
    'Добавить задачу, распланировать съем квартиры и разобраться в юридических вопросах.',
    'Создай задачу: распланировать съем квартиры и разобраться в юридических вопросах.',
    'Добавь задачу,распланировать съем квартиры и разобраться в юридических вопросах.',
  ])('accepts dictated punctuation after the task prefix: %s', async (text) => {
    expect(await interpreter.interpret(text, today)).toEqual({
      type: 'create_task',
      payload: {
        title: 'распланировать съем квартиры и разобраться в юридических вопросах',
        date: '2026-09-08',
      },
    });
  });
  it('preserves punctuation inside the task title', async () => {
    expect(await interpreter.interpret('Добавь задачу: купить хлеб, молоко и сыр.', today)).toEqual(
      {
        type: 'create_task',
        payload: { title: 'купить хлеб, молоко и сыр', date: '2026-09-08' },
      },
    );
  });
  it('asks for content after a punctuated empty task prefix', async () => {
    await expect(interpreter.interpret('Добавить задачу,', today)).rejects.toMatchObject({
      field: 'title',
    });
  });
  it('still rejects a second command after a punctuated prefix', async () => {
    await expect(
      interpreter.interpret('Добавь задачу, купить хлеб и открой дневник', today),
    ).rejects.toMatchObject({ code: 'voice_command.unsupported' });
  });
  it('does not read a day of month as a clock hour', async () => {
    expect(await interpreter.interpret('Добавь задачу встреча в 11 сентября', today)).toEqual({
      type: 'create_task',
      payload: { title: 'встреча', date: '2026-09-11' },
    });
  });
  it.each([
    ['в 10', '10:00'],
    ['в 10:30', '10:30'],
    ['в десять утра', '10:00'],
    ['в семь вечера', '19:00'],
    ['в двадцать три', '23:00'],
  ])('extracts exact time %s', async (time, expected) => {
    for (const text of [
      `Завтра ${time} мне надо позвонить в банк`,
      `Добавь задачу позвонить в банк завтра ${time}`,
      `Запланируй звонок в банк на завтра ${time}`,
    ])
      expect(await interpreter.interpret(text, today)).toMatchObject({
        type: 'create_task',
        payload: { title: 'позвонить в банк', date: '2026-09-09', time: expected },
      });
  });
  it.each([
    'Добавь задачу купить продукты',
    'Мне нужно купить продукты',
    'Мне надо купить продукты',
    'Запланируй купить продукты',
    'Создай задачу купить продукты',
    'Ну пожалуйста, мне нужно купить продукты, пожалуйста',
  ])('recognizes a single creation: %s', async (text) => {
    expect(await interpreter.interpret(text, today)).toMatchObject({
      type: 'create_task',
      payload: { title: 'купить продукты', date: '2026-09-08' },
    });
  });
  it.each([
    ['сегодня', '2026-09-08'],
    ['завтра', '2026-09-09'],
    ['послезавтра', '2026-09-10'],
    ['в пятницу', '2026-09-11'],
    ['в следующую пятницу', '2026-09-18'],
    ['через 3 дня', '2026-09-11'],
    ['через неделю', '2026-09-15'],
    ['15 сентября', '2026-09-15'],
    ['первого декабря', '2026-12-01'],
    ['1 декабря', '2026-12-01'],
    ['01.12', '2026-12-01'],
  ])('extracts %s independently of word order', async (date, expected) => {
    for (const text of [
      `${date} мне нужно купить продукты`,
      `Мне нужно ${date} купить продукты`,
      `Добавь задачу купить продукты ${date}`,
    ]) {
      expect(await interpreter.interpret(text, today)).toMatchObject({
        type: 'create_task',
        payload: { title: 'купить продукты', date: expected },
      });
    }
  });
  it.each(['Открой дневник', 'Покажи дневник', 'Перейди в дневник'])(
    'navigates: %s',
    async (text) => {
      expect(await interpreter.interpret(text, today)).toEqual({
        type: 'navigate',
        payload: { destination: 'journal' },
      });
    },
  );
  it.each([
    'Создай цель накопить 300 тысяч',
    'Хочу поставить цель накопить 300 тысяч',
    'Добавь цель накопить 300 тысяч',
  ])('creates goal: %s', async (text) => {
    expect(await interpreter.interpret(text, today)).toEqual({
      type: 'create_goal',
      payload: { title: 'накопить 300 тысяч' },
    });
  });
  it.each(['Что у меня запланировано на завтра?', 'Покажи мои задачи на завтра'])(
    'queries tasks: %s',
    async (text) => {
      expect(await interpreter.interpret(text, today)).toEqual({
        type: 'list_tasks',
        payload: { date: '2026-09-09' },
      });
    },
  );
});
