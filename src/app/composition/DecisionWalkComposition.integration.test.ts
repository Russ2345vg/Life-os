import { IDBFactory } from 'fake-indexeddb';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ActualResultSummary,
  DECISION_KIND,
  DayDate,
  DecisionTitle,
  EntityId,
  WALK_IMPACT,
  WALK_INTENT,
  WALK_MODE,
  WALK_REFLECTION_TEMPLATE,
  WALK_REENTRY_STATUS,
} from '../../domain';
import { LifeOsIndexedDb } from '../../infrastructure';
import { CreateDecisionDraft, StartDecisionWalk } from '../../application';
import { DecisionRecordMapper } from '../../infrastructure/persistence/mappers/DecisionRecordMapper';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import type { LifeOsApplication } from './LifeOsApplication';
import { createLifeOsApplication } from './createLifeOsApplication';

const DATE = DayDate.create('2026-08-26');
const opened: LifeOsApplication[] = [];
afterEach(() => {
  for (const app of opened.splice(0)) app.close();
});

async function setup(
  factory = new IDBFactory(),
  clock = new FakeClock(new Date('2026-08-26T08:00:00Z')),
) {
  const app = await createLifeOsApplication({
    database: new LifeOsIndexedDb(factory),
    clock,
    currentDateProvider: new FakeCurrentDateProvider(DATE),
    idGenerator: new FakeIdGenerator('walk09'),
  });
  opened.push(app);
  return { app, factory, clock };
}

async function createSource(app: LifeOsApplication) {
  const result = await app.createDecisionForDate.execute({
    title: 'Какой следующий шаг?',
    kind: DECISION_KIND.additional,
    plannedDate: DayDate.create('2026-08-27'),
    expectedResult: 'Прояснить направление',
    reason: 'Проверить предположение',
    price: 'Один час',
    sacrifices: 'Отложить необязательное',
  });
  if (!result.ok) throw result.error;
  return result.value;
}

