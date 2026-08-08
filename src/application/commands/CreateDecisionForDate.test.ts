import { describe, expect, it } from 'vitest';
import type { Clock, DecisionRepository } from '../../application';
import {
  Day,
  DayDate,
  DECISION_KIND,
  DECISION_PRIORITY,
  DECISION_STATUS,
  type Decision,
  type EntityId,
} from '../../domain';
import { InMemoryDayRepository, InMemoryDecisionRepository } from '../../infrastructure';
import type { Result } from '../../shared/result/Result';
import {
  cancelDecision,
  confirmDecision,
  createPlannedDecision,
  markDecisionInProgress,
} from '../../test/helpers/DecisionTestFactory';
import { FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { MainDecisionLimitPolicy } from '../decision/MainDecisionLimitPolicy';
import { CreateDecisionForDate } from './CreateDecisionForDate';

const DATE = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T08:00:00.000+09:00');

describe('CreateDecisionForDate', () => {
  it('создаёт первое главное решение сразу запланированным с order 1', async () => {
    const context = createContext();

    const result = await context.command.execute({
      title: 'Подготовить рабочий экран',
      kind: DECISION_KIND.main,
      plannedDate: DATE,
      expectedResult: 'Экран доступен пользователю',
    });
    const decision = unwrap(result);

    expect(decision.status).toBe(DECISION_STATUS.planned);
    expect(decision.order).toBe(1);
    expect(decision.plannedDate?.equals(DATE)).toBe(true);
    expect(decision.expectedResult?.toString()).toBe('Экран доступен пользователю');
  });

  it.each([
    { occupiedOrders: [1], expectedOrder: 2 },
    { occupiedOrders: [1, 2], expectedOrder: 3 },
  ])(
    'выбирает первый свободный порядок $expectedOrder',
    async ({ occupiedOrders, expectedOrder }) => {
      const context = createContext();
      for (const order of occupiedOrders) {
        await context.repository.save(
          createPlannedDecision(`occupied-${order}`, DATE, DECISION_KIND.main, order),
        );
      }

      const result = await context.command.execute(mainInput(`Главное решение ${expectedOrder}`));

      expect(unwrap(result).order).toBe(expectedOrder);
    },
  );

  it('отклоняет четвёртое главное решение и ничего не сохраняет', async () => {
    const context = createContext();
    await seedThreeMainDecisions(context.repository);
    const saveCount = context.repository.saveCount;

    const result = await context.command.execute(mainInput('Четвёртое решение'));

    expectFailureCode(result, 'decision.main_limit_reached');
    expect(context.repository.saveCount).toBe(saveCount);
    expect(context.idGenerator.generatedCount).toBe(0);
    expect(context.clock.callCount).toBe(0);
  });

  it('разрешает дополнительное решение при трёх главных без order и expectedResult', async () => {
    const context = createContext();
    await seedThreeMainDecisions(context.repository);

    const result = await context.command.execute({
      title: 'Дополнительное решение',
      kind: DECISION_KIND.additional,
      plannedDate: DATE,
    });
    const decision = unwrap(result);

    expect(decision.status).toBe(DECISION_STATUS.planned);
    expect(decision.order).toBeNull();
    expect(decision.expectedResult).toBeNull();
  });

  it('требует expectedResult для главного решения', async () => {
    const context = createContext();

    const result = await context.command.execute({
      title: 'Главное решение',
      kind: DECISION_KIND.main,
      plannedDate: DATE,
    });

    expectFailureCode(result, 'decision.main_requires_expected_result');
    expect(context.repository.saveCount).toBe(0);
  });

  it('не требует expectedResult для дополнительного решения', async () => {
    const context = createContext();

    const result = await context.command.execute({
      title: 'Дополнительное решение',
      kind: DECISION_KIND.additional,
      plannedDate: DATE,
      expectedResult: '   ',
    });

    expect(unwrap(result).expectedResult).toBeNull();
  });

  it('использует одно время Clock и три отдельных идентификатора', async () => {
    const context = createContext();

    const decision = unwrap(await context.command.execute(mainInput('Проверить зависимости')));
    const events = decision.getUncommittedEvents();

    expect(context.clock.callCount).toBe(1);
    expect(context.idGenerator.generatedCount).toBe(3);
    expect(decision.createdAt).toEqual(NOW);
    expect(decision.plannedAt).toEqual(NOW);
    expect(events).toHaveLength(2);
    expect(events[0]?.eventId.equals(events[1]!.eventId)).toBe(false);
    expect(events.every((event) => event.occurredAt.getTime() === NOW.getTime())).toBe(true);
  });

  it('сохраняет итоговое решение ровно один раз', async () => {
    const context = createContext();

    const decision = unwrap(await context.command.execute(mainInput('Сохранить один раз')));

    expect(context.repository.saveCount).toBe(1);
    await expect(context.repository.findById(decision.id)).resolves.toBe(decision);
  });

  it('не сохраняет черновик после ошибки планирования', async () => {
    const context = createContext();

    const result = await context.command.execute({
      title: 'Неполное главное решение',
      kind: DECISION_KIND.main,
      plannedDate: DATE,
      expectedResult: ' ',
    });

    expectFailureCode(result, 'decision.main_requires_expected_result');
    expect(context.repository.saveCount).toBe(0);
    await expect(context.repository.findByDate(DATE)).resolves.toEqual([]);
  });

  it('не занимает порядок confirmed и cancelled решений', async () => {
    const context = createContext();
    await context.repository.save(confirmDecision(createPlannedDecision('confirmed', DATE)));
    await context.repository.save(cancelDecision(createPlannedDecision('cancelled', DATE)));

    const result = await context.command.execute(mainInput('Свободная первая позиция'));

    expect(unwrap(result).order).toBe(1);
  });

  it('учитывает in_progress главное решение как занятую позицию', async () => {
    const context = createContext();
    await context.repository.save(
      markDecisionInProgress(createPlannedDecision('running', DATE, DECISION_KIND.main, 1)),
    );

    const result = await context.command.execute(mainInput('Следующая позиция'));

    expect(unwrap(result).order).toBe(2);
  });

  it('возвращает ошибку пустого названия без сохранения', async () => {
    const context = createContext();

    const result = await context.command.execute(mainInput('   '));

    expectFailureCode(result, 'decision_title.invalid');
    expect(context.repository.saveCount).toBe(0);
  });

  it('сохраняет полные сведения этапа 11.1 в нормализованном виде', async () => {
    const context = createContext();

    const decision = unwrap(
      await context.command.execute({
        title: '  Выпустить этап 11.1  ',
        kind: DECISION_KIND.main,
        plannedDate: DATE,
        expectedResult: '  Форма создания решения проверена  ',
        reason: '  Нужен полный раздел решений  ',
        sphere: '  Разработка  ',
        price: '  Два часа сосредоточенной работы  ',
        sacrifices: '  Отложить необязательные улучшения  ',
        priority: DECISION_PRIORITY.high,
        projectReference: '  LifeOS  ',
      }),
    );

    expect(decision.title.toString()).toBe('Выпустить этап 11.1');
    expect(decision.expectedResult?.toString()).toBe('Форма создания решения проверена');
    expect(decision.reason).toBe('Нужен полный раздел решений');
    expect(decision.sphere).toBe('Разработка');
    expect(decision.price).toBe('Два часа сосредоточенной работы');
    expect(decision.sacrifices).toBe('Отложить необязательные улучшения');
    expect(decision.priority).toBe(DECISION_PRIORITY.high);
    expect(decision.projectReference).toBe('LifeOS');
  });

  it('отклоняет создание на прошедшую дату до чтения решений и генерации идентификаторов', async () => {
    const context = createContext();
    context.currentDateProvider.setCurrentDate(DayDate.create('2026-08-03'));

    const result = await context.command.execute(mainInput('Прошедшее решение'));

    expectFailureCode(result, 'decision.planned_date_in_past');
    expect(context.repository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(0);
    expect(context.clock.callCount).toBe(0);
  });

  it('не изменяет завершённый день', async () => {
    const context = createContext();
    const day = Day.openCurrent({
      id: context.idGenerator.generate(),
      currentDate: DATE,
      occurredAt: NOW,
      createdEventId: context.idGenerator.generate(),
      openedEventId: context.idGenerator.generate(),
    });
    day.complete(NOW, context.idGenerator.generate(), 'День закрыт');
    await context.dayRepository.save(day);
    const generatedBeforeCommand = context.idGenerator.generatedCount;

    const result = await context.command.execute(mainInput('Позднее решение'));

    expectFailureCode(result, 'decision.completed_day_is_immutable');
    expect(context.repository.saveCount).toBe(0);
    expect(context.idGenerator.generatedCount).toBe(generatedBeforeCommand);
    expect(context.clock.callCount).toBe(0);
  });

  it('отклоняет повтор того же активного решения на одной дате', async () => {
    const context = createContext();
    await context.repository.save(createPlannedDecision('duplicate', DATE, DECISION_KIND.main, 1));
    const saveCount = context.repository.saveCount;

    const result = await context.command.execute(mainInput('Решение duplicate'));

    expectFailureCode(result, 'decision.duplicate_for_date');
    expect(context.repository.saveCount).toBe(saveCount);
    expect(context.idGenerator.generatedCount).toBe(0);
    expect(context.clock.callCount).toBe(0);
  });
});

class CountingClock implements Clock {
  #callCount = 0;

  public now(): Date {
    this.#callCount += 1;
    return new Date(NOW.getTime());
  }

  public get callCount(): number {
    return this.#callCount;
  }
}

class CountingDecisionRepository implements DecisionRepository {
  readonly #repository = new InMemoryDecisionRepository();
  #saveCount = 0;

  public findById(id: EntityId): Promise<Decision | null> {
    return this.#repository.findById(id);
  }

  public findByDate(date: DayDate): Promise<readonly Decision[]> {
    return this.#repository.findByDate(date);
  }

  public async save(decision: Decision): Promise<void> {
    await this.#repository.save(decision);
    this.#saveCount += 1;
  }

  public get saveCount(): number {
    return this.#saveCount;
  }
}

function createContext(): {
  readonly repository: CountingDecisionRepository;
  readonly dayRepository: InMemoryDayRepository;
  readonly currentDateProvider: FakeCurrentDateProvider;
  readonly command: CreateDecisionForDate;
  readonly clock: CountingClock;
  readonly idGenerator: FakeIdGenerator;
} {
  const repository = new CountingDecisionRepository();
  const dayRepository = new InMemoryDayRepository();
  const currentDateProvider = new FakeCurrentDateProvider(DATE);
  const clock = new CountingClock();
  const idGenerator = new FakeIdGenerator('create-for-date');
  return {
    repository,
    dayRepository,
    currentDateProvider,
    command: new CreateDecisionForDate(
      repository,
      dayRepository,
      new MainDecisionLimitPolicy(repository),
      currentDateProvider,
      clock,
      idGenerator,
    ),
    clock,
    idGenerator,
  };
}

function mainInput(title: string) {
  return {
    title,
    kind: DECISION_KIND.main,
    plannedDate: DATE,
    expectedResult: 'Проверяемый результат',
  } as const;
}

async function seedThreeMainDecisions(repository: DecisionRepository): Promise<void> {
  for (const order of [1, 2, 3]) {
    await repository.save(createPlannedDecision(`main-${order}`, DATE, DECISION_KIND.main, order));
  }
}

function unwrap(result: Result<Decision, Error>): Decision {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function expectFailureCode(
  result: Result<Decision, { readonly code: string }>,
  code: string,
): void {
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
  }
}
