import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import { Day, DayDate } from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';
import { createVoiceCommandController } from './createVoiceCommandController';
import type { LifeOsApplication } from './LifeOsApplication';
import {
  completeLifeAction,
  createReadyLifeAction,
} from '../../test/helpers/LifeActionTestFactory';

const today = DayDate.create('2026-09-08');
const apps: LifeOsApplication[] = [];
afterEach(() => {
  apps.splice(0).forEach((app) => app.close());
});
async function setup() {
  const application = await createLifeOsApplication({
    database: new LifeOsIndexedDb(new IDBFactory()),
    currentDateProvider: new FakeCurrentDateProvider(today),
    clock: new FakeClock(new Date('2026-09-08T09:00:00Z')),
    idGenerator: new FakeIdGenerator(),
  });
  apps.push(application);
  const destinations: string[] = [];
  const controller = createVoiceCommandController(application, (destination) => {
    destinations.push(destination);
  });
  return { application, controller, destinations };
}
async function confirm(controller: ReturnType<typeof createVoiceCommandController>) {
  const state = controller.getSnapshot();
  expect(state.status).toBe('preview');
  if (state.status === 'preview')
    await Promise.all([controller.confirm(state.revision), controller.confirm(state.revision)]);
}
describe('voice commands with real application services', () => {
  it('asks for a new target name after no match without asking for the reason again', async () => {
    const { controller } = await setup();
    await controller.submit('Добавь задачу купить хлеб завтра');
    await confirm(controller);
    await controller.submit('Перенеси задачу неизвестная на пятницу');
    await controller.answer('Магазин закрыт');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'clarification',
      context: { field: 'title' },
    });
    await controller.answer('купить хлеб');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'preview',
      command: { payload: { query: 'купить хлеб', reason: 'Магазин закрыт', date: '2026-09-11' } },
    });
  });
  it('extracts unsupported time, asks explicitly, and saves only after a fresh preview', async () => {
    const { application, controller } = await setup();
    await controller.submit('Завтра в десять мне надо купить продукты');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'clarification',
      context: { field: 'omit_time', draft: { time: '10:00' } },
    });
    expect(
      await application.getDecisionsForDate.execute(DayDate.create('2026-09-09')),
    ).toHaveLength(0);
    await controller.answer('без времени');
    await confirm(controller);
    expect(
      await application.getDecisionsForDate.execute(DayDate.create('2026-09-09')),
    ).toHaveLength(1);
  });
  it('retains goal title and requires explicit omission of unsupported deadline', async () => {
    const { application, controller } = await setup();
    await controller.submit('Создай цель накопить 300 тысяч до первого декабря');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'clarification',
      context: { field: 'omit_deadline', draft: { date: '2026-12-01' } },
    });
    await controller.answer('да');
    expect(controller.getSnapshot().status).toBe('clarification');
    await controller.answer('без срока');
    await confirm(controller);
    expect(await application.getGoals.execute()).toMatchObject([{ title: 'накопить 300 тысяч' }]);
  });
  it('resolves all matching tasks, allows explicit selection, and moves only the selected task', async () => {
    const { application, controller } = await setup();
    for (const date of ['сегодня', 'завтра']) {
      await controller.submit(`Добавь задачу купить продукты ${date}`);
      await confirm(controller);
    }
    await controller.submit('Перенеси задачу купить продукты на пятницу');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'clarification',
      context: { field: 'reason' },
    });
    await controller.answer('Магазин закрыт');
    const selection = controller.getSnapshot();
    expect(selection.status).toBe('selection');
    if (selection.status !== 'selection') throw new Error('selection expected');
    expect(selection.targets).toHaveLength(2);
    controller.selectTarget(selection.revision, 'invented');
    expect(controller.getSnapshot().status).toBe('selection');
    const target = selection.targets.find((item) => item.date === '2026-09-09')!;
    controller.selectTarget(selection.revision, target.id);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'preview',
      target: { date: '2026-09-09' },
    });
    await confirm(controller);
    expect(controller.getSnapshot().status).toBe('success');
    expect(await application.getDecisionsForDate.execute(today)).toHaveLength(1);
    expect(
      await application.getDecisionsForDate.execute(DayDate.create('2026-09-11')),
    ).toHaveLength(1);
  });
  it('rejects stale target before invoking a mutation', async () => {
    const { application, controller } = await setup();
    await controller.submit('Добавь задачу купить продукты завтра');
    await confirm(controller);
    await controller.submit('Перенеси задачу купить продукты на пятницу');
    await controller.answer('Магазин закрыт');
    const [task] = await application.getDecisionsForDate.execute(DayDate.create('2026-09-09'));
    await application.rescheduleDecisionSafely.execute({
      decisionId: task!.id,
      expectedVersion: task!.version,
      newPlannedDate: '2026-09-10',
      reason: 'Из другой вкладки',
    });
    await confirm(controller);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'error',
      code: 'voice_command.target_changed',
    });
    expect(
      await application.getDecisionsForDate.execute(DayDate.create('2026-09-11')),
    ).toHaveLength(0);
  });
  it('completes only through existing evidence rules and user-supplied result', async () => {
    const { application, controller } = await setup();
    await controller.submit('Добавь задачу позвонить в банк');
    await confirm(controller);
    await controller.submit('Отметь задачу позвонить в банк выполненной');
    await controller.answer('Получил справку');
    await confirm(controller);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'error',
      code: 'decision.no_completed_actions',
    });
    const [task] = await application.getDecisionsForDate.execute(today);
    await application.lifeActionRepository.save(
      completeLifeAction(createReadyLifeAction('done', today, { decisionId: task!.id })),
    );
    await controller.submit('Отметь задачу позвонить в банк выполненной');
    await controller.answer('Получил справку');
    await confirm(controller);
    expect(controller.getSnapshot().status).toBe('success');
    expect((await application.getDecisionsForDate.execute(today))[0]?.status).toBe('confirmed');
  });
  it('answers read-only task queries without confirmation or writes', async () => {
    const { application, controller } = await setup();
    await controller.submit('Добавь задачу купить продукты завтра');
    await confirm(controller);
    await controller.submit('Что у меня запланировано на завтра?');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'success',
      result: { items: [{ title: 'купить продукты' }] },
    });
    await controller.submit('Покажи активные цели');
    expect(controller.getSnapshot()).toMatchObject({ status: 'success', result: { items: [] } });
    expect(await application.getGoals.execute()).toHaveLength(0);
  });
  it('creates exactly one task on the previewed date only after confirmation', async () => {
    const { application, controller } = await setup();
    const date = DayDate.create('2026-09-09');
    await controller.submit('Добавь задачу купить продукты завтра');
    expect(await application.getDecisionsForDate.execute(date)).toHaveLength(0);
    await confirm(controller);
    const saved = await application.getDecisionsForDate.execute(date);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.title.toString()).toBe('купить продукты');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'success',
      result: { message: 'Задача создана' },
    });
  });
  it('cancels a goal and creates it only from a fresh confirmed preview', async () => {
    const { application, controller } = await setup();
    await controller.submit('Создай цель выучить английский');
    controller.cancel();
    expect(await application.getGoals.execute()).toHaveLength(0);
    await controller.submit('Создай цель выучить английский');
    await confirm(controller);
    expect(await application.getGoals.execute()).toMatchObject([
      { title: 'выучить английский', status: 'future', stage: 'idea' },
    ]);
  });
  it.each(['Запиши заметку идея', 'Добавь в дневник день прошёл хорошо', 'Сделай что-нибудь'])(
    'rejects unsupported intent before preview: %s',
    async (text) => {
      const { application, controller, destinations } = await setup();
      await controller.submit(text);
      expect(controller.getSnapshot().status).toBe('error');
      expect(await application.getGoals.execute()).toHaveLength(0);
      expect(destinations).toEqual([]);
    },
  );
  it('navigates immediately through the supplied shell callback', async () => {
    const { controller, destinations } = await setup();
    await controller.submit('Открой дневник');
    expect(destinations).toEqual(['journal']);
    expect(controller.getSnapshot().status).toBe('success');
  });
  it('rejects past dates before preview', async () => {
    const { controller } = await setup();
    await controller.submit('Добавь задачу купить продукты 2026-09-07');
    expect(controller.getSnapshot()).toMatchObject({
      status: 'clarification',
      context: { field: 'date' },
    });
  });
  it('does not redirect a date when the day is completed after preview', async () => {
    const { application, controller } = await setup();
    await controller.submit('Добавь задачу купить продукты сегодня');
    const day = Day.openCurrent({
      id: application.currentDay.id,
      currentDate: today,
      occurredAt: application.clock.now(),
      createdEventId: application.idGenerator.generate(),
      openedEventId: application.idGenerator.generate(),
    });
    day.complete(application.clock.now(), application.idGenerator.generate(), 'День закрыт');
    await application.dayRepository.save(day);
    await confirm(controller);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'error',
      code: 'decision.completed_day_is_immutable',
    });
    expect(await application.getDecisionsForDate.execute(today)).toHaveLength(0);
    expect(
      await application.getDecisionsForDate.execute(DayDate.create('2026-09-09')),
    ).toHaveLength(0);
  });
  it('reports duplicates without writing another task', async () => {
    const { application, controller } = await setup();
    for (let i = 0; i < 2; i++) {
      await controller.submit('Добавь задачу купить продукты завтра');
      await confirm(controller);
    }
    expect(controller.getSnapshot()).toMatchObject({
      status: 'error',
      code: 'decision.duplicate_for_date',
    });
    expect(
      await application.getDecisionsForDate.execute(DayDate.create('2026-09-09')),
    ).toHaveLength(1);
  });
  it('previews a goal at the current 200-character title limit without writing it', async () => {
    const { application, controller } = await setup();
    const title = 'а'.repeat(200);
    await controller.submit(`Создай цель ${title}`);
    expect(controller.getSnapshot()).toMatchObject({
      status: 'preview',
      command: { type: 'create_goal', payload: { title } },
    });
    expect(await application.getGoals.execute()).toHaveLength(0);
  });
  it.each([`Создай цель ${'а'.repeat(201)}`, `Добавь задачу ${'а'.repeat(201)}`])(
    'validates domain title limits before preview',
    async (text) => {
      const { controller } = await setup();
      await controller.submit(text);
      expect(controller.getSnapshot().status).toBe('error');
    },
  );
});
