import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  ActionActualResult,
  DayDate,
  DECISION_KIND,
  JOURNAL_ENTRY_TYPE,
  SESSION_COMPLETION_KIND,
} from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { answerAllReflectionQuestions } from '../../test/helpers/ReflectionTestHelper';
import { createLifeOsApplication } from './createLifeOsApplication';

const TODAY = DayDate.create('2026-08-09');
const TOMORROW = DayDate.create('2026-08-10');

describe('Stage 16.1 journal integration', () => {
  it('records successful canonical transitions once and restores them after F5', async () => {
    const factory = new IDBFactory();
    const clock = new FakeClock(at('08:45'));
    const application = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator('journal-cycle'),
    });
    const sphere = (await application.getSpheres.execute()).active[0]!;

    clock.setTime(at('09:00'));
    const decisionInput = {
      title: 'Подготовить выпуск LifeOS',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Выпуск готов',
      sphereId: sphere.id.toString(),
    } as const;
    const [firstDecisionAttempt, secondDecisionAttempt] = await Promise.all([
      application.createDecisionForDate.execute(decisionInput),
      application.createDecisionForDate.execute(decisionInput),
    ]);
    expect(
      [firstDecisionAttempt, secondDecisionAttempt].filter((result) => result.ok),
    ).toHaveLength(1);
    const decision = firstDecisionAttempt.ok ? firstDecisionAttempt : secondDecisionAttempt;
    if (!decision.ok) return;
    const afterCreate = await timeline(application);
    expect(afterCreate.map((item) => item.entry.type)).toEqual([
      JOURNAL_ENTRY_TYPE.decisionCreated,
    ]);
    expect(afterCreate[0]?.entry.subjectId?.equals(decision.value.id)).toBe(true);
    expect(afterCreate[0]?.entry.sphereId?.equals(sphere.id)).toBe(true);
    expect(afterCreate[0]?.entry.occurredAt).toEqual(at('09:00'));

    const failedDuplicate = await application.createDecisionForDate.execute({
      title: 'Подготовить выпуск LifeOS',
      kind: DECISION_KIND.main,
      plannedDate: TODAY,
      expectedResult: 'Дубликат не должен сохраниться',
    });
    expect(failedDuplicate.ok).toBe(false);
    expect(await timeline(application)).toHaveLength(1);

    clock.setTime(at('09:05'));
    const startAttempts = await Promise.all([
      application.startCurrentDay.execute(),
      application.startCurrentDay.execute(),
    ]);
    expect(startAttempts.some((result) => result.ok)).toBe(true);
    expect(
      (await timeline(application)).filter(
        (item) => item.entry.type === JOURNAL_ENTRY_TYPE.dayStarted,
      ),
    ).toHaveLength(1);

    const action = await application.createLifeActionForDecision.execute({
      decisionId: decision.value.id,
      title: 'Исправить мобильный интерфейс',
      expectedResult: 'Нет горизонтальной прокрутки',
      plannedDate: TODAY,
      sphereId: sphere.id,
    });
    expect(action.ok).toBe(true);
    if (!action.ok) return;

    clock.setTime(at('10:03'));
    const started = await application.startLifeActionSession.execute({
      lifeActionId: action.value.id,
    });
    expect(started.ok).toBe(true);
    if (!started.ok) return;

    clock.setTime(at('10:41'));
    expect(
      (await application.pauseActionSession.execute({ sessionId: started.value.session.id })).ok,
    ).toBe(true);
    clock.setTime(at('11:02'));
    expect(
      (await application.resumeActionSession.execute({ sessionId: started.value.session.id })).ok,
    ).toBe(true);
    clock.setTime(at('12:20'));
    expect(
      (
        await application.completeActionSession.execute({
          sessionId: started.value.session.id,
          completionKind: SESSION_COMPLETION_KIND.completed,
          resultNote: 'Мобильная версия проверена',
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await application.verifyLifeActionResult.execute({
          lifeActionId: action.value.id,
          actualResult: ActionActualResult.create('Интерфейс исправлен'),
        })
      ).ok,
    ).toBe(true);

    clock.setTime(at('17:00'));
    const deferredAction = await application.createLifeActionForDecision.execute({
      decisionId: decision.value.id,
      title: 'Перенести дополнительную проверку',
      expectedResult: 'Проверка запланирована',
      plannedDate: TODAY,
    });
    expect(deferredAction.ok).toBe(true);
    if (!deferredAction.ok) return;
    expect(
      (
        await application.rescheduleLifeActionSafely.execute({
          lifeActionId: deferredAction.value.id,
          newPlannedDate: TOMORROW.toString(),
        })
      ).ok,
    ).toBe(true);
    expect(
      (
        await application.cancelLifeActionSafely.execute({
          lifeActionId: deferredAction.value.id,
          reason: 'Проверка больше не нужна',
        })
      ).ok,
    ).toBe(true);

    clock.setTime(at('18:30'));
    const movedDecision = await application.createDecisionForDate.execute({
      title: 'Второстепенное решение',
      kind: DECISION_KIND.additional,
      plannedDate: TODAY,
      expectedResult: 'Решение перенесено безопасно',
    });
    expect(movedDecision.ok).toBe(true);
    if (!movedDecision.ok) return;
    const storedMovedDecision = await application.decisionRepository.findById(
      movedDecision.value.id,
    );
    expect(storedMovedDecision).toMatchObject({
      status: 'planned',
      version: movedDecision.value.version,
    });
    expect(storedMovedDecision?.plannedDate?.equals(TODAY)).toBe(true);
    expect(storedMovedDecision?.isArchived()).toBe(false);
    expect(storedMovedDecision?.isDeleted()).toBe(false);
    clock.setTime(at('18:40'));
    const rescheduledDecision = await application.rescheduleDecisionSafely.execute({
      decisionId: movedDecision.value.id,
      expectedVersion: movedDecision.value.version,
      newPlannedDate: TOMORROW.toString(),
      reason: 'Продолжить завтра',
    });
    expect(rescheduledDecision.ok).toBe(true);
    clock.setTime(at('18:45'));
    expect(
      (await application.cancelDecisionSafely.execute({ decisionId: movedDecision.value.id })).ok,
    ).toBe(true);

    clock.setTime(at('22:15'));
    const resolvedDecision = await application.resolveOpenLoop.execute({
      dateKey: TODAY,
      entityType: 'DECISION',
      entityId: decision.value.id,
      resolution: 'COMPLETE',
      actualResult: 'Интерфейс исправлен и проверен',
    });
    if (!resolvedDecision.ok) throw resolvedDecision.error;
    await answerAllReflectionQuestions(application, TODAY);
    await application.tomorrowPlan.getOrCreate(TODAY);
    await application.tomorrowPlan.createPrimaryDecision(TODAY, {
      title: 'Продолжить развитие LifeOS',
      expectedResult: 'Определён следующий результат',
    });
    await application.tomorrowPlan.setOutcomes(TODAY, 'Определён следующий результат');
    await application.tomorrowPlan.createFirstAction(TODAY, {
      title: 'Открыть следующий результат',
      expectedResult: 'Следующий результат открыт',
    });
    await application.tomorrowPlan.complete(TODAY);
    const preparation = await application.preparation.getOrGenerate(TODAY);
    for (const item of preparation.plan.activeItems.filter((candidate) => candidate.required)) {
      await application.preparation.skipItem(TODAY, item.id, 'Тестовый осознанный пропуск');
    }
    await application.preparation.continueToShutdown(TODAY);
    const completedDay = await application.completeCurrentDay.execute({
      summary: 'Выпускной цикл завершён',
      actionResolutions: [],
      tomorrowDecisions: [],
    });
    expect(completedDay.ok).toBe(true);

    const beforeReload = await timeline(application);
    expect(beforeReload.map((item) => item.entry.type)).toEqual([
      JOURNAL_ENTRY_TYPE.decisionCreated,
      JOURNAL_ENTRY_TYPE.dayStarted,
      JOURNAL_ENTRY_TYPE.workSessionStarted,
      JOURNAL_ENTRY_TYPE.workSessionPaused,
      JOURNAL_ENTRY_TYPE.workSessionResumed,
      JOURNAL_ENTRY_TYPE.workSessionCompleted,
      JOURNAL_ENTRY_TYPE.actionCompleted,
      JOURNAL_ENTRY_TYPE.actionRescheduled,
      JOURNAL_ENTRY_TYPE.actionCancelled,
      JOURNAL_ENTRY_TYPE.decisionCreated,
      JOURNAL_ENTRY_TYPE.decisionRescheduled,
      JOURNAL_ENTRY_TYPE.decisionCancelled,
      JOURNAL_ENTRY_TYPE.decisionCreated,
      JOURNAL_ENTRY_TYPE.dayCompleted,
    ]);
    expect(new Set(beforeReload.map((item) => item.entry.id.toString())).size).toBe(
      beforeReload.length,
    );
    application.close();

    const reloaded = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator('journal-reload'),
    });
    const afterReload = await timeline(reloaded);
    expect(afterReload.map((item) => item.entry.id.toString())).toEqual(
      beforeReload.map((item) => item.entry.id.toString()),
    );
    expect(
      afterReload
        .find((item) => item.entry.type === JOURNAL_ENTRY_TYPE.actionCompleted)
        ?.lifeAction?.id.equals(action.value.id),
    ).toBe(true);
    reloaded.close();
  });
});

function at(time: string): Date {
  return new Date(`2026-08-09T${time}:00.000+09:00`);
}

async function timeline(application: {
  readonly getJournalTimeline: {
    execute(input: { readonly startDate: DayDate; readonly endDate: DayDate }): Promise<{
      readonly items: readonly import('../../application').JournalTimelineItem[];
    }>;
  };
}): Promise<readonly import('../../application').JournalTimelineItem[]> {
  return (await application.getJournalTimeline.execute({ startDate: TODAY, endDate: TODAY })).items;
}
