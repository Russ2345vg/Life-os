import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_SESSION_STATUS,
  ActionActualResult,
  DAY_STATUS,
  DayDate,
  DECISION_KIND,
  DECISION_PRIORITY,
  DECISION_STATUS,
  EntityId,
  LIFE_ACTION_STATUS,
  SESSION_COMPLETION_KIND,
} from '../../domain';
import { SystemClock } from '../../infrastructure/clock/SystemClock';
import { SystemCurrentDateProvider } from '../../infrastructure/clock/SystemCurrentDateProvider';
import { CryptoIdGenerator } from '../../infrastructure/ids/CryptoIdGenerator';
import { IndexedDbActionSessionRepository } from '../../infrastructure/persistence/IndexedDbActionSessionRepository';
import { IndexedDbDayRepository } from '../../infrastructure/persistence/IndexedDbDayRepository';
import { IndexedDbDecisionRepository } from '../../infrastructure/persistence/IndexedDbDecisionRepository';
import { IndexedDbLifeActionRepository } from '../../infrastructure/persistence/IndexedDbLifeActionRepository';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import {
  TODAY_SCREEN_STATE,
  resolveTodayScreenState,
} from '../../presentation/pages/TodayScreenState';
import { LifeOsApplicationInitializationError } from './LifeOsApplicationInitializationError';
import { createLifeOsApplication } from './createLifeOsApplication';

const TODAY = DayDate.create('2026-08-02');
const NOW = new Date('2026-08-02T08:00:00.000+09:00');

