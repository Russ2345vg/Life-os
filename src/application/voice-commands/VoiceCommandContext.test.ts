import { describe, expect, it } from 'vitest';
import { DayDate } from '../../domain';
import { RussianCommandInterpreter } from './RussianCommandInterpreter';
import { VoiceCommandController } from './VoiceCommandController';
import { CommandRegistry } from './CommandRegistry';
import type { VoiceCommand } from './CommandSchema';

const today = DayDate.create('2026-09-08');
function setup() {
  const writes: VoiceCommand[] = [];
  const controller = new VoiceCommandController(
    new RussianCommandInterpreter(),
    new CommandRegistry({
      create_task: async (command) => {
        writes.push(command);
        return { message: 'Создано' };
      },
      reschedule_task: async (command) => {
        writes.push(command);
        return { message: 'Изменено' };
      },
    }),
    { getCurrentDate: () => today },
  );
  return { controller, writes };
}
describe('transient voice clarification', () => {
  it('removes only the temporal alternative connector when resolving time', async () => {
    const { controller } = setup();
    await controller.submit('Добавь задачу купить хлеб завтра в 10 или в 11');
    await controller.answer('без времени');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'preview',
      command: { payload: { title: 'купить хлеб', date: '2026-09-09' } },
    });
  });
  it('retains both pending temporal ambiguities until each is explicitly resolved', async () => {
    const { controller } = setup();
    await controller.submit('Добавь задачу купить хлеб завтра или послезавтра вечером');
    await controller.answer('в пятницу');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'clarification',
      context: { field: 'time' },
    });
    await controller.answer('в 11 утра');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'preview',
      command: { payload: { title: 'купить хлеб', date: '2026-09-11', time: '11:00' } },
    });
  });
  it('does not keep a conjunction from an ambiguous date in the title', async () => {
    const { controller } = setup();
    await controller.submit('Добавь задачу купить хлеб завтра или послезавтра');
    await controller.answer('в пятницу');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'preview',
      command: { payload: { title: 'купить хлеб' } },
    });
  });
  it('can recover a completion containing an unsupported date', async () => {
    const { controller } = setup();
    await controller.submit('Заверши задачу купить хлеб завтра');
    await controller.answer('купить хлеб');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'clarification',
      context: { field: 'actualResult', draft: { title: 'купить хлеб' } },
    });
  });
  it('retains title and date while asking for exact time', async () => {
    const { controller, writes } = setup();
    await controller.submit('Завтра вечером мне надо купить продукты');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'clarification',
      context: { field: 'time', draft: { title: 'купить продукты', date: '2026-09-09' } },
    });
    await controller.answer('в 11 утра');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'preview',
      command: { payload: { title: 'купить продукты', date: '2026-09-09', time: '11:00' } },
    });
    expect(writes).toEqual([]);
  });
  it('asks for the missing title without losing the date', async () => {
    const { controller } = setup();
    await controller.submit('Добавь задачу завтра');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'clarification',
      context: { field: 'title' },
    });
    await controller.answer('купить продукты');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'preview',
      command: { payload: { title: 'купить продукты', date: '2026-09-09' } },
    });
  });
  it('asks for invalid or past dates and preserves the remaining intent', async () => {
    for (const date of ['31 февраля', 'вчера', 'завтра послезавтра']) {
      const { controller } = setup();
      await controller.submit(`Добавь задачу купить продукты ${date}`);
      expect(controller.getSnapshot()).toMatchObject({
        status: 'clarification',
        context: { field: 'date' },
      });
      await controller.answer('в пятницу');
      expect(controller.getSnapshot()).toMatchObject({
        status: 'preview',
        command: { payload: { title: 'купить продукты', date: '2026-09-11' } },
      });
    }
  });
  it('clears the conversation on cancellation and ignores a late answer', async () => {
    const { controller, writes } = setup();
    await controller.submit('Добавь задачу завтра');
    controller.cancel();
    await controller.answer('купить продукты');
    expect(controller.getSnapshot().status).toBe('idle');
    expect(writes).toEqual([]);
  });
});
