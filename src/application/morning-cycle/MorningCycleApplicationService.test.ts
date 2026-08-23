import { describe, expect, it } from 'vitest';
import { Day, DayDate, EntityId } from '../../domain';
import { InMemoryMorningCycleRepository } from '../../infrastructure/persistence/InMemoryMorningCycleRepository';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../test/helpers/Fakes';
import { MorningCycleApplicationService } from './MorningCycleApplicationService';

const TODAY = DayDate.create('2026-08-23');
const TOMORROW = DayDate.create('2026-08-24');
const NOW = new Date('2026-08-23T07:12:00.000+09:00');

describe('MorningCycleApplicationService', () => {
  it('создаёт и запускает единственный цикл текущего дня идемпотентно', async () => {
    const context = await createContext();

    const first = await context.service.start(TODAY);
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const second = await context.service.start(TODAY);

    expect(second.id.equals(first.id)).toBe(true);
    expect(second.startedAt).toEqual(NOW);
    expect(context.repository.all()).toHaveLength(1);
  });

  it('сохраняет один факт воды при повторном нажатии', async () => {
    const context = await createContext();
    await context.service.start(TODAY);

    const first = await context.service.completeWater(TODAY);
    context.clock.setTime(new Date('2026-08-23T08:00:00.000+09:00'));
    const second = await context.service.completeWater(TODAY);

    expect(second.waterCompletedAt).toEqual(first.waterCompletedAt);
    expect(second.waterAmountMl).toBe(250);
    expect(context.repository.all()).toHaveLength(1);
  });

  it('не изменяет прошлую или будущую дату', async () => {
    const context = await createContext();

    await expect(context.service.start(TOMORROW)).rejects.toMatchObject({
      code: 'morning_cycle.current_date_required',
    });
    expect(context.repository.all()).toHaveLength(0);
  });

  it('требует существующий день и запущенное утро для воды', async () => {
    const withoutDay = await createContext(false);
    await expect(withoutDay.service.start(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.day_not_found',
    });

    const context = await createContext();
    await expect(context.service.completeWater(TODAY)).rejects.toMatchObject({
      code: 'morning_cycle.not_found',
    });
  });
});

async function createContext(seedDay = true) {
  const dayRepository = new FakeDayRepository();
  if (seedDay) {
    dayRepository.seed(
      Day.createCurrentPlanned({
        id: EntityId.create('today'),
        currentDate: TODAY,
        occurredAt: new Date('2026-08-23T00:01:00.000+09:00'),
        createdEventId: EntityId.create('day-created'),
      }),
    );
  }
  const repository = new InMemoryMorningCycleRepository();
  const clock = new FakeClock(NOW);
  return {
    repository,
    clock,
    service: new MorningCycleApplicationService(
      repository,
      dayRepository,
      new FakeCurrentDateProvider(TODAY),
      clock,
      new FakeIdGenerator('morning'),
    ),
  };
}
