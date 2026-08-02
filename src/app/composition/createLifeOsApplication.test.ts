import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import {
  ACTION_SESSION_STATUS,
  ActionActualResult,
  DAY_STATUS,
  DayDate,
  DECISION_KIND,
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
    expect(application.getLifeActionsForDecision).toBeDefined();
    expect(application.createLifeActionForDecision).toBeDefined();
    expect(application.startLifeActionSession).toBeDefined();
    expect(application.pauseActionSession).toBeDefined();
    expect(application.resumeActionSession).toBeDefined();
    expect(application.completeActionSession).toBeDefined();
    expect(application.completeLifeAction).toBeDefined();
    expect(application.confirmDecisionFromActions).toBeDefined();
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

    expect(firstDay?.status).toBe(DAY_STATUS.open);
    expect(firstIds.generatedCount).toBe(3);
    firstApplication.close();

    const secondIds = new FakeIdGenerator('second-start');
    const secondApplication = await createTestApplication(indexedDbFactory, secondIds);
    const restoredDay = await secondApplication.dayRepository.findByDate(TODAY);

    expect(restoredDay?.id.equals(firstDay!.id)).toBe(true);
    expect(restoredDay?.getUncommittedEvents()).toHaveLength(0);
    expect(secondIds.generatedCount).toBe(0);
    secondApplication.close();
  });

  it('не открывает повторно завершённый сегодняшний день', async () => {
    const indexedDbFactory = new IDBFactory();
    const firstApplication = await createTestApplication(
      indexedDbFactory,
      new FakeIdGenerator('first-start'),
    );
    const completedDay = await firstApplication.dayRepository.findByDate(TODAY);
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