describe('createLifeOsApplication', () => {
  it('открывает базу и собирает постоянные репозитории и системные службы', async () => {
    const application = await createLifeOsApplication({
      database: new LifeOsIndexedDb(new IDBFactory()),
    });

    expect(application.dayRepository).toBeInstanceOf(IndexedDbDayRepository);
    expect(application.decisionRepository).toBeInstanceOf(IndexedDbDecisionRepository);
    expect(application.lifeActionRepository).toBeInstanceOf(IndexedDbLifeActionRepository);
    expect(application.actionSessionRepository).toBeInstanceOf(IndexedDbActionSessionRepository);
    expect(application.clock).toBeInstanceOf(SystemClock);
    expect(application.currentDateProvider).toBeInstanceOf(SystemCurrentDateProvider);
    expect(application.idGenerator).toBeInstanceOf(CryptoIdGenerator);
    expect(application.currentDate).toBeInstanceOf(DayDate);
    expect(application.getDecisionById).toBeDefined();
    expect(application.getDecisionOverview).toBeDefined();
    expect(application.getDeletedDecisions).toBeDefined();
    expect(application.getLifeActionsForDate).toBeDefined();
    expect(application.getLifeActionsForDecision).toBeDefined();
    expect(application.createLifeActionForDecision).toBeDefined();
    expect(application.startCurrentDay).toBeDefined();
    expect(application.getEveningReview).toBeDefined();
    expect(application.completeCurrentDay).toBeDefined();
    expect(application.startLifeActionSession).toBeDefined();
    expect(application.pauseActionSession).toBeDefined();
    expect(application.resumeActionSession).toBeDefined();
    expect(application.completeActionSession).toBeDefined();
    expect(application.completeLifeAction).toBeDefined();
    expect(application.verifyLifeActionResult).toBeDefined();
    expect(application.confirmDecisionFromActions).toBeDefined();
    expect(application.updateDecisionDetails).toBeDefined();
    expect(application.cancelDecisionSafely).toBeDefined();
    expect(application.deleteDecisionSafely).toBeDefined();
    expect(application.restoreDeletedDecision).toBeDefined();
    expect(application.updateLifeActionDetails).toBeDefined();
    expect(application.cancelLifeActionSafely).toBeDefined();
    expect(application.rescheduleDecisionSafely).toBeDefined();
    expect(application.rescheduleLifeActionSafely).toBeDefined();
    expect(application.getActionSessionsForLifeAction).toBeDefined();
    expect(application.getUnfinishedActionSession).toBeDefined();
    await expect(
      application.dayRepository.findByDate(application.currentDateProvider.getCurrentDate()),
    ).resolves.not.toBeNull();

    application.close();
  });

  it('создаёт текущий день один раз и использует его после повторного запуска', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstIds = new FakeIdGenerator('first-start');
    const firstApplication = await createTestApplication(indexedDbFactory, firstIds);
    const firstDay = await firstApplication.dayRepository.findByDate(TODAY);

    expect(firstDay?.status).toBe(DAY_STATUS.planned);
    expect(firstIds.generatedCount).toBe(2);
    firstApplication.close();

    const secondIds = new FakeIdGenerator('second-start');
    const secondApplication = await createTestApplication(indexedDbFactory, secondIds);
    const restoredDay = await secondApplication.dayRepository.findByDate(TODAY);

    expect(restoredDay?.id.equals(firstDay!.id)).toBe(true);
    expect(restoredDay?.getUncommittedEvents()).toHaveLength(0);
    expect(secondIds.generatedCount).toBe(0);
    secondApplication.close();
  });

  it('инициализирует шесть стандартных сфер без дублей и сохраняет пользовательскую после F5', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('sphere-start'),
    );
    expect(
      (await firstApplication.getSpheres.execute()).active.map((sphere) => sphere.name).sort(),
    ).toEqual(['Дом', 'Деньги', 'Здоровье', 'Отношения', 'Работа', 'Развитие'].sort());
    const custom = await firstApplication.createSphere.execute({
      name: 'Творчество',
      description: 'Личные проекты',
    });
    expect(custom.ok).toBe(true);
    firstApplication.close();

    const reloaded = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('sphere-reload'),
    );
    const snapshot = await reloaded.getSpheres.execute();
    expect(snapshot.active).toHaveLength(7);
    expect(snapshot.active.filter((sphere) => sphere.name === 'Здоровье')).toHaveLength(1);
    expect(snapshot.active.find((sphere) => sphere.name === 'Творчество')).toMatchObject({
      description: 'Личные проекты',
      version: 1,
    });
    reloaded.close();
  });

  it('явно начинает день и восстанавливает открытое состояние после перезапуска', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('explicit-start'),
    );
    await firstApplication.createDecisionForDate.execute({
      title: 'Главное решение дня',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Проверить явное начало дня',
    });

    const started = await firstApplication.startCurrentDay.execute();

    expect(started.ok).toBe(true);
    if (started.ok) {
      expect(started.value.day.status).toBe(DAY_STATUS.open);
      expect(started.value.day.openedAt).toEqual(NOW);
    }
    firstApplication.close();

    const secondApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('explicit-start-reload'),
    );
    const restoredDay = await secondApplication.dayRepository.findByDate(TODAY);

    expect(restoredDay?.status).toBe(DAY_STATUS.open);
    expect(restoredDay?.openedAt).toEqual(NOW);
    secondApplication.close();
  });

  it('проводит полный вечерний цикл атомарно и восстанавливает его после F5', async () => {
    const indexedDbFactory = new IDBFactory();
    const clock = new FakeClock(NOW);
    const firstApplication = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator('evening-cycle'),
    });
    const decisionResult = await firstApplication.createDecisionForDate.execute({
      title: 'Главное решение текущего дня',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Проверить полный вечерний цикл',
    });
    expect(decisionResult.ok).toBe(true);
    if (!decisionResult.ok) return;
    expect((await firstApplication.startCurrentDay.execute()).ok).toBe(true);

    const completingResult = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decisionResult.value.id,
      title: 'Действие для завершения',
      expectedResult: 'Получен проверенный результат',
      plannedDate: TODAY,
    });
    const movingResult = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decisionResult.value.id,
      title: 'Действие для переноса',
      expectedResult: 'Продолжить завтра',
      plannedDate: TODAY,
    });
    expect(completingResult.ok).toBe(true);
    expect(movingResult.ok).toBe(true);
    if (!completingResult.ok || !movingResult.ok) return;

    clock.setTime(new Date('2026-08-02T09:00:00.000+09:00'));
    const sessionResult = await firstApplication.startLifeActionSession.execute({
      lifeActionId: completingResult.value.id,
    });
    expect(sessionResult.ok).toBe(true);
    if (!sessionResult.ok) return;
    clock.setTime(new Date('2026-08-02T10:00:00.000+09:00'));
    expect(
      (
        await firstApplication.completeActionSession.execute({
          sessionId: sessionResult.value.session.id,
          completionKind: SESSION_COMPLETION_KIND.completed,
          resultNote: 'Рабочая сессия завершена',
        })
      ).ok,
    ).toBe(true);

    clock.setTime(new Date('2026-08-02T20:30:00.000+09:00'));
    const completion = await firstApplication.completeCurrentDay.execute({
      summary: 'Полный цикл завершён без ручного изменения данных',
      actionResolutions: [
        {
          kind: 'complete',
          lifeActionId: completingResult.value.id,
          actualResult: 'Вечерний цикл проверен',
        },
        {
          kind: 'reschedule',
          lifeActionId: movingResult.value.id,
          newPlannedDate: '2026-08-03',
        },
      ],
      tomorrowDecisions: [
        {
          kind: DECISION_KIND.main,
          title: 'Проверить следующий день',
          expectedResult: 'Решение доступно после перезагрузки',
        },
      ],
    });

    expect(completion.ok).toBe(true);
    if (!completion.ok) return;
    expect(completion.value.day.status).toBe(DAY_STATUS.completed);
    firstApplication.close();

    const restoredApplication = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock: new FakeClock(new Date('2026-08-02T21:00:00.000+09:00')),
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator('evening-cycle-reload'),
    });
    const tomorrow = DayDate.create('2026-08-03');
    const [restoredDay, restoredTodayActions, restoredTomorrowActions, tomorrowDecisions] =
      await Promise.all([
        restoredApplication.dayRepository.findByDate(TODAY),
        restoredApplication.getLifeActionsForDate.execute(TODAY),
        restoredApplication.getLifeActionsForDate.execute(tomorrow),
        restoredApplication.getDecisionsForDate.execute(tomorrow),
      ]);

    expect(restoredDay?.status).toBe(DAY_STATUS.completed);
    expect(restoredDay?.summary).toBe('Полный цикл завершён без ручного изменения данных');
    expect(restoredTodayActions).toHaveLength(1);
    expect(restoredTodayActions[0]?.status).toBe(LIFE_ACTION_STATUS.completed);
    expect(restoredTomorrowActions.map((action) => action.id.toString())).toEqual([
      movingResult.value.id.toString(),
    ]);
    expect(tomorrowDecisions.map((decision) => decision.title.toString())).toEqual([
      'Проверить следующий день',
    ]);
    const repeated = await restoredApplication.completeCurrentDay.execute({
      summary: 'Повтор',
      actionResolutions: [],
      tomorrowDecisions: [],
    });
    expect(repeated.ok ? null : repeated.error.code).toBe('day.already_completed');
    restoredApplication.close();
  });

  it('завершает ранее открытый день через вечерний контроль и сохраняет сегодняшний день запланированным после F5', async () => {
    const indexedDbFactory = new IDBFactory();
    const staleDate = DayDate.create('2026-08-07');
    const currentDate = DayDate.create('2026-08-08');
    const staleClock = new FakeClock(new Date('2026-08-07T08:00:00.000+09:00'));
    const staleApplication = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock: staleClock,
      currentDateProvider: new FakeCurrentDateProvider(staleDate),
      idGenerator: new FakeIdGenerator('past-open-day'),
    });
    const staleDecision = await staleApplication.createDecisionForDate.execute({
      title: 'Решение незавершённого прошлого дня',
      kind: DECISION_KIND.main,
      plannedDate: staleDate,
      expectedResult: 'Прошлый день можно безопасно завершить позже',
    });
    expect(staleDecision.ok).toBe(true);
    expect((await staleApplication.startCurrentDay.execute()).ok).toBe(true);
    staleApplication.close();

    const recoveryClock = new FakeClock(new Date('2026-08-08T09:00:00.000+09:00'));
    const recoveryApplication = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock: recoveryClock,
      currentDateProvider: new FakeCurrentDateProvider(currentDate),
      idGenerator: new FakeIdGenerator('past-open-day-recovery'),
    });
    const currentDecision = await recoveryApplication.createDecisionForDate.execute({
      title: 'Главное решение сегодняшнего дня',
      kind: DECISION_KIND.main,
      plannedDate: currentDate,
      expectedResult: 'Сегодняшний день остаётся готовым к старту',
    });
    expect(currentDecision.ok).toBe(true);

    const review = await recoveryApplication.getEveningReview.execute(staleDate);
    expect(review.isRecoveryReview).toBe(true);
    expect(review.currentDate.equals(staleDate)).toBe(true);
    expect(review.tomorrowDate.equals(currentDate)).toBe(true);
    expect(review.tomorrowDecisions.map((decision) => decision.title.toString())).toContain(
      'Главное решение сегодняшнего дня',
    );

    const completion = await recoveryApplication.completeCurrentDay.execute(
      {
        summary: 'Прошлый день завершён через безопасное восстановление',
        actionResolutions: [],
        tomorrowDecisions: [],
      },
      staleDate,
    );
    expect(completion.ok).toBe(true);
    recoveryApplication.close();

    const restoredApplication = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock: recoveryClock,
      currentDateProvider: new FakeCurrentDateProvider(currentDate),
      idGenerator: new FakeIdGenerator('past-open-day-recovery-reload'),
    });
    const [restoredStaleDay, restoredCurrentDay, openDayConflict] = await Promise.all([
      restoredApplication.dayRepository.findByDate(staleDate),
      restoredApplication.dayRepository.findByDate(currentDate),
      restoredApplication.getOpenDayConflict.execute(),
    ]);

    expect(restoredStaleDay?.status).toBe(DAY_STATUS.completed);
    expect(restoredStaleDay?.summary).toBe('Прошлый день завершён через безопасное восстановление');
    expect(restoredCurrentDay?.status).toBe(DAY_STATUS.planned);
    expect(openDayConflict.openDays).toHaveLength(0);
    expect(
      (await restoredApplication.getDecisionsForDate.execute(currentDate)).map((decision) =>
        decision.title.toString(),
      ),
    ).toContain('Главное решение сегодняшнего дня');
    restoredApplication.close();
  });

  it('не открывает повторно завершённый сегодняшний день', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('first-start'),
    );
    const completedDay = await firstApplication.dayRepository.findByDate(TODAY);
    completedDay!.open(TODAY, NOW, EntityId.create('opened-event'));
    completedDay!.complete(NOW, EntityId.create('completed-event'));
    await firstApplication.dayRepository.save(completedDay!);
    firstApplication.close();

    const reloadIds = new FakeIdGenerator('reload');
    const reloadedApplication = await createTestApplication(indexedDbFactory, reloadIds);
    const restoredDay = await reloadedApplication.dayRepository.findByDate(TODAY);

    expect(restoredDay?.status).toBe(DAY_STATUS.completed);
    expect(restoredDay?.getUncommittedEvents()).toHaveLength(0);
    expect(reloadIds.generatedCount).toBe(0);
    reloadedApplication.close();
  });

  it('закрывает подключение через контейнер', async () => {
    const database = new LifeOsIndexedDb(new IDBFactory());
    const close = vi.spyOn(database, 'close');
    const application = await createLifeOsApplication({
      database,
      clock: new FakeClock(NOW),
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator(),
    });

    application.close();

    expect(close).toHaveBeenCalledOnce();
  });

  it('сохраняет созданное решение между запусками без дубликата', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('persistent'),
    );

    const createResult = await firstApplication.createDecisionForDate.execute({
      title: 'Сохранить решение постоянно',
      kind: DECISION_KIND.main,
      plannedDate: firstApplication.currentDate,
      expectedResult: 'Решение доступно после перезапуска',
    });
    expect(createResult.ok).toBe(true);
    firstApplication.close();

    const secondApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('reload'),
    );
    const restored = await secondApplication.getDecisionsForDate.execute(
      secondApplication.currentDate,
    );

    expect(restored).toHaveLength(1);
    expect(restored[0]?.title.toString()).toBe('Сохранить решение постоянно');
    expect(restored[0]?.order).toBe(1);
    secondApplication.close();
  });

  it('изолирует решения трёх дат в IndexedDB и восстанавливает их без дубликатов', async () => {
    const indexedDbFactory = new IDBFactory();
    const tomorrow = DayDate.create('2026-08-03');
    const nextWeek = DayDate.create('2026-08-09');
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('date-planning'),
    );

    const todayDecision = await firstApplication.createDecisionForDate.execute({
      title: 'Решение на сегодня',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Сегодняшний результат',
    });
    const tomorrowDecision = await firstApplication.createDecisionForDate.execute({
      title: 'Решение на завтра',
      kind: DECISION_KIND.main,
      plannedDate: tomorrow,
      expectedResult: 'Завтрашний результат',
    });
    const nextWeekDecision = await firstApplication.createDecisionForDate.execute({
      title: 'Дополнительное решение через неделю',
      kind: DECISION_KIND.additional,
      plannedDate: nextWeek,
    });

    expect(todayDecision.ok).toBe(true);
    expect(tomorrowDecision.ok).toBe(true);
    expect(nextWeekDecision.ok).toBe(true);
    firstApplication.close();

    const reloaded = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('date-planning-reload'),
    );
    const todayDecisions = await reloaded.getDecisionsForDate.execute(TODAY);
    const tomorrowDecisions = await reloaded.getDecisionsForDate.execute(tomorrow);
    const nextWeekDecisions = await reloaded.getDecisionsForDate.execute(nextWeek);
    const allIds = [...todayDecisions, ...tomorrowDecisions, ...nextWeekDecisions].map((decision) =>
      decision.id.toString(),
    );

    expect(todayDecisions.map((decision) => decision.title.toString())).toEqual([
      'Решение на сегодня',
    ]);
    expect(tomorrowDecisions.map((decision) => decision.title.toString())).toEqual([
      'Решение на завтра',
    ]);
    expect(nextWeekDecisions.map((decision) => decision.title.toString())).toEqual([
      'Дополнительное решение через неделю',
    ]);
    expect(new Set(allIds).size).toBe(3);
    reloaded.close();
  });

  it('сохраняет редактирование и безопасную отмену решения между запусками', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('decision-management'),
    );
    const created = await firstApplication.createDecisionForDate.execute({
      title: 'Исходное решение',
      kind: DECISION_KIND.main,
      plannedDate: firstApplication.currentDate,
      expectedResult: 'Исходный результат',
    });
    expect(created.ok).toBe(true);
    if (!created.ok) {
      throw created.error;
    }

    const updated = await firstApplication.updateDecisionDetails.execute({
      decisionId: created.value.id,
      expectedVersion: created.value.version,
      title: 'Отредактированное решение',
      reason: 'Сохранённая причина',
      expectedResult: 'Отредактированный результат',
      sphereId: EntityId.create('sphere-development'),
      price: 'Два часа',
      sacrifices: 'Не переключаться',
      priority: DECISION_PRIORITY.high,
      projectReference: 'LifeOS',
      kind: DECISION_KIND.main,
    });
    expect(updated.ok).toBe(true);

    const cancelled = await firstApplication.cancelDecisionSafely.execute({
      decisionId: created.value.id,
    });
    expect(cancelled.ok).toBe(true);
    firstApplication.close();

    const secondApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('decision-management-reload'),
    );
    const restored = await secondApplication.decisionRepository.findById(created.value.id);

    expect(restored?.title.toString()).toBe('Отредактированное решение');
    expect(restored?.reason).toBe('Сохранённая причина');
    expect(restored?.expectedResult?.toString()).toBe('Отредактированный результат');
    expect(restored?.sphereId?.toString()).toBe('sphere-development');
    expect(restored?.price).toBe('Два часа');
    expect(restored?.sacrifices).toBe('Не переключаться');
    expect(restored?.priority).toBe(DECISION_PRIORITY.high);
    expect(restored?.projectReference).toBe('LifeOS');
    expect(restored?.status).toBe(DECISION_STATUS.cancelled);
    expect(restored?.cancelReason?.toString()).toBe('Отменено пользователем');
    expect(restored?.getUncommittedEvents()).toHaveLength(0);
    secondApplication.close();
  });

  it('persists a ready linked action across application restarts without duplicates', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('persistent-action'),
    );
    const decisionResult = await firstApplication.createDecisionForDate.execute({
      title: 'Решение со связанным действием',
      kind: DECISION_KIND.main,
      plannedDate: firstApplication.currentDate,
      expectedResult: 'Решение имеет следующий шаг',
    });
    expect(decisionResult.ok).toBe(true);
    if (!decisionResult.ok) {
      throw decisionResult.error;
    }

    const actionResult = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decisionResult.value.id,
      title: 'Выполнить следующий шаг',
      expectedResult: 'Следующий шаг выполнен',
      plannedDate: firstApplication.currentDate,
    });
    expect(actionResult.ok).toBe(true);
    firstApplication.close();

    const secondApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('reload-action'),
    );
    const restored = await secondApplication.getLifeActionsForDecision.execute(
      decisionResult.value.id,
    );

    expect(restored).toHaveLength(1);
    expect(restored[0]?.decisionId?.equals(decisionResult.value.id)).toBe(true);
    expect(restored[0]?.status).toBe('ready');
    expect(restored[0]?.expectedResult?.toString()).toBe('Следующий шаг выполнен');
    secondApplication.close();
  });

  it('сохраняет перенос ready-действия в IndexedDB и обновляет поиск по дате', async () => {
    const indexedDbFactory = new IDBFactory();
    const newDate = DayDate.create('2026-08-10');
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('reschedule-persistence'),
    );
    const decision = await firstApplication.createDecisionForDate.execute({
      title: 'Решение с переносимым действием',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Действие остаётся связанным',
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) {
      throw decision.error;
    }
    const action = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decision.value.id,
      title: 'Перенести без дубликата',
      description: 'Описание сохраняется',
      expectedResult: 'Новая дата сохранена',
      plannedDate: TODAY,
    });
    expect(action.ok).toBe(true);
    if (!action.ok) {
      throw action.error;
    }

    const rescheduled = await firstApplication.rescheduleLifeActionSafely.execute({
      lifeActionId: action.value.id,
      newPlannedDate: newDate.toString(),
    });

    expect(rescheduled.ok).toBe(true);
    firstApplication.close();

    const reloaded = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('reschedule-persistence-reload'),
    );
    const restored = await reloaded.lifeActionRepository.findById(action.value.id);
    const oldDateActions = await reloaded.lifeActionRepository.findByDate(TODAY);
    const newDateActions = await reloaded.lifeActionRepository.findByDate(newDate);
    const linkedActions = await reloaded.lifeActionRepository.findByDecisionId(decision.value.id);

    expect(restored?.plannedDate?.equals(newDate)).toBe(true);
    expect(restored?.decisionId?.equals(decision.value.id)).toBe(true);
    expect(restored?.title.toString()).toBe('Перенести без дубликата');
    expect(restored?.description).toBe('Описание сохраняется');
    expect(restored?.expectedResult?.toString()).toBe('Новая дата сохранена');
    expect(restored?.status).toBe(LIFE_ACTION_STATUS.ready);
    expect(oldDateActions.some((item) => item.id.equals(action.value.id))).toBe(false);
    expect(newDateActions.filter((item) => item.id.equals(action.value.id))).toHaveLength(1);
    expect(linkedActions.filter((item) => item.id.equals(action.value.id))).toHaveLength(1);
    expect(restored?.getUncommittedEvents()).toHaveLength(0);
    reloaded.close();
  });

  it('атомарно сохраняет перенос Decision и связанного незавершённого действия', async () => {
    const indexedDbFactory = new IDBFactory();
    const newDate = DayDate.create('2026-08-10');
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('decision-reschedule-persistence'),
    );
    const decision = await firstApplication.createDecisionForDate.execute({
      title: 'Переносимое главное решение',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Решение сохранит свои сведения',
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) {
      throw decision.error;
    }
    const action = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decision.value.id,
      title: 'Связанное готовое действие',
      expectedResult: 'Дата действия останется прежней',
      plannedDate: TODAY,
    });
    expect(action.ok).toBe(true);
    if (!action.ok) {
      throw action.error;
    }
    const lifeActionSave = vi.spyOn(firstApplication.lifeActionRepository, 'save');
    lifeActionSave.mockClear();

    const rescheduled = await firstApplication.rescheduleDecisionSafely.execute({
      decisionId: decision.value.id,
      expectedVersion: decision.value.version,
      newPlannedDate: newDate.toString(),
      reason: 'Нужно выделить отдельный день',
    });

    expect(rescheduled.ok).toBe(true);
    expect(lifeActionSave).not.toHaveBeenCalled();
    firstApplication.close();

    const reloaded = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('decision-reschedule-persistence-reload'),
    );
    const restoredDecision = await reloaded.decisionRepository.findById(decision.value.id);
    const oldDateDecisions = await reloaded.decisionRepository.findByDate(TODAY);
    const newDateDecisions = await reloaded.decisionRepository.findByDate(newDate);
    const restoredAction = await reloaded.lifeActionRepository.findById(action.value.id);
    const linkedActions = await reloaded.lifeActionRepository.findByDecisionId(decision.value.id);

    expect(restoredDecision?.plannedDate?.equals(newDate)).toBe(true);
    expect(restoredDecision?.order).toBe(1);
    expect(restoredDecision?.status).toBe(DECISION_STATUS.planned);
    expect(restoredDecision?.title.toString()).toBe('Переносимое главное решение');
    expect(restoredDecision?.expectedResult?.toString()).toBe('Решение сохранит свои сведения');
    expect(restoredDecision?.rescheduleHistory[0]?.reason).toBe('Нужно выделить отдельный день');
    expect(oldDateDecisions.some((item) => item.id.equals(decision.value.id))).toBe(false);
    expect(newDateDecisions.filter((item) => item.id.equals(decision.value.id))).toHaveLength(1);
    expect(restoredAction?.decisionId?.equals(decision.value.id)).toBe(true);
    expect(restoredAction?.plannedDate?.equals(newDate)).toBe(true);
    expect(restoredAction?.status).toBe(LIFE_ACTION_STATUS.ready);
    expect(linkedActions.filter((item) => item.id.equals(action.value.id))).toHaveLength(1);
    expect(restoredDecision?.getUncommittedEvents()).toHaveLength(0);
    expect(restoredAction?.getUncommittedEvents()).toHaveLength(0);
    reloaded.close();
  });

  it('сохраняет отредактированные сведения ready-действия после повторного запуска', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('action-edit-persistence'),
    );
    const decision = await firstApplication.createDecisionForDate.execute({
      title: 'Решение для редактируемого действия',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Действие остаётся связанным',
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) {
      throw decision.error;
    }
    const action = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decision.value.id,
      title: 'Первоначальное действие',
      description: 'Первоначальное описание',
      expectedResult: 'Первоначальный результат',
      plannedDate: TODAY,
    });
    expect(action.ok).toBe(true);
    if (!action.ok) {
      throw action.error;
    }
    const originalDecisionId = action.value.decisionId;
    const originalPlannedDate = action.value.plannedDate;

    const updated = await firstApplication.updateLifeActionDetails.execute({
      lifeActionId: action.value.id,
      title: 'Отредактированное действие',
      description: 'Отредактированное описание',
      expectedResult: 'Отредактированный результат',
    });
    expect(updated.ok).toBe(true);
    firstApplication.close();

    const reloaded = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('action-edit-persistence-reload'),
    );
    const restored = await reloaded.lifeActionRepository.findById(action.value.id);

    expect(restored?.title.toString()).toBe('Отредактированное действие');
    expect(restored?.description).toBe('Отредактированное описание');
    expect(restored?.expectedResult?.toString()).toBe('Отредактированный результат');
    expect(restored?.decisionId?.equals(originalDecisionId!)).toBe(true);
    expect(restored?.plannedDate?.equals(originalPlannedDate!)).toBe(true);
    expect(restored?.status).toBe(LIFE_ACTION_STATUS.ready);
    expect(restored?.getUncommittedEvents()).toHaveLength(0);
    reloaded.close();
  });

  it('сохраняет отменённое действие, связь с решением и возможность создать замену', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('action-cancel-persistence'),
    );
    const decision = await firstApplication.createDecisionForDate.execute({
      title: 'Решение после отмены действия',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Можно выбрать другое действие',
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) {
      throw decision.error;
    }
    const action = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decision.value.id,
      title: 'Действие для безопасной отмены',
      expectedResult: 'История не удалена',
      plannedDate: TODAY,
    });
    expect(action.ok).toBe(true);
    if (!action.ok) {
      throw action.error;
    }

    const cancelled = await firstApplication.cancelLifeActionSafely.execute({
      lifeActionId: action.value.id,
    });
    expect(cancelled.ok).toBe(true);
    firstApplication.close();

    const reloaded = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('action-cancel-persistence-reload'),
    );
    const restored = await reloaded.lifeActionRepository.findById(action.value.id);
    const linkedActions = await reloaded.getLifeActionsForDecision.execute(decision.value.id);
    const unfinished = await reloaded.getUnfinishedActionSession.execute();
    const replacement = await reloaded.createLifeActionForDecision.execute({
      decisionId: decision.value.id,
      title: 'Заменяющее действие',
      expectedResult: 'Новый путь к результату',
      plannedDate: TODAY,
    });

    expect(restored?.status).toBe(LIFE_ACTION_STATUS.cancelled);
    expect(restored?.decisionId?.equals(decision.value.id)).toBe(true);
    expect(linkedActions.some((item) => item.id.equals(action.value.id))).toBe(true);
    expect(unfinished).toBeNull();
    expect(replacement.ok).toBe(true);
    expect(await reloaded.getLifeActionsForDecision.execute(decision.value.id)).toHaveLength(2);
    reloaded.close();
  });

  it('restores a started and then paused action session across application restarts', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('session-start'),
    );
    const decisionResult = await firstApplication.createDecisionForDate.execute({
      title: 'Решение с рабочей сессией',
      kind: DECISION_KIND.main,
      plannedDate: firstApplication.currentDate,
      expectedResult: 'Работа сохраняется между запусками',
    });
    expect(decisionResult.ok).toBe(true);
    if (!decisionResult.ok) {
      throw decisionResult.error;
    }

    const actionResult = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decisionResult.value.id,
      title: 'Продолжить после перезапуска',
      expectedResult: 'Сессия восстановлена',
      plannedDate: firstApplication.currentDate,
    });
    expect(actionResult.ok).toBe(true);
    if (!actionResult.ok) {
      throw actionResult.error;
    }

    const dayStartResult = await firstApplication.startCurrentDay.execute();
    expect(dayStartResult.ok).toBe(true);

    const startResult = await firstApplication.startLifeActionSession.execute({
      lifeActionId: actionResult.value.id,
    });
    expect(startResult.ok).toBe(true);
    if (!startResult.ok) {
      throw startResult.error;
    }
    const startedAt = startResult.value.session.startedAt;
    firstApplication.close();

    const secondApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('session-pause'),
    );
    const restoredActions = await secondApplication.getLifeActionsForDecision.execute(
      decisionResult.value.id,
    );
    const restoredSessions = await secondApplication.getActionSessionsForLifeAction.execute(
      actionResult.value.id,
    );
    const restoredUnfinished = await secondApplication.getUnfinishedActionSession.execute();

    expect(restoredActions[0]?.status).toBe(LIFE_ACTION_STATUS.inProgress);
    expect(restoredSessions).toHaveLength(1);
    expect(restoredSessions[0]?.status).toBe(ACTION_SESSION_STATUS.running);
    expect(restoredSessions[0]?.startedAt).toEqual(startedAt);
    expect(restoredUnfinished?.id.equals(startResult.value.session.id)).toBe(true);

    const pauseResult = await secondApplication.pauseActionSession.execute({
      sessionId: restoredSessions[0]!.id,
    });
    expect(pauseResult.ok).toBe(true);
    secondApplication.close();

    const thirdApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('session-reload'),
    );
    const pausedSession = await thirdApplication.getUnfinishedActionSession.execute();

    expect(pausedSession?.status).toBe(ACTION_SESSION_STATUS.paused);
    expect(pausedSession?.pausedAt).toEqual(NOW);
    thirdApplication.close();
  });

  it('persists a completed session while the action remains in progress across restart', async () => {
    const indexedDbFactory = new IDBFactory();
    const clock = new FakeClock(NOW);
    const firstApplication = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator('session-completion-a'),
    });
    const decisionResult = await firstApplication.createDecisionForDate.execute({
      title: 'Решение для завершения отдельной сессии',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Сессия сохранена отдельно',
    });
    expect(decisionResult.ok).toBe(true);
    if (!decisionResult.ok) {
      throw decisionResult.error;
    }
    const actionResult = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decisionResult.value.id,
      title: 'Продолжить действие позже',
      expectedResult: 'Действие остаётся выполняемым',
      plannedDate: TODAY,
    });
    expect(actionResult.ok).toBe(true);
    if (!actionResult.ok) {
      throw actionResult.error;
    }
    const dayStartResult = await firstApplication.startCurrentDay.execute();
    expect(dayStartResult.ok).toBe(true);

    const startResult = await firstApplication.startLifeActionSession.execute({
      lifeActionId: actionResult.value.id,
    });
    expect(startResult.ok).toBe(true);
    if (!startResult.ok) {
      throw startResult.error;
    }
    clock.setTime(new Date(NOW.getTime() + 5 * 60_000));
    await firstApplication.pauseActionSession.execute({ sessionId: startResult.value.session.id });
    clock.setTime(new Date(NOW.getTime() + 7 * 60_000));
    await firstApplication.resumeActionSession.execute({ sessionId: startResult.value.session.id });
    clock.setTime(new Date(NOW.getTime() + 20 * 60_000));
    const completion = await firstApplication.completeActionSession.execute({
      sessionId: startResult.value.session.id,
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote: 'Первый этап выполнен',
    });
    expect(completion.ok).toBe(true);
    firstApplication.close();

    const reloaded = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('session-completion-a-reload'),
    );
    const actions = await reloaded.getLifeActionsForDecision.execute(decisionResult.value.id);
    const sessions = await reloaded.getActionSessionsForLifeAction.execute(actionResult.value.id);
    const unfinished = await reloaded.getUnfinishedActionSession.execute();

    expect(actions[0]?.status).toBe(LIFE_ACTION_STATUS.inProgress);
    expect(unfinished).toBeNull();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.status).toBe(ACTION_SESSION_STATUS.completed);
    expect(sessions[0]?.pauseIntervals).toHaveLength(1);
    expect(sessions[0]?.workedDurationAt(new Date(NOW.getTime() + 60 * 60_000))).toBe(18 * 60_000);
    expect(sessions[0]?.pausedDurationAt(new Date(NOW.getTime() + 60 * 60_000))).toBe(2 * 60_000);
    expect(sessions[0]?.resultNote?.toString()).toBe('Первый этап выполнен');
    reloaded.close();
  });

  it('persists completed action result and completed session and prevents a new session', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('session-completion-b'),
    );
    const decisionResult = await firstApplication.createDecisionForDate.execute({
      title: 'Решение для полного завершения',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Действие завершено полностью',
    });
    expect(decisionResult.ok).toBe(true);
    if (!decisionResult.ok) {
      throw decisionResult.error;
    }
    const actionResult = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decisionResult.value.id,
      title: 'Завершить с фактическим результатом',
      expectedResult: 'Фактический результат сохранён',
      plannedDate: TODAY,
    });
    expect(actionResult.ok).toBe(true);
    if (!actionResult.ok) {
      throw actionResult.error;
    }
    const dayStartResult = await firstApplication.startCurrentDay.execute();
    expect(dayStartResult.ok).toBe(true);

    const startResult = await firstApplication.startLifeActionSession.execute({
      lifeActionId: actionResult.value.id,
    });
    expect(startResult.ok).toBe(true);
    if (!startResult.ok) {
      throw startResult.error;
    }
    const sessionCompletion = await firstApplication.completeActionSession.execute({
      sessionId: startResult.value.session.id,
      completionKind: SESSION_COMPLETION_KIND.interrupted,
      resultNote: 'Работа завершена досрочно, результат достигнут',
    });
    expect(sessionCompletion.ok).toBe(true);
    const actionCompletion = await firstApplication.completeLifeAction.execute({
      lifeActionId: actionResult.value.id,
      actualResult: ActionActualResult.create('Получен фактический результат'),
    });
    expect(actionCompletion.ok).toBe(true);
    firstApplication.close();

    const reloaded = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('session-completion-b-reload'),
    );
    const actions = await reloaded.getLifeActionsForDecision.execute(decisionResult.value.id);
    const sessions = await reloaded.getActionSessionsForLifeAction.execute(actionResult.value.id);
    const restart = await reloaded.startLifeActionSession.execute({
      lifeActionId: actionResult.value.id,
    });

    expect(actions[0]?.status).toBe(LIFE_ACTION_STATUS.completed);
    expect(actions[0]?.actualResult?.toString()).toBe('Получен фактический результат');
    expect(sessions[0]?.status).toBe(ACTION_SESSION_STATUS.completed);
    expect(sessions[0]?.completionKind).toBe(SESSION_COMPLETION_KIND.interrupted);
    expect(sessions[0]?.resultNote?.toString()).toBe(
      'Работа завершена досрочно, результат достигнут',
    );
    expect(restart.ok).toBe(false);
    reloaded.close();
  });

  it('persists decision confirmation from a completed action across restart', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('decision-confirmation'),
    );
    const decisionResult = await firstApplication.createDecisionForDate.execute({
      title: 'Подтвердить решение после выполненного действия',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Фактический результат решения сохранён',
    });
    expect(decisionResult.ok).toBe(true);
    if (!decisionResult.ok) {
      throw decisionResult.error;
    }
    const actionResult = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decisionResult.value.id,
      title: 'Получить проверяемый результат',
      expectedResult: 'Результат получен',
      plannedDate: TODAY,
    });
    expect(actionResult.ok).toBe(true);
    if (!actionResult.ok) {
      throw actionResult.error;
    }
    const dayStartResult = await firstApplication.startCurrentDay.execute();
    expect(dayStartResult.ok).toBe(true);

    const startResult = await firstApplication.startLifeActionSession.execute({
      lifeActionId: actionResult.value.id,
    });
    expect(startResult.ok).toBe(true);
    if (!startResult.ok) {
      throw startResult.error;
    }
    const sessionResult = await firstApplication.completeActionSession.execute({
      sessionId: startResult.value.session.id,
      completionKind: SESSION_COMPLETION_KIND.completed,
      resultNote: 'Работа завершена',
    });
    expect(sessionResult.ok).toBe(true);
    const actionCompletion = await firstApplication.completeLifeAction.execute({
      lifeActionId: actionResult.value.id,
      actualResult: ActionActualResult.create('Действие дало нужный результат'),
    });
    expect(actionCompletion.ok).toBe(true);
    const confirmation = await firstApplication.confirmDecisionFromActions.execute({
      decisionId: decisionResult.value.id,
      actualResult: 'Решение привело к фактическому результату',
    });
    expect(confirmation.ok).toBe(true);
    firstApplication.close();

    const reloaded = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('decision-confirmation-reload'),
    );
    const restoredDecision = await reloaded.getDecisionById.execute(decisionResult.value.id);
    const restoredActions = await reloaded.getLifeActionsForDecision.execute(
      decisionResult.value.id,
    );
    expect(restoredDecision.ok).toBe(true);
    if (!restoredDecision.ok) {
      throw restoredDecision.error;
    }
    expect(restoredDecision.value.status).toBe(DECISION_STATUS.confirmed);
    expect(restoredDecision.value.actualResultSummary?.toString()).toBe(
      'Решение привело к фактическому результату',
    );
    expect(restoredDecision.value.evidenceIds.map(String)).toEqual([
      actionResult.value.id.toString(),
    ]);
    expect(restoredActions[0]?.status).toBe(LIFE_ACTION_STATUS.completed);

    const repeatedConfirmation = await reloaded.confirmDecisionFromActions.execute({
      decisionId: decisionResult.value.id,
      actualResult: 'Повторное подтверждение',
    });
    const newAction = await reloaded.createLifeActionForDecision.execute({
      decisionId: decisionResult.value.id,
      title: 'Новое действие недоступно',
      expectedResult: 'Не должно сохраниться',
      plannedDate: TODAY,
    });
    expect(repeatedConfirmation.ok).toBe(false);
    expect(newAction.ok).toBe(false);
    reloaded.close();
  });

  it('восстанавливает данные карточки текущего действия и паузу после F5', async () => {
    const indexedDbFactory = new IDBFactory();
    const clock = new FakeClock(NOW);
    const firstApplication = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator('current-action-card'),
    });
    const decision = await firstApplication.createDecisionForDate.execute({
      title: 'Решение для текущего действия',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Карточка восстановлена',
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) throw decision.error;
    const action = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decision.value.id,
      title: 'Текущее действие после F5',
      expectedResult: 'Сессия и связь восстановлены',
      plannedDate: TODAY,
    });
    expect(action.ok).toBe(true);
    if (!action.ok) throw action.error;
    expect((await firstApplication.startCurrentDay.execute()).ok).toBe(true);
    clock.setTime(new Date('2026-08-02T09:00:00.000+09:00'));
    const started = await firstApplication.startLifeActionSession.execute({
      lifeActionId: action.value.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) throw started.error;
    clock.setTime(new Date('2026-08-02T09:25:00.000+09:00'));
    expect(
      (await firstApplication.pauseActionSession.execute({ sessionId: started.value.session.id }))
        .ok,
    ).toBe(true);
    firstApplication.close();

    const reloaded = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator('current-action-card-reload'),
    });
    const [actions, sessions, unfinished, restoredDecision] = await Promise.all([
      reloaded.getLifeActionsForDate.execute(TODAY),
      reloaded.getActionSessionsForLifeAction.execute(action.value.id),
      reloaded.getUnfinishedActionSession.execute(),
      reloaded.getDecisionById.execute(decision.value.id),
    ]);

    expect(actions).toHaveLength(1);
    expect(actions[0]?.status).toBe(LIFE_ACTION_STATUS.inProgress);
    expect(actions[0]?.expectedResult?.toString()).toBe('Сессия и связь восстановлены');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.status).toBe(ACTION_SESSION_STATUS.paused);
    expect(sessions[0]?.workedDurationAt(clock.now())).toBe(25 * 60 * 1_000);
    expect(unfinished?.id.equals(started.value.session.id)).toBe(true);
    expect(restoredDecision.ok).toBe(true);
    if (restoredDecision.ok) {
      expect(restoredDecision.value.title.toString()).toBe('Решение для текущего действия');
    }
    reloaded.close();
  });

  it('восстанавливает текущее и следующее действие из IndexedDB после F5', async () => {
    const indexedDbFactory = new IDBFactory();
    const clock = new FakeClock(NOW);
    const firstApplication = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator('next-action-recovery'),
    });
    const decision = await firstApplication.createDecisionForDate.execute({
      title: 'Решение с последовательностью действий',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Два действия восстановлены в правильном порядке',
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) throw decision.error;

    clock.setTime(new Date('2026-08-02T08:10:00.000+09:00'));
    const firstAction = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decision.value.id,
      title: 'Первое действие после F5',
      expectedResult: 'Показано текущим',
      plannedDate: TODAY,
    });
    expect(firstAction.ok).toBe(true);
    if (!firstAction.ok) throw firstAction.error;

    clock.setTime(new Date('2026-08-02T08:20:00.000+09:00'));
    const secondAction = await firstApplication.createLifeActionForDecision.execute({
      decisionId: decision.value.id,
      title: 'Второе действие после F5',
      expectedResult: 'Показано следующим',
      plannedDate: TODAY,
    });
    expect(secondAction.ok).toBe(true);
    expect((await firstApplication.startCurrentDay.execute()).ok).toBe(true);
    firstApplication.close();

    const reloaded = await createLifeOsApplication({
      database: new LifeOsIndexedDb(indexedDbFactory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator('next-action-recovery-reload'),
    });
    const [day, decisions, lifeActions, unfinishedSession] = await Promise.all([
      reloaded.dayRepository.findByDate(TODAY),
      reloaded.getDecisionsForDate.execute(TODAY),
      reloaded.getLifeActionsForDate.execute(TODAY),
      reloaded.getUnfinishedActionSession.execute(),
    ]);
    expect(day).not.toBeNull();
    if (day === null) throw new Error('Текущий день не восстановлен');

    const screenState = resolveTodayScreenState({
      day,
      decisionsStatus: 'ready',
      decisions,
      recoveryStatus: 'ready',
      lifeActions,
      unfinishedSession,
      isEveningControlOpen: false,
    });

    expect(screenState.kind).toBe(TODAY_SCREEN_STATE.dayStarted);
    if (screenState.kind === TODAY_SCREEN_STATE.dayStarted) {
      expect(screenState.currentLifeAction.title.toString()).toBe('Первое действие после F5');
      expect(screenState.nextLifeAction?.title.toString()).toBe('Второе действие после F5');
    }
    reloaded.close();
  });

  it('восстанавливает корзину решений после F5 через собранное приложение', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('decision-trash'),
    );
    const created = await firstApplication.createDecisionForDate.execute({
      title: 'Решение для проверки корзины',
      kind: DECISION_KIND.additional,
      plannedDate: TODAY,
    });
    expect(created.ok).toBe(true);
    if (!created.ok) throw created.error;

    const deleted = await firstApplication.deleteDecisionSafely.execute({
      decisionId: created.value.id,
      expectedVersion: created.value.version,
    });
    expect(deleted.ok).toBe(true);
    expect(await firstApplication.getDecisionsForDate.execute(TODAY)).toHaveLength(0);
    expect(await firstApplication.getDeletedDecisions.execute()).toHaveLength(1);
    firstApplication.close();

    const reloaded = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('decision-trash-reload'),
    );
    const trash = await reloaded.getDeletedDecisions.execute();
    expect(trash).toHaveLength(1);
    expect(trash[0]?.title.toString()).toBe('Решение для проверки корзины');

    const restored = await reloaded.restoreDeletedDecision.execute({
      decisionId: trash[0]!.id,
      expectedVersion: trash[0]!.version,
    });
    expect(restored.ok).toBe(true);
    expect(await reloaded.getDeletedDecisions.execute()).toHaveLength(0);
    expect(await reloaded.getDecisionsForDate.execute(TODAY)).toHaveLength(1);
    reloaded.close();
  });

  it('возвращает контролируемую ошибку и закрывает базу при сбое запуска', async () => {
    const database = new LifeOsIndexedDb(null);
    const close = vi.spyOn(database, 'close');

    const startup = createLifeOsApplication({ database });

    await expect(startup).rejects.toBeInstanceOf(LifeOsApplicationInitializationError);
    await expect(startup).rejects.toMatchObject({ code: 'app.initialization_failed' });
    expect(close).toHaveBeenCalledOnce();
  });
});

async function createTestApplication(indexedDbFactory: IDBFactory, idGenerator: FakeIdGenerator) {
  return createLifeOsApplication({
    database: new LifeOsIndexedDb(indexedDbFactory),
    clock: new FakeClock(NOW),
    currentDateProvider: new FakeCurrentDateProvider(TODAY),
    idGenerator,
  });
}
