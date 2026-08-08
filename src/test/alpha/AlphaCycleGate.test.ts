import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it, vi } from 'vitest';
import { createLifeOsApplication } from '../../app/composition/createLifeOsApplication';
import {
  ACTION_SESSION_STATUS,
  DAY_STATUS,
  DayDate,
  DECISION_KIND,
  LIFE_ACTION_STATUS,
  SESSION_COMPLETION_KIND,
  type EntityId,
} from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { DomainError } from '../../shared/errors/DomainError';
import type { Result } from '../../shared/result/Result';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../helpers/Fakes';

const FIRST_DAY = '2026-08-05';
const CYCLE_COUNT = 20;

describe('Alpha 0.1 — выпускной барьер полного цикла', () => {
  it('проводит 20 последовательных дней через IndexedDB без ручного исправления данных', async () => {
    const indexedDbFactory = new IDBFactory();
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Сеть недоступна'));
    let carriedActionId: EntityId | null = null;

    try {
      for (let cycleIndex = 0; cycleIndex < CYCLE_COUNT; cycleIndex += 1) {
        const currentDate = dayAt(cycleIndex);
        const tomorrowDate = dayAt(cycleIndex + 1);
        const clock = new FakeClock(atLocalTime(currentDate, 8, 0));
        const application = await createApplication(
          indexedDbFactory,
          currentDate,
          clock,
          `alpha-${cycleIndex + 1}`,
        );

        let currentDecisions = await application.getDecisionsForDate.execute(currentDate);
        if (currentDecisions.length === 0) {
          unwrap(
            await application.createDecisionForDate.execute({
              title: `Главное решение дня ${cycleIndex + 1}`,
              kind: DECISION_KIND.main,
              plannedDate: currentDate,
              expectedResult: `Полный цикл ${cycleIndex + 1} завершён`,
            }),
          );
          currentDecisions = await application.getDecisionsForDate.execute(currentDate);
        }

        const mainDecision = currentDecisions.find(
          (decision) => decision.kind === DECISION_KIND.main,
        );
        expect(mainDecision).toBeDefined();
        if (mainDecision === undefined) {
          throw new Error('Главное решение текущего дня не найдено.');
        }

        const started = unwrap(await application.startCurrentDay.execute());
        expect(started.day.status).toBe(DAY_STATUS.open);
        const repeatedStart = unwrap(await application.startCurrentDay.execute());
        expect(repeatedStart.day.id.equals(started.day.id)).toBe(true);

        const completingAction = unwrap(
          await application.createLifeActionForDecision.execute({
            decisionId: mainDecision.id,
            title: `Завершить действие ${cycleIndex + 1}`,
            expectedResult: `Проверяемый результат ${cycleIndex + 1}`,
            plannedDate: currentDate,
          }),
        );
        const cancellingAction = unwrap(
          await application.createLifeActionForDecision.execute({
            decisionId: mainDecision.id,
            title: `Отменить остаток ${cycleIndex + 1}`,
            expectedResult: `Остаток обработан ${cycleIndex + 1}`,
            plannedDate: currentDate,
          }),
        );
        const movingAction = unwrap(
          await application.createLifeActionForDecision.execute({
            decisionId: mainDecision.id,
            title: `Перенести остаток ${cycleIndex + 1}`,
            expectedResult: `Остаток перенесён ${cycleIndex + 1}`,
            plannedDate: currentDate,
          }),
        );

        clock.setTime(atLocalTime(currentDate, 9, 0));
        const sessionStart = unwrap(
          await application.startLifeActionSession.execute({
            lifeActionId: completingAction.id,
          }),
        );
        clock.setTime(atLocalTime(currentDate, 9, 30));
        const paused = unwrap(
          await application.pauseActionSession.execute({ sessionId: sessionStart.session.id }),
        );
        expect(paused.status).toBe(ACTION_SESSION_STATUS.paused);

        clock.setTime(atLocalTime(currentDate, 9, 35));
        const blockedCompletion = await application.completeCurrentDay.execute({
          summary: `Заблокированный итог ${cycleIndex + 1}`,
          actionResolutions: [],
          tomorrowDecisions: [],
        });
        expect(errorCode(blockedCompletion)).toBe('day.unfinished_session');
        application.close();

        const restoredClock = new FakeClock(atLocalTime(currentDate, 9, 40));
        const restoredApplication = await createApplication(
          indexedDbFactory,
          currentDate,
          restoredClock,
          `alpha-${cycleIndex + 1}-reload`,
        );
        const restoredDay = await restoredApplication.dayRepository.findByDate(currentDate);
        const restoredSession = await restoredApplication.getUnfinishedActionSession.execute();

        expect(restoredDay?.status).toBe(DAY_STATUS.open);
        expect(restoredSession?.id.equals(sessionStart.session.id)).toBe(true);
        expect(restoredSession?.status).toBe(ACTION_SESSION_STATUS.paused);

        unwrap(
          await restoredApplication.resumeActionSession.execute({
            sessionId: sessionStart.session.id,
          }),
        );
        restoredClock.setTime(atLocalTime(currentDate, 10, 20));
        const completedSession = unwrap(
          await restoredApplication.completeActionSession.execute({
            sessionId: sessionStart.session.id,
            completionKind: SESSION_COMPLETION_KIND.completed,
            resultNote: `Сессия цикла ${cycleIndex + 1} завершена`,
          }),
        );
        expect(completedSession.workedDurationAt(atLocalTime(currentDate, 10, 20))).toBe(
          70 * 60 * 1000,
        );

        const actionResolutions = [
          ...(carriedActionId === null
            ? []
            : [
                {
                  kind: 'cancel' as const,
                  lifeActionId: carriedActionId,
                  reason: `Перенос прошлого дня обработан в цикле ${cycleIndex + 1}`,
                },
              ]),
          {
            kind: 'complete' as const,
            lifeActionId: completingAction.id,
            actualResult: `Фактический результат цикла ${cycleIndex + 1}`,
          },
          {
            kind: 'cancel' as const,
            lifeActionId: cancellingAction.id,
            reason: `Осознанная отмена цикла ${cycleIndex + 1}`,
          },
          cycleIndex === CYCLE_COUNT - 1
            ? {
                kind: 'cancel' as const,
                lifeActionId: movingAction.id,
                reason: 'Последний цикл не оставляет необработанных остатков',
              }
            : {
                kind: 'reschedule' as const,
                lifeActionId: movingAction.id,
                newPlannedDate: tomorrowDate.toString(),
              },
        ];

        restoredClock.setTime(atLocalTime(currentDate, 20, 30));
        const completion = unwrap(
          await restoredApplication.completeCurrentDay.execute({
            summary: `Итог полного цикла ${cycleIndex + 1}`,
            actionResolutions,
            tomorrowDecisions: [
              {
                kind: DECISION_KIND.main,
                title: `Главное решение дня ${cycleIndex + 2}`,
                expectedResult: `Полный цикл ${cycleIndex + 2} завершён`,
              },
            ],
          }),
        );
        expect(completion.day.status).toBe(DAY_STATUS.completed);

        const repeatedCompletion = await restoredApplication.completeCurrentDay.execute({
          summary: `Повторный итог ${cycleIndex + 1}`,
          actionResolutions: [],
          tomorrowDecisions: [],
        });
        expect(errorCode(repeatedCompletion)).toBe('day.already_completed');
        restoredApplication.close();

        const verificationApplication = await createApplication(
          indexedDbFactory,
          currentDate,
          new FakeClock(atLocalTime(currentDate, 21, 0)),
          `alpha-${cycleIndex + 1}-verify`,
        );
        const [verifiedDay, verifiedSession, verifiedCurrentActions, verifiedTomorrowDecisions] =
          await Promise.all([
            verificationApplication.dayRepository.findByDate(currentDate),
            verificationApplication.actionSessionRepository.findById(sessionStart.session.id),
            verificationApplication.getLifeActionsForDate.execute(currentDate),
            verificationApplication.getDecisionsForDate.execute(tomorrowDate),
          ]);

        expect(verifiedDay?.status).toBe(DAY_STATUS.completed);
        expect(verifiedDay?.summary).toBe(`Итог полного цикла ${cycleIndex + 1}`);
        expect(verifiedSession?.status).toBe(ACTION_SESSION_STATUS.completed);
        expect(verifiedSession?.workedDurationAt(atLocalTime(currentDate, 21, 0))).toBe(
          70 * 60 * 1000,
        );
        expect(
          verifiedCurrentActions.find((action) => action.id.equals(completingAction.id))?.status,
        ).toBe(LIFE_ACTION_STATUS.completed);
        expect(
          verifiedCurrentActions.find((action) => action.id.equals(cancellingAction.id))?.status,
        ).toBe(LIFE_ACTION_STATUS.cancelled);
        expect(
          verifiedTomorrowDecisions.some((decision) => decision.kind === DECISION_KIND.main),
        ).toBe(true);
        expect(await verificationApplication.getUnfinishedActionSession.execute()).toBeNull();
        verificationApplication.close();

        carriedActionId = cycleIndex === CYCLE_COUNT - 1 ? null : movingAction.id;
      }

      const finalDate = dayAt(CYCLE_COUNT - 1);
      const finalApplication = await createApplication(
        indexedDbFactory,
        finalDate,
        new FakeClock(atLocalTime(finalDate, 22, 0)),
        'alpha-final-audit',
      );
      const completedDays = await Promise.all(
        Array.from({ length: CYCLE_COUNT }, (_, index) =>
          finalApplication.dayRepository.findByDate(dayAt(index)),
        ),
      );

      expect(completedDays).toHaveLength(CYCLE_COUNT);
      expect(completedDays.every((day) => day?.status === DAY_STATUS.completed)).toBe(true);
      expect(new Set(completedDays.map((day) => day?.id.toString())).size).toBe(CYCLE_COUNT);
      expect(carriedActionId).toBeNull();
      expect(fetchSpy).not.toHaveBeenCalled();
      finalApplication.close();
    } finally {
      fetchSpy.mockRestore();
    }
  });
});

async function createApplication(
  indexedDbFactory: IDBFactory,
  currentDate: DayDate,
  clock: FakeClock,
  idPrefix: string,
) {
  return createLifeOsApplication({
    database: new LifeOsIndexedDb(indexedDbFactory),
    clock,
    currentDateProvider: new FakeCurrentDateProvider(currentDate),
    idGenerator: new FakeIdGenerator(idPrefix),
  });
}

function dayAt(offset: number): DayDate {
  const [year, month, day] = FIRST_DAY.split('-').map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day! + offset));
  return DayDate.create(date.toISOString().slice(0, 10));
}

function atLocalTime(date: DayDate, hour: number, minute: number): Date {
  return new Date(`${date.toString()}T${pad(hour)}:${pad(minute)}:00.000+09:00`);
}

function pad(value: number): string {
  return value.toString().padStart(2, '0');
}

function unwrap<T>(result: Result<T, DomainError>): T {
  if (!result.ok) {
    throw result.error;
  }

  return result.value;
}

function errorCode<T>(result: Result<T, DomainError>): string | null {
  return result.ok ? null : result.error.code;
}