describe('WALK-09 Decision integration', () => {
  it('restores active and pending links without changing any Decision data or creating Actions', async () => {
    const fixture = await setup();
    let app = fixture.app;
    const source = await createSource(app);
    const before = DecisionRecordMapper.toRecord(source);
    expect(app.startDecisionWalk).toBeDefined();
    const started = await app.startDecisionWalk.execute({
      decisionId: source.id,
      timerTargetMinutes: 30,
    });
    if (!started.ok) throw started.error;
    expect(started.value).toMatchObject({
      intent: WALK_INTENT.reflection,
      mode: WALK_MODE.timer,
      reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
      linkedEntity: { type: 'decision', id: source.id },
      returnContext: { origin: 'decision', entity: { type: 'decision', id: source.id } },
      result: null,
      afterState: null,
      impact: null,
      reflectionQuestion: 'Что мне нужно понять, чтобы принять это решение?',
    });
    expect(started.value.date.toString()).toBe('2026-08-26');
    const assertUntouched = async () => {
      const stored = await app.decisionRepository.findById(source.id);
      expect(stored).not.toBeNull();
      expect(DecisionRecordMapper.toRecord(stored!)).toEqual(before);
      expect(await app.lifeActionRepository.findByDecisionId(source.id)).toEqual([]);
      expect(await app.actionSessionRepository.findUnfinished()).toBeNull();
      expect(await app.routineOccurrenceExecutionRepository.findAll()).toEqual([]);
    };
    await assertUntouched();
    app.close();
    app = (await setup(fixture.factory, fixture.clock)).app;
    expect(await app.getActiveWalk.execute()).toMatchObject({
      linkedEntity: started.value.linkedEntity,
      returnContext: started.value.returnContext,
      reflectionQuestion: started.value.reflectionQuestion,
    });
    fixture.clock.setTime(new Date('2026-08-26T08:20:00Z'));
    expect(await app.completeWalk.execute({ walkId: started.value.id })).toMatchObject({
      ok: true,
    });
    await assertUntouched();
    expect(
      await app.recordWalkOutcome.execute({
        walkId: started.value.id,
        afterState: { energy: 6, tension: 3, clarity: 8 },
        impact: WALK_IMPACT.better,
        reflection: 'Сначала проверить допущение.',
      }),
    ).toMatchObject({ ok: true });
    await assertUntouched();
    app.close();
    app = (await setup(fixture.factory, fixture.clock)).app;
    const pending = await app.getPendingWalkReentry.execute();
    expect(pending).toMatchObject({
      returnContext: started.value.returnContext,
      result: 'Сначала проверить допущение.',
      reentry: {
        status: WALK_REENTRY_STATUS.pending,
        action: { destination: 'decision', entity: { type: 'decision', id: source.id } },
      },
    });
    expect(await app.completeWalkReentry.execute({ walkId: started.value.id })).toMatchObject({
      ok: true,
    });
    expect(app.getLatestWalkOutcomeForDecision).toBeDefined();
    expect(await app.getLatestWalkOutcomeForDecision.execute(source.id)).toMatchObject({
      id: started.value.id,
      result: 'Сначала проверить допущение.',
      impact: WALK_IMPACT.better,
    });
    await assertUntouched();
  });

  it('preserves a custom question and lets an unplanned Decision use today without editing it', async () => {
    const { app } = await setup();
    const source = await new CreateDecisionDraft(
      app.decisionRepository,
      app.clock,
      new FakeIdGenerator('draft'),
    ).execute({ title: DecisionTitle.create('Черновик'), kind: DECISION_KIND.additional });
    if (!source.ok) throw source.error;
    expect(app.startDecisionWalk).toBeDefined();
    const result = await app.startDecisionWalk.execute({
      decisionId: source.value.id,
      timerTargetMinutes: 20,
      reflectionQuestion: '  Как проверить риск?  ',
      reflectionTemplate: WALK_REFLECTION_TEMPLATE.freeThought,
    });
    expect(result).toMatchObject({
      ok: true,
      value: {
        reflectionQuestion: 'Как проверить риск?',
        reflectionTemplate: WALK_REFLECTION_TEMPLATE.freeThought,
        result: null,
      },
    });
    expect(await app.decisionRepository.findById(source.value.id)).toMatchObject({
      status: 'draft',
      plannedDate: null,
    });
  });

  it.each(['missing', 'deleted'] as const)(
    'rejects a %s source without creating a Walk',
    async (kind) => {
      const { app } = await setup();
      const source = await createSource(app);
      if (kind === 'deleted')
        expect(await app.deleteDecisionSafely.execute({ decisionId: source.id })).toMatchObject({
          ok: true,
        });
      expect(app.startDecisionWalk).toBeDefined();
      expect(
        await app.startDecisionWalk.execute({
          decisionId: kind === 'missing' ? EntityId.create('missing') : source.id,
          timerTargetMinutes: 30,
        }),
      ).toMatchObject({ ok: false, error: { code: 'decision.not_found' } });
      expect(await app.walkRepository.findAll()).toEqual([]);
    },
  );

  it.each([false, true])('reuses the global active guard, including paused=%s', async (paused) => {
    const { app } = await setup();
    const source = await createSource(app);
    const existing = await app.createWalk.execute({ date: DATE, intent: WALK_INTENT.free });
    if (!existing.ok) throw existing.error;
    expect(
      await app.startWalk.execute({ walkId: existing.value.id, mode: WALK_MODE.stopwatch }),
    ).toMatchObject({ ok: true });
    if (paused)
      expect(await app.pauseWalk.execute({ walkId: existing.value.id })).toMatchObject({
        ok: true,
      });
    expect(app.startDecisionWalk).toBeDefined();
    expect(
      await app.startDecisionWalk.execute({ decisionId: source.id, timerTargetMinutes: 30 }),
    ).toMatchObject({ ok: false, error: { code: 'walk.another_running' } });
    expect(await app.walkRepository.findAll()).toHaveLength(1);
    expect((await app.getActiveWalk.execute())?.id).toEqual(existing.value.id);
  });

  it('reads the latest saved outcome, not the last edited or unrelated Walk', async () => {
    const { app, clock } = await setup();
    const source = await createSource(app);
    expect(app.getLatestWalkOutcomeForDecision).toBeDefined();
    expect(await app.getLatestWalkOutcomeForDecision.execute(source.id)).toBeNull();
    const outcomes = [];
    for (const [hour, reflection] of [
      [9, 'Первый вывод'],
      [10, 'Новый вывод'],
    ] as const) {
      clock.setTime(new Date(`2026-08-26T${String(hour).padStart(2, '0')}:00:00Z`));
      const started = await app.startDecisionWalk.execute({
        decisionId: source.id,
        timerTargetMinutes: 30,
      });
      if (!started.ok) throw started.error;
      await app.completeWalk.execute({ walkId: started.value.id });
      const outcome = await app.recordWalkOutcome.execute({
        walkId: started.value.id,
        afterState: { energy: 5, tension: 5, clarity: 5 },
        impact: WALK_IMPACT.same,
        reflection,
      });
      if (!outcome.ok) throw outcome.error;
      outcomes.push(outcome.value);
    }
    clock.setTime(new Date('2026-08-26T11:00:00Z'));
    await app.completeWalkReentry.execute({ walkId: outcomes[0]!.id });
    const unlinked = await app.createWalk.execute({ date: DATE, intent: WALK_INTENT.reflection });
    if (!unlinked.ok) throw unlinked.error;
    await app.startWalk.execute({ walkId: unlinked.value.id, mode: WALK_MODE.stopwatch });
    await app.completeWalk.execute({ walkId: unlinked.value.id });
    await app.recordWalkOutcome.execute({
      walkId: unlinked.value.id,
      afterState: { energy: 5, tension: 5, clarity: 5 },
      impact: WALK_IMPACT.better,
      reflection: 'Не о решении',
    });
    expect(await app.getLatestWalkOutcomeForDecision.execute(source.id)).toMatchObject({
      id: outcomes[1]!.id,
      result: 'Новый вывод',
    });
  });

  it('delegates concurrent starts to the existing persisted active guard', async () => {
    const { app } = await setup();
    const source = await createSource(app);
    let checks = 0;
    let release: () => void = () => undefined;
    const bothChecked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const command = new StartDecisionWalk({
      getDecisionById: app.getDecisionById,
      createWalk: app.createWalk,
      startWalk: app.startWalk,
      currentDateProvider: app.currentDateProvider,
      getActiveWalk: {
        execute: async () => {
          const active = await app.getActiveWalk.execute();
          if (++checks === 2) release();
          await bothChecked;
          return active;
        },
      },
    });
    const results = await Promise.all(
      [1, 2].map(() => command.execute({ decisionId: source.id, timerTargetMinutes: 30 })),
    );
    expect(results.filter((result) => result.ok)).toHaveLength(1);
    expect(results.filter((result) => !result.ok)).toMatchObject([
      { ok: false, error: { code: 'walk.another_running' } },
    ]);
    const walks = await app.walkRepository.findAll();
    expect(
      walks.filter((item) => item.status === 'running' || item.status === 'paused'),
    ).toHaveLength(1);
    // Create -> Start follows the existing engine: a losing concurrent create remains planned.
    expect(walks.filter((item) => item.status === 'planned')).toHaveLength(1);
  });

  it('does not overwrite an explicit Decision cancellation during the Walk', async () => {
    const { app } = await setup();
    const source = await createSource(app);
    const started = await app.startDecisionWalk.execute({
      decisionId: source.id,
      timerTargetMinutes: 30,
    });
    if (!started.ok) throw started.error;
    const cancelled = await app.cancelDecisionSafely.execute({ decisionId: source.id });
    if (!cancelled.ok) throw cancelled.error;
    const afterUserAction = DecisionRecordMapper.toRecord(cancelled.value);
    expect(afterUserAction.status).toBe('cancelled');
    expect(await app.completeWalk.execute({ walkId: started.value.id })).toMatchObject({
      ok: true,
    });
    expect(
      await app.recordWalkOutcome.execute({
        walkId: started.value.id,
        afterState: { energy: 5, tension: 5, clarity: 5 },
        impact: WALK_IMPACT.same,
        reflection: 'Контекст остаётся полезным',
      }),
    ).toMatchObject({ ok: true });
    expect(await app.completeWalkReentry.execute({ walkId: started.value.id })).toMatchObject({
      ok: true,
    });
    expect(
      DecisionRecordMapper.toRecord((await app.decisionRepository.findById(source.id))!),
    ).toEqual(afterUserAction);
    expect((await app.getLatestWalkOutcomeForDecision.execute(source.id))?.result).toBe(
      'Контекст остаётся полезным',
    );
  });

  it('preserves an already confirmed Decision including actual result and evidence', async () => {
    const { app, clock } = await setup();
    const source = await createSource(app);
    source.confirm(
      ActualResultSummary.create('Ранее подтверждённый итог'),
      [EntityId.create('existing-evidence')],
      clock.now(),
      EntityId.create('explicit-confirmation'),
    );
    await app.decisionRepository.save(source);
    const before = DecisionRecordMapper.toRecord(source);
    const started = await app.startDecisionWalk.execute({
      decisionId: source.id,
      timerTargetMinutes: 30,
    });
    if (!started.ok) throw started.error;
    expect(await app.completeWalk.execute({ walkId: started.value.id })).toMatchObject({
      ok: true,
    });
    expect(
      await app.recordWalkOutcome.execute({
        walkId: started.value.id,
        afterState: { energy: 5, tension: 5, clarity: 5 },
        impact: WALK_IMPACT.worse,
        reflection: '',
      }),
    ).toMatchObject({ ok: true });
    expect(await app.completeWalkReentry.execute({ walkId: started.value.id })).toMatchObject({
      ok: true,
    });
    expect(
      DecisionRecordMapper.toRecord((await app.decisionRepository.findById(source.id))!),
    ).toEqual(before);
    expect((await app.getLatestWalkOutcomeForDecision.execute(source.id))?.result).toBeNull();
  });
});
