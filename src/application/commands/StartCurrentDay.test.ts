import { describe, expect, it, vi } from 'vitest';
import {
  DAY_STATUS,
  DECISION_KIND,
  Day,
  DayDate,
  EntityId,
  LIFE_ACTION_STATUS,
  type LifeAction,
} from '../../domain';
import { InMemoryDecisionRepository, InMemoryLifeActionRepository } from '../../infrastructure';
import type { Result } from '../../shared/result/Result';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import {
  FakeClock,
  FakeCurrentDateProvider,
  FakeDayRepository,
  FakeIdGenerator,
} from '../../test/helpers/Fakes';
import {
  createReadyLifeAction,
  markLifeActionInProgress,
} from '../../test/helpers/LifeActionTestFactory';
import { StartCurrentDay, type StartCurrentDayResult } from './StartCurrentDay';

const TODAY = DayDate.create('2026-08-05');
const YESTERDAY = DayDate.create('2026-08-04');
const NOW = new Date('2026-08-05T08:30:00.000+09:00');

describe('StartCurrentDay', () => {
  it('атомарно открывает запланированный день при наличии главного решения', async () => {
    const context = await createContext();
    const save = vi.spyOn(context.dayRepository, 'save');
    const now = vi.spyOn(context.clock, 'now');

    const result = unwrap(await context.command.execute());

    expect(result.day.status).toBe(DAY_STATUS.open);
    expect(result.day.openedAt).toEqual(NOW);
    expect(result.day.version).toBe(2);
    expect(result.day.getUncommittedEvents().map((event) => event.eventType)).toEqual([
      'day.created',
      'day.opened',
    ]);
    expect(save).toHaveBeenCalledOnce();
    expect(now).toHaveBeenCalledOnce();
    expect(context.idGenerator.generatedCount).toBe(1);
  });

  it('возвращает первое выполняемое действие раньше готового', async () => {
    const ready = createReadyLifeAction('ready', TODAY, {
      createdAt: new Date('2026-08-05T07:00:00.000+09:00'),
    });
    const inProgress = markLifeActionInProgress(
      createReadyLifeAction('in-progress', TODAY, {
        createdAt: new Date('2026-08-05T08:00:00.000+09:00'),
      }),
    );
    const context = await createContext([ready, inProgress]);

    const result = unwrap(await context.command.execute());

    expect(result.firstLifeAction).toBe(inProgress);
    expect(result.firstLifeAction?.status).toBe(LIFE_ACTION_STATUS.inProgress);
  });

  it('для уже открытого дня идемпотентно возвращает состояние без записи и времени', async () => {
    const context = await createContext();
    const plannedDay = await context.dayRepository.findByDate(TODAY);
    plannedDay?.open(TODAY, NOW, EntityId.create('pre-opened-event'));
    if (plannedDay !== null) {
      plannedDay.clearUncommittedEvents();
    }
    const save = vi.spyOn(context.dayRepository, 'save');
    const now = vi.spyOn(context.clock, 'now');

    const result = unwrap(await context.command.execute());

    expect(result.day).toBe(plannedDay);
    expect(result.day.status).toBe(DAY_STATUS.open);
    expect(result.day.getUncommittedEvents()).toHaveLength(0);
    expect(save).not.toHaveBeenCalled();
    expect(now).not.toHaveBeenCalled();
    expect(context.idGenerator.generatedCount).toBe(0);
  });

  it('требует существующий текущий день', async () => {
    const context = await createContext([], false, false);

    expectFailureCode(await context.command.execute(), 'day.not_found');
  });

  it('запрещает начало завершённого дня', async () => {
    const context = await createContext();
    const day = await context.dayRepository.findByDate(TODAY);
    day?.open(TODAY, NOW, EntityId.create('opened-before-completion'));
    day?.complete(NOW, EntityId.create('completed-before-start'));

    expectFailureCode(await context.command.execute(), 'day.cannot_start');
  });

  it('требует хотя бы одно активное главное решение', async () => {
    const context = await createContext([], true, false);
    await context.decisionRepository.save(
      createPlannedDecision('additional', TODAY, DECISION_KIND.additional),
    );

    expectFailureCode(await context.command.execute(), 'day.main_decision_required');
    expect(context.dayRepository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
  });

  it('запрещает второй одновременно открытый день', async () => {
    const context = await createContext();
    context.dayRepository.seed(
      Day.openCurrent({
        id: EntityId.create('yesterday-open'),
        currentDate: YESTERDAY,
        occurredAt: NOW,
        createdEventId: EntityId.create('yesterday-created'),
        openedEventId: EntityId.create('yesterday-opened'),
      }),
    );

    expectFailureCode(await context.command.execute(), 'day.another_open_exists');
    expect(context.dayRepository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
  });
});

async function createContext(
  lifeActions: readonly LifeAction[] = [],
  seedDay = true,
  seedMainDecision = true,
): Promise<{
  command: StartCurrentDay;
  dayRepository: FakeDayRepository;
  decisionRepository: InMemoryDecisionRepository;
  clock: FakeClock;
  idGenerator: FakeIdGenerator;
}> {
  const dayRepository = new FakeDayRepository();
  const decisionRepository = new InMemoryDecisionRepository();
  const lifeActionRepository = new InMemoryLifeActionRepository();
  const clock = new FakeClock(NOW);
  const idGenerator = new FakeIdGenerator('start-day');

  if (seedDay) {
    dayRepository.seed(
      Day.createCurrentPlanned({
        id: EntityId.create('current-day'),
        currentDate: TODAY,
        occurredAt: new Date('2026-08-05T00:01:00.000+09:00'),
        createdEventId: EntityId.create('current-day-created'),
      }),
    );
  }

  if (seedMainDecision) {
    await decisionRepository.save(
      createPlannedDecision('main-decision', TODAY, DECISION_KIND.main, 1),
    );
  }

  for (const lifeAction of lifeActions) {
    await lifeActionRepository.save(lifeAction);
  }

  return {
    command: new StartCurrentDay(
      dayRepository,
      decisionRepository,
      lifeActionRepository,
      new FakeCurrentDateProvider(TODAY),
      clock,
      idGenerator,
    ),
    dayRepository,
    decisionRepository,
    clock,
    idGenerator,
  };
}

function unwrap(
  result: Result<StartCurrentDayResult, { readonly code: string }>,
): StartCurrentDayResult {
  expect(result.ok).toBe(true);
  if (!result.ok) {
    throw new Error(`Expected success, received ${result.error.code}`);
  }

  return result.value;
}

function expectFailureCode(
  result: Result<StartCurrentDayResult, { readonly code: string }>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (result.ok) {
    throw new Error(`Expected ${code}, received success`);
  }

  expect(result.error.code).toBe(code);
}
