import { describe, expect, it } from 'vitest';
import { PauseInterval } from '../action-session/PauseInterval';
import { DayDate } from '../day/DayDate';
import { EntityId } from '../shared/EntityId';
import { Walk, type WalkRehydrationData } from './Walk';
import {
  WALK_LINKED_ENTITY_TYPE,
  WALK_RETURN_ORIGIN,
  type WalkRoutineContext,
} from './WalkContext';
import { WALK_INTENT } from './WalkIntent';
import { WALK_IMPACT } from './WalkImpact';
import { WALK_MODE } from './WalkMode';
import {
  WALK_REENTRY_ACTION_KIND,
  WALK_REENTRY_STATUS,
  type WalkReentryAction,
} from './WalkReentry';
import {
  WALK_REFLECTION_STAGE,
  WALK_REFLECTION_TEMPLATE,
  getWalkReflectionStages,
  isWalkReflectionStage,
  isWalkReflectionTemplate,
  type WalkReflectionTemplate,
} from './WalkReflectionTemplate';
import { WALK_STATUS } from './WalkStatus';
import { WALK_TYPE, isWalkType } from './WalkType';

const DATE = DayDate.create('2026-08-08');
const NOW = new Date('2026-08-08T08:00:00.000Z');
const ENDED_AT = new Date('2026-08-08T08:30:00.000Z');
const OUTCOME_AT = new Date('2026-08-08T08:32:00.000Z');
const TODAY_REENTRY_ACTION = {
  kind: WALK_REENTRY_ACTION_KIND.today,
  destination: WALK_RETURN_ORIGIN.today,
  entity: null,
  nextStep: null,
  routineContext: null,
} satisfies WalkReentryAction;

describe('Walk', () => {
  it.each(Object.values(WALK_TYPE))('creates the %s walk type', (type) => {
    const walk = Walk.create({ id: EntityId.create(`walk-${type}`), date: DATE, type, now: NOW });

    expect(walk.type).toBe(type);
    expect(walk.date.equals(DATE)).toBe(true);
    expect(walk.createdAt).toEqual(NOW);
    expect(walk.updatedAt).toEqual(NOW);
    expect(walk.version).toBe(1);
    expect(walk.status).toBe(WALK_STATUS.planned);
  });

  it.each(Object.values(WALK_INTENT))(
    'stores the %s walk intent separately from the timer mode',
    (intent) => {
      const walk = Walk.create({
        id: EntityId.create(`walk-${intent}`),
        date: DATE,
        type: WALK_TYPE.mindful,
        intent,
        now: NOW,
      });

      expect(walk.intent).toBe(intent);
      expect(walk.mode).toBeNull();
    },
  );

  it('stores the pre-walk state and optional session context', () => {
    const linkedEntity = {
      type: WALK_LINKED_ENTITY_TYPE.decision,
      id: EntityId.create('decision-1'),
    };
    const walk = Walk.create({
      id: EntityId.create('walk-context'),
      date: DATE,
      type: WALK_TYPE.reflection,
      beforeState: { energy: 3, tension: 8, clarity: 4 },
      linkedEntity,
      returnContext: {
        origin: WALK_RETURN_ORIGIN.decision,
        entity: linkedEntity,
        nextStep: 'Вернуться к выбору варианта',
      },
      now: NOW,
    });

    expect(walk.beforeState).toEqual({ energy: 3, tension: 8, clarity: 4 });
    expect(walk.afterState).toBeNull();
    expect(walk.linkedEntity).toEqual(linkedEntity);
    expect(walk.returnContext).toEqual({
      origin: WALK_RETURN_ORIGIN.decision,
      entity: linkedEntity,
      nextStep: 'Вернуться к выбору варианта',
      routineContext: null,
    });
  });

  it('normalizes and defensively copies an exact Routine occurrence context', () => {
    const sourceId = EntityId.create('routine-walk-source');
    const nextId = EntityId.create('routine-walk-next');
    const routineContext = {
      source: {
        routineBlockId: sourceId,
        occurrenceDate: DayDate.create('2026-08-07'),
        effectiveDate: DATE,
      },
      sourceTitle: '  Прогулка после обеда  ',
      next: {
        routineBlockId: nextId,
        occurrenceDate: DATE,
        effectiveDate: DATE,
      },
    } satisfies WalkRoutineContext;
    const linkedEntity = { type: WALK_LINKED_ENTITY_TYPE.routine, id: sourceId } as const;

    const walk = Walk.create({
      id: EntityId.create('walk-routine-context-copy'),
      date: DATE,
      type: WALK_TYPE.mindful,
      linkedEntity,
      returnContext: {
        origin: WALK_RETURN_ORIGIN.routine,
        entity: linkedEntity,
        nextStep: 'Вечерний обзор',
        routineContext,
      },
      now: NOW,
    });

    expect(walk.returnContext?.routineContext).toEqual({
      source: {
        routineBlockId: sourceId,
        occurrenceDate: DayDate.create('2026-08-07'),
        effectiveDate: DATE,
      },
      sourceTitle: 'Прогулка после обеда',
      next: {
        routineBlockId: nextId,
        occurrenceDate: DATE,
        effectiveDate: DATE,
      },
    });
    expect(walk.returnContext?.routineContext).not.toBe(routineContext);
    expect(walk.returnContext?.routineContext?.source).not.toBe(routineContext.source);
    expect(walk.returnContext?.routineContext?.source.routineBlockId).not.toBe(sourceId);
    expect(walk.returnContext?.routineContext?.source.occurrenceDate).not.toBe(
      routineContext.source.occurrenceDate,
    );
    expect(walk.returnContext?.routineContext?.next).not.toBe(routineContext.next);
  });

  it('preserves the exact Routine context through active, terminal and Reentry transitions', () => {
    const sourceId = EntityId.create('routine-walk-lifecycle-source');
    const linkedEntity = { type: WALK_LINKED_ENTITY_TYPE.routine, id: sourceId } as const;
    const routineContext = {
      source: {
        routineBlockId: sourceId,
        occurrenceDate: DATE,
        effectiveDate: DATE,
      },
      sourceTitle: 'Дневная прогулка',
      next: null,
    } satisfies WalkRoutineContext;
    const started = Walk.create({
      id: EntityId.create('walk-routine-lifecycle'),
      date: DATE,
      type: WALK_TYPE.mindful,
      linkedEntity,
      returnContext: {
        origin: WALK_RETURN_ORIGIN.routine,
        entity: linkedEntity,
        nextStep: null,
        routineContext,
      },
      now: NOW,
    }).start({
      mode: WALK_MODE.timer,
      timerTargetMinutes: 30,
      reflectionQuestion: 'Что сейчас важно заметить?',
      startedAt: NOW,
    });
    const completed = started
      .pause(new Date('2026-08-08T08:05:00.000Z'))
      .resume(new Date('2026-08-08T08:10:00.000Z'))
      .complete({ endedAt: ENDED_AT });
    const recorded = completed.recordOutcome({
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: WALK_IMPACT.better,
      reentryAction: {
        kind: WALK_REENTRY_ACTION_KIND.resumeContext,
        destination: WALK_RETURN_ORIGIN.routine,
        entity: linkedEntity,
        nextStep: null,
        routineContext,
      },
      updatedAt: OUTCOME_AT,
    });

    expect(completed.returnContext?.routineContext).toEqual({
      ...routineContext,
      source: {
        routineBlockId: sourceId,
        occurrenceDate: DATE,
        effectiveDate: DATE,
      },
    });
    expect(recorded.reentry?.action.routineContext).toEqual({
      ...routineContext,
      source: {
        routineBlockId: sourceId,
        occurrenceDate: DATE,
        effectiveDate: DATE,
      },
    });
    expect(
      recorded.completeReentry(new Date('2026-08-08T08:35:00.000Z')).reentry?.action.routineContext,
    ).toEqual(recorded.reentry?.action.routineContext);
  });

  it.each([
    ['non-Routine origin', { origin: WALK_RETURN_ORIGIN.today }, 'walk.invalid_return_context'],
    [
      'different linked entity',
      {
        entity: {
          type: WALK_LINKED_ENTITY_TYPE.routine,
          id: EntityId.create('routine-walk-other'),
        },
      },
      'walk.invalid_return_context',
    ],
    [
      'different effective date',
      {
        routineContext: {
          source: {
            routineBlockId: EntityId.create('routine-walk-invalid'),
            occurrenceDate: DATE,
            effectiveDate: DayDate.create('2026-08-09'),
          },
          sourceTitle: 'Прогулка',
          next: null,
        },
      },
      'walk.invalid_return_context',
    ],
  ])('rejects Routine context with %s', (_caseName, override, code) => {
    const sourceId = EntityId.create('routine-walk-invalid');
    const linkedEntity = { type: WALK_LINKED_ENTITY_TYPE.routine, id: sourceId } as const;
    const routineContext = {
      source: { routineBlockId: sourceId, occurrenceDate: DATE, effectiveDate: DATE },
      sourceTitle: 'Прогулка',
      next: null,
    } satisfies WalkRoutineContext;

    expect(() =>
      Walk.create({
        id: EntityId.create(`walk-routine-invalid-${_caseName}`),
        date: DATE,
        type: WALK_TYPE.mindful,
        linkedEntity,
        returnContext: {
          origin: WALK_RETURN_ORIGIN.routine,
          entity: linkedEntity,
          nextStep: null,
          routineContext,
          ...override,
        } as never,
        now: NOW,
      }),
    ).toThrowError(expect.objectContaining({ code }));
  });

  it('requires the Walk linked entity and next occurrence to match its Routine source date', () => {
    const sourceId = EntityId.create('routine-walk-cross-invariant');
    const routineEntity = { type: WALK_LINKED_ENTITY_TYPE.routine, id: sourceId } as const;
    const returnContext = {
      origin: WALK_RETURN_ORIGIN.routine,
      entity: routineEntity,
      nextStep: 'Следующий блок',
      routineContext: {
        source: { routineBlockId: sourceId, occurrenceDate: DATE, effectiveDate: DATE },
        sourceTitle: 'Прогулка',
        next: {
          routineBlockId: EntityId.create('routine-next-other-date'),
          occurrenceDate: DayDate.create('2026-08-09'),
          effectiveDate: DayDate.create('2026-08-09'),
        },
      },
    } satisfies import('./WalkContext').WalkReturnContext;

    expect(() =>
      Walk.create({
        id: EntityId.create('walk-routine-linked-entity-mismatch'),
        date: DATE,
        type: WALK_TYPE.mindful,
        linkedEntity: {
          type: WALK_LINKED_ENTITY_TYPE.decision,
          id: EntityId.create('decision-not-routine'),
        },
        returnContext: {
          ...returnContext,
          routineContext: { ...returnContext.routineContext!, next: null },
        },
        now: NOW,
      }),
    ).toThrowError(expect.objectContaining({ code: 'walk.invalid_return_context' }));
    expect(() =>
      Walk.create({
        id: EntityId.create('walk-routine-next-date-mismatch'),
        date: DATE,
        type: WALK_TYPE.mindful,
        linkedEntity: routineEntity,
        returnContext,
        now: NOW,
      }),
    ).toThrowError(expect.objectContaining({ code: 'walk.invalid_return_context' }));
  });

  it('normalizes missing routine fields on legacy contexts and actions to null', () => {
    const linkedEntity = {
      type: WALK_LINKED_ENTITY_TYPE.decision,
      id: EntityId.create('legacy-context-decision'),
    } as const;
    const legacy = Walk.create({
      id: EntityId.create('walk-legacy-routine-context'),
      date: DATE,
      type: WALK_TYPE.reflection,
      linkedEntity,
      returnContext: {
        origin: WALK_RETURN_ORIGIN.decision,
        entity: linkedEntity,
        nextStep: 'Вернуться к решению',
      },
      now: NOW,
    });
    const recorded = runningWalk('legacy-routine-action', NOW)
      .complete({ endedAt: ENDED_AT })
      .recordOutcome({
        afterState: { energy: 7, tension: 2, clarity: 8 },
        impact: WALK_IMPACT.better,
        reentryAction: {
          kind: WALK_REENTRY_ACTION_KIND.today,
          destination: WALK_RETURN_ORIGIN.today,
          entity: null,
          nextStep: null,
        },
        updatedAt: OUTCOME_AT,
      });

    expect(legacy.returnContext?.routineContext).toBeNull();
    expect(recorded.reentry?.action.routineContext).toBeNull();
  });

  it('keeps after-state, linked entity and return context optional', () => {
    const walk = Walk.create({
      id: EntityId.create('walk-without-context'),
      date: DATE,
      type: WALK_TYPE.restorative,
      now: NOW,
    });

    expect(walk.beforeState).toBeNull();
    expect(walk.afterState).toBeNull();
    expect(walk.linkedEntity).toBeNull();
    expect(walk.returnContext).toBeNull();
  });

  it('accepts state scores from 0 to 10 and rejects values outside the range', () => {
    const createWithEnergy = (energy: number) =>
      Walk.create({
        id: EntityId.create(`walk-energy-${energy}`),
        date: DATE,
        type: WALK_TYPE.restorative,
        beforeState: { energy, tension: 0, clarity: 10 },
        now: NOW,
      });

    expect(createWithEnergy(0).beforeState).toEqual({ energy: 0, tension: 0, clarity: 10 });
    expect(createWithEnergy(10).beforeState).toEqual({ energy: 10, tension: 0, clarity: 10 });
    expect(() => createWithEnergy(-1)).toThrowError(
      expect.objectContaining({ code: 'walk.invalid_before_state' }),
    );
    expect(() => createWithEnergy(11)).toThrowError(
      expect.objectContaining({ code: 'walk.invalid_before_state' }),
    );
  });

  it('rehydrates the paused lifecycle state from timestamps and completed pause intervals', () => {
    const firstPause = PauseInterval.create(
      new Date('2026-08-08T08:20:00.000Z'),
      new Date('2026-08-08T08:25:00.000Z'),
    );
    const pausedAt = new Date('2026-08-08T08:40:00.000Z');
    const walk = Walk.rehydrate({
      id: EntityId.create('walk-paused'),
      date: DATE,
      type: WALK_TYPE.mindful,
      status: WALK_STATUS.paused,
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-08T08:10:00.000Z'),
      pausedAt,
      pauseIntervals: [firstPause],
      endedAt: null,
      timerTargetMinutes: null,
      reflectionQuestion: 'Что изменилось?',
      result: null,
      photo: null,
      createdAt: NOW,
      updatedAt: pausedAt,
      version: 3,
    });

    expect(walk.status).toBe(WALK_STATUS.paused);
    expect(walk.startedAt).toEqual(new Date('2026-08-08T08:10:00.000Z'));
    expect(walk.pausedAt).toEqual(pausedAt);
    expect(walk.pauseIntervals).toEqual([firstPause]);
    expect(walk.endedAt).toBeNull();
  });

  it('rejects a pause interval that ends after the walk', () => {
    expect(() =>
      Walk.rehydrate({
        id: EntityId.create('walk-invalid-pause-end'),
        date: DATE,
        type: WALK_TYPE.mindful,
        status: WALK_STATUS.completed,
        mode: WALK_MODE.stopwatch,
        startedAt: new Date('2026-08-08T08:10:00.000Z'),
        pauseIntervals: [
          PauseInterval.create(
            new Date('2026-08-08T08:40:00.000Z'),
            new Date('2026-08-08T08:50:00.000Z'),
          ),
        ],
        endedAt: new Date('2026-08-08T08:45:00.000Z'),
        timerTargetMinutes: null,
        reflectionQuestion: 'Что изменилось?',
        result: null,
        photo: null,
        createdAt: NOW,
        updatedAt: new Date('2026-08-08T08:45:00.000Z'),
        version: 3,
      }),
    ).toThrowError(expect.objectContaining({ code: 'walk.pause_after_end' }));
  });

  it('starts once and keeps the original start data on a repeated start', () => {
    const walk = Walk.create({
      id: EntityId.create('walk-start'),
      date: DATE,
      type: WALK_TYPE.mindful,
      now: NOW,
    });
    const started = walk.start({
      mode: WALK_MODE.timer,
      startedAt: new Date('2026-08-08T08:10:00.000Z'),
      timerTargetMinutes: 20,
      reflectionQuestion: 'Что важно?',
    });
    const repeated = started.start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-08T09:00:00.000Z'),
      reflectionQuestion: 'Другой вопрос',
    });

    expect(started).toMatchObject({
      status: WALK_STATUS.running,
      mode: WALK_MODE.timer,
      timerTargetMinutes: 20,
      reflectionQuestion: 'Что важно?',
      version: 2,
    });
    expect(repeated).toBe(started);
  });

  it('pauses and resumes once while preserving a timestamp pause interval', () => {
    const running = runningWalk('pause-resume', new Date('2026-08-08T08:10:00.000Z'));
    const pausedAt = new Date('2026-08-08T08:20:00.000Z');
    const resumedAt = new Date('2026-08-08T08:25:00.000Z');

    const paused = running.pause(pausedAt);
    const repeatedPause = paused.pause(new Date('2026-08-08T08:22:00.000Z'));
    const resumed = paused.resume(resumedAt);
    const repeatedResume = resumed.resume(new Date('2026-08-08T08:30:00.000Z'));

    expect(paused).toMatchObject({
      status: WALK_STATUS.paused,
      pausedAt,
      version: 3,
    });
    expect(repeatedPause).toBe(paused);
    expect(resumed).toMatchObject({
      status: WALK_STATUS.running,
      pausedAt: null,
      version: 4,
    });
    expect(resumed.pauseIntervals).toHaveLength(1);
    expect(resumed.pauseIntervals[0]?.startedAt).toEqual(pausedAt);
    expect(resumed.pauseIntervals[0]?.endedAt).toEqual(resumedAt);
    expect(repeatedResume).toBe(resumed);
  });

  it('derives active elapsed time from timestamps and excludes closed and open pauses', () => {
    const running = runningWalk('elapsed', new Date('2026-08-08T08:10:00.000Z'));
    const resumed = running
      .pause(new Date('2026-08-08T08:20:00.000Z'))
      .resume(new Date('2026-08-08T08:25:00.000Z'));
    const paused = resumed.pause(new Date('2026-08-08T08:40:00.000Z'));

    expect(resumed.elapsedDurationMilliseconds(new Date('2026-08-08T08:35:00.000Z'))).toBe(
      20 * 60 * 1000,
    );
    expect(paused.elapsedDurationMilliseconds(new Date('2026-08-08T09:00:00.000Z'))).toBe(
      25 * 60 * 1000,
    );
  });

  it('completes a paused walk by closing the open pause and excluding it from duration', () => {
    const paused = runningWalk('complete-paused', new Date('2026-08-08T08:10:00.000Z'))
      .pause(new Date('2026-08-08T08:20:00.000Z'))
      .resume(new Date('2026-08-08T08:25:00.000Z'))
      .pause(new Date('2026-08-08T08:40:00.000Z'));

    const completed = paused.complete({ endedAt: new Date('2026-08-08T09:00:00.000Z') });

    expect(completed).toMatchObject({
      status: WALK_STATUS.completed,
      pausedAt: null,
      version: 6,
    });
    expect(completed.pauseIntervals).toHaveLength(2);
    expect(completed.pauseIntervals[1]?.startedAt).toEqual(new Date('2026-08-08T08:40:00.000Z'));
    expect(completed.pauseIntervals[1]?.endedAt).toEqual(new Date('2026-08-08T09:00:00.000Z'));
    expect(completed.actualDurationMilliseconds).toBe(25 * 60 * 1000);
  });

  it('abandons a paused walk by closing its open pause', () => {
    const paused = runningWalk('abandon-paused', new Date('2026-08-08T08:10:00.000Z')).pause(
      new Date('2026-08-08T08:20:00.000Z'),
    );

    const abandoned = paused.abandon(new Date('2026-08-08T08:50:00.000Z'));

    expect(abandoned).toMatchObject({
      status: WALK_STATUS.abandoned,
      pausedAt: null,
      version: 4,
    });
    expect(abandoned.pauseIntervals).toHaveLength(1);
    expect(abandoned.pauseIntervals[0]?.endedAt).toEqual(new Date('2026-08-08T08:50:00.000Z'));
    expect(abandoned.actualDurationMilliseconds).toBe(10 * 60 * 1000);
  });

  it('rejects an unknown walk type', () => {
    expect(isWalkType('unknown')).toBe(false);
    expect(() =>
      Walk.create({
        id: EntityId.create('walk-unknown'),
        date: DATE,
        type: 'unknown' as never,
        now: NOW,
      }),
    ).toThrowError(expect.objectContaining({ code: 'walk.invalid_type' }));
  });

  it('completes a running walk with actual timestamps, trimmed result and photo', () => {
    const started = runningWalk('complete', new Date('2026-08-08T23:50:00.000Z'));
    const completed = started.complete({
      endedAt: new Date('2026-08-09T00:20:00.000Z'),
      result: '  Стало спокойнее.  ',
      photo: { dataUrl: 'data:image/png;base64,AQID', mimeType: 'image/png', sizeBytes: 3 },
    });

    expect(completed).toMatchObject({
      status: WALK_STATUS.completed,
      mode: started.mode,
      timerTargetMinutes: started.timerTargetMinutes,
      reflectionQuestion: started.reflectionQuestion,
      result: 'Стало спокойнее.',
      version: 3,
    });
    expect(completed.startedAt).toEqual(started.startedAt);
    expect(completed.endedAt).toEqual(new Date('2026-08-09T00:20:00.000Z'));
    expect(completed.actualDurationMilliseconds).toBe(30 * 60 * 1000);
  });

  it('allows an empty result and rejects an overlong result', () => {
    const started = runningWalk('result', new Date('2026-08-08T08:00:00.000Z'));
    expect(
      started.complete({ endedAt: new Date('2026-08-08T08:10:00.000Z'), result: '   ' }).result,
    ).toBeNull();
    expect(() =>
      started.complete({
        endedAt: new Date('2026-08-08T08:10:00.000Z'),
        result: 'x'.repeat(1001),
      }),
    ).toThrowError(expect.objectContaining({ code: 'walk.result_too_long' }));
  });

  it('records after-state, impact and trimmed reflection without changing completion time', () => {
    const completed = runningWalk('outcome', new Date('2026-08-08T08:00:00.000Z')).complete({
      endedAt: ENDED_AT,
    });
    const recorded = completed.recordOutcome({
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: WALK_IMPACT.better,
      reflection: '  Стало понятнее, с чего начать.  ',
      reentryAction: TODAY_REENTRY_ACTION,
      updatedAt: OUTCOME_AT,
    });

    expect(recorded).toMatchObject({
      status: WALK_STATUS.completed,
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: 'better',
      result: 'Стало понятнее, с чего начать.',
      version: completed.version + 1,
    });
    expect(recorded.endedAt).toEqual(ENDED_AT);
    expect(recorded.updatedAt).toEqual(OUTCOME_AT);
    expect(recorded.actualDurationMilliseconds).toBe(completed.actualDurationMilliseconds);
    expect(recorded.reentry).toEqual({
      status: WALK_REENTRY_STATUS.pending,
      action: {
        kind: WALK_REENTRY_ACTION_KIND.today,
        destination: WALK_RETURN_ORIGIN.today,
        entity: null,
        nextStep: null,
        routineContext: null,
      },
      preparedAt: OUTCOME_AT,
      resolvedAt: null,
    });
  });

  it('records a nullable reflection and protects the copied after-state', () => {
    const completed = runningWalk('outcome-copy', new Date('2026-08-08T08:00:00.000Z')).complete({
      endedAt: ENDED_AT,
    });
    const afterState = { energy: 6, tension: 3, clarity: 7 };

    const recorded = completed.recordOutcome({
      afterState,
      impact: WALK_IMPACT.same,
      reflection: '   ',
      reentryAction: TODAY_REENTRY_ACTION,
      updatedAt: OUTCOME_AT,
    });
    afterState.energy = 0;

    expect(recorded.afterState).toEqual({ energy: 6, tension: 3, clarity: 7 });
    expect(recorded.result).toBeNull();
  });

  it('allows an outcome only once and only for a completed walk', () => {
    const running = runningWalk('outcome-lifecycle', new Date('2026-08-08T08:00:00.000Z'));
    const input = {
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: WALK_IMPACT.better,
      reentryAction: TODAY_REENTRY_ACTION,
      updatedAt: OUTCOME_AT,
    };

    expect(() => running.recordOutcome(input)).toThrowError(
      expect.objectContaining({ code: 'walk.outcome_requires_completed' }),
    );

    const recorded = running.complete({ endedAt: ENDED_AT }).recordOutcome(input);
    expect(() => recorded.recordOutcome({ ...input, impact: WALK_IMPACT.worse })).toThrowError(
      expect.objectContaining({ code: 'walk.outcome_already_recorded' }),
    );
  });

  it('rejects an outcome timestamp before completion', () => {
    const completed = runningWalk(
      'outcome-before-end',
      new Date('2026-08-08T08:00:00.000Z'),
    ).complete({ endedAt: ENDED_AT });

    expect(() =>
      completed.recordOutcome({
        afterState: { energy: 7, tension: 2, clarity: 8 },
        impact: WALK_IMPACT.better,
        reentryAction: TODAY_REENTRY_ACTION,
        updatedAt: new Date('2026-08-08T08:29:59.000Z'),
      }),
    ).toThrowError(expect.objectContaining({ code: 'walk.outcome_before_end' }));
  });

  it('rejects an unknown rehydrated impact', () => {
    const completed = runningWalk('invalid-impact', new Date('2026-08-08T08:00:00.000Z')).complete({
      endedAt: ENDED_AT,
    });
    const data = {
      id: completed.id,
      date: completed.date,
      type: completed.type,
      status: completed.status,
      mode: completed.mode,
      startedAt: completed.startedAt,
      pauseIntervals: completed.pauseIntervals,
      endedAt: completed.endedAt,
      timerTargetMinutes: completed.timerTargetMinutes,
      reflectionQuestion: completed.reflectionQuestion,
      result: completed.result,
      photo: completed.photo,
      createdAt: completed.createdAt,
      updatedAt: completed.updatedAt,
      version: completed.version,
      impact: 'unknown',
    };

    expect(() => Walk.rehydrate(data as never)).toThrowError(
      expect.objectContaining({ code: 'walk.invalid_impact' }),
    );
  });

  it('completes or closes only a pending Reentry and preserves the walk session outcome', () => {
    const recorded = recordedWalk('reentry-lifecycle');
    const completedAt = new Date('2026-08-08T08:35:00.000Z');
    const closedAt = new Date('2026-08-08T08:36:00.000Z');

    const continued = recorded.completeReentry(completedAt);
    const closed = recorded.closeReentry(closedAt);

    expect(continued.reentry).toEqual({
      status: WALK_REENTRY_STATUS.completed,
      action: TODAY_REENTRY_ACTION,
      preparedAt: OUTCOME_AT,
      resolvedAt: completedAt,
    });
    expect(closed.reentry).toEqual({
      status: WALK_REENTRY_STATUS.closedWithoutContinuation,
      action: TODAY_REENTRY_ACTION,
      preparedAt: OUTCOME_AT,
      resolvedAt: closedAt,
    });
    for (const terminal of [continued, closed]) {
      expect(terminal).toMatchObject({
        status: WALK_STATUS.completed,
        afterState: recorded.afterState,
        impact: recorded.impact,
        result: recorded.result,
        endedAt: recorded.endedAt,
        pauseIntervals: recorded.pauseIntervals,
        version: recorded.version + 1,
      });
      expect(terminal.actualDurationMilliseconds).toBe(recorded.actualDurationMilliseconds);
    }
  });

  it('rejects absent, repeated or backward Reentry resolution', () => {
    const completedWithoutOutcome = runningWalk(
      'reentry-absent',
      new Date('2026-08-08T08:00:00.000Z'),
    ).complete({ endedAt: ENDED_AT });
    const recorded = recordedWalk('reentry-resolution-guard');

    expect(() => completedWithoutOutcome.completeReentry(OUTCOME_AT)).toThrowError(
      expect.objectContaining({ code: 'walk.reentry_not_pending' }),
    );
    expect(() => recorded.closeReentry(new Date('2026-08-08T08:31:59.000Z'))).toThrowError(
      expect.objectContaining({ code: 'walk.reentry_before_prepared' }),
    );

    const terminal = recorded.completeReentry(new Date('2026-08-08T08:35:00.000Z'));
    expect(() => terminal.completeReentry(new Date('2026-08-08T08:36:00.000Z'))).toThrowError(
      expect.objectContaining({ code: 'walk.reentry_not_pending' }),
    );
    expect(() => terminal.closeReentry(new Date('2026-08-08T08:36:00.000Z'))).toThrowError(
      expect.objectContaining({ code: 'walk.reentry_not_pending' }),
    );
  });

  it('restores legacy Walks without Reentry as non-pending', () => {
    const recorded = recordedWalk('legacy-reentry');
    const data = toRehydrationData(recorded);
    const { reentry, ...legacyData } = data;

    expect(reentry).not.toBeNull();
    const legacy = Walk.rehydrate(legacyData);

    expect(legacy.reentry).toBeNull();
  });

  it('defensively copies Reentry action, nested entity id and timestamps', () => {
    const entityId = EntityId.create('decision-reentry-copy');
    const action = {
      kind: WALK_REENTRY_ACTION_KIND.reviewResult,
      destination: WALK_RETURN_ORIGIN.decision,
      entity: { type: WALK_LINKED_ENTITY_TYPE.decision, id: entityId },
      nextStep: 'Вернуться к решению',
    } satisfies WalkReentryAction;
    const updatedAt = new Date(OUTCOME_AT);
    const completed = runningWalk('reentry-copy', new Date('2026-08-08T08:00:00.000Z')).complete({
      endedAt: ENDED_AT,
    });

    const recorded = completed.recordOutcome({
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: WALK_IMPACT.better,
      reflection: 'Есть вывод.',
      reentryAction: action,
      updatedAt,
    });
    action.nextStep = 'Изменено снаружи';
    updatedAt.setUTCMinutes(59);

    expect(recorded.reentry?.action.nextStep).toBe('Вернуться к решению');
    expect(recorded.reentry?.preparedAt).toEqual(OUTCOME_AT);
    expect(recorded.reentry?.action.entity?.id.equals(entityId)).toBe(true);
    expect(recorded.reentry?.action.entity?.id).not.toBe(entityId);
  });

  it.each([
    ['unknown status', { status: 'unknown' }],
    ['unknown action kind', { action: { ...TODAY_REENTRY_ACTION, kind: 'unknown' } }],
    ['unknown destination', { action: { ...TODAY_REENTRY_ACTION, destination: 'unknown' } }],
    ['malformed entity', { action: { ...TODAY_REENTRY_ACTION, entity: { type: 'decision' } } }],
    ['invalid next step', { action: { ...TODAY_REENTRY_ACTION, nextStep: 42 } }],
    ['non-Date preparedAt', { preparedAt: '2026-08-08T08:32:00.000Z' }],
    ['pending with resolvedAt', { resolvedAt: new Date('2026-08-08T08:33:00.000Z') }],
  ])('rejects Reentry with %s', (_caseName, override) => {
    const recorded = recordedWalk('invalid-reentry');
    const baseReentry = {
      status: WALK_REENTRY_STATUS.pending,
      action: TODAY_REENTRY_ACTION,
      preparedAt: OUTCOME_AT,
      resolvedAt: null,
    };

    expect(() =>
      Walk.rehydrate({
        ...toRehydrationData(recorded),
        reentry: { ...baseReentry, ...override },
      } as never),
    ).toThrowError(expect.objectContaining({ code: 'walk.invalid_reentry' }));
  });

  it.each([WALK_REENTRY_STATUS.completed, WALK_REENTRY_STATUS.closedWithoutContinuation])(
    'rejects terminal Reentry status %s without a resolution timestamp',
    (status) => {
      const recorded = recordedWalk(`invalid-reentry-${status}`);

      expect(() =>
        Walk.rehydrate({
          ...toRehydrationData(recorded),
          reentry: {
            status,
            action: TODAY_REENTRY_ACTION,
            preparedAt: OUTCOME_AT,
            resolvedAt: null,
          },
        }),
      ).toThrowError(expect.objectContaining({ code: 'walk.invalid_reentry' }));
    },
  );

  it('abandons only a running walk and does not allow a second transition', () => {
    const planned = Walk.create({
      id: EntityId.create('walk-planned-finish'),
      date: DATE,
      type: WALK_TYPE.physical,
      now: NOW,
    });
    expect(() => planned.complete({ endedAt: NOW })).toThrowError(
      expect.objectContaining({ code: 'walk.cannot_complete' }),
    );
    const abandoned = runningWalk('abandon', NOW).abandon(new Date('2026-08-08T08:30:00.000Z'));
    expect(abandoned.status).toBe(WALK_STATUS.abandoned);
    expect(() => abandoned.abandon(new Date('2026-08-08T09:00:00.000Z'))).toThrowError(
      expect.objectContaining({ code: 'walk.cannot_abandon' }),
    );
    expect(() =>
      abandoned.complete({ endedAt: new Date('2026-08-08T09:00:00.000Z') }),
    ).toThrowError(expect.objectContaining({ code: 'walk.cannot_complete' }));
  });

  it('defines stable ordered stages for every reflection template', () => {
    expect(WALK_REFLECTION_TEMPLATE).toEqual({
      decision: 'decision',
      problem: 'problem',
      goal: 'goal',
      strategy: 'strategy',
      freeThought: 'freeThought',
    });
    expect(getWalkReflectionStages(WALK_REFLECTION_TEMPLATE.decision)).toEqual([
      'facts',
      'assumptions',
      'options',
      'choiceCost',
      'smallestTest',
    ]);
    expect(getWalkReflectionStages(WALK_REFLECTION_TEMPLATE.problem)).toEqual([
      'situation',
      'rootCause',
      'constraints',
      'changeOptions',
      'nextExperiment',
    ]);
    expect(getWalkReflectionStages(WALK_REFLECTION_TEMPLATE.goal)).toEqual([
      'currentPosition',
      'desiredResult',
      'mainObstacle',
      'nearestLever',
      'nextStep',
    ]);
    expect(getWalkReflectionStages(WALK_REFLECTION_TEMPLATE.strategy)).toEqual([
      'context',
      'constraint',
      'priority',
      'sacrifice',
      'mainResult',
    ]);
    expect(getWalkReflectionStages(WALK_REFLECTION_TEMPLATE.freeThought)).toEqual([]);
    expect(isWalkReflectionTemplate('decision')).toBe(true);
    expect(isWalkReflectionTemplate('unknown')).toBe(false);
    expect(isWalkReflectionStage('facts')).toBe(true);
    expect(isWalkReflectionStage('unknown')).toBe(false);
  });

  it('starts guided reflection at the first stage and preserves timestamps while advancing', () => {
    const created = reflectionWalk('reflection-guided-start', WALK_REFLECTION_TEMPLATE.decision);
    const startedAt = new Date('2026-08-08T08:10:00.000Z');
    const started = created.start({
      mode: WALK_MODE.timer,
      startedAt,
      timerTargetMinutes: 30,
      reflectionQuestion: 'Стоит ли запускать проект?',
    });

    expect(started.reflectionTemplate).toBe('decision');
    expect(started.reflectionStage).toBe('facts');
    expect(typeof started.advanceReflectionStage).toBe('function');

    const advancedAt = new Date('2026-08-08T08:15:00.000Z');
    const advanced = started.advanceReflectionStage(advancedAt);

    expect(advanced.reflectionStage).toBe('assumptions');
    expect(advanced.startedAt).toEqual(startedAt);
    expect(advanced.updatedAt).toEqual(advancedAt);
    expect(advanced.version).toBe(started.version + 1);
  });

  it('finishes or disables reflection guidance without completing the walk', () => {
    const started = reflectionWalk(
      'reflection-guidance-lifecycle',
      WALK_REFLECTION_TEMPLATE.decision,
    ).start({
      mode: WALK_MODE.timer,
      startedAt: new Date('2026-08-08T08:10:00.000Z'),
      timerTargetMinutes: 30,
      reflectionQuestion: 'Стоит ли запускать проект?',
    });
    const second = started.advanceReflectionStage(new Date('2026-08-08T08:11:00.000Z'));
    const third = second.advanceReflectionStage(new Date('2026-08-08T08:12:00.000Z'));
    const fourth = third.advanceReflectionStage(new Date('2026-08-08T08:13:00.000Z'));
    const fifth = fourth.advanceReflectionStage(new Date('2026-08-08T08:14:00.000Z'));
    const finishedGuidance = fifth.advanceReflectionStage(new Date('2026-08-08T08:15:00.000Z'));

    expect(fifth.reflectionStage).toBe('smallestTest');
    expect(finishedGuidance).toMatchObject({
      status: WALK_STATUS.running,
      reflectionTemplate: 'decision',
      reflectionStage: null,
    });
    expect(() =>
      finishedGuidance.advanceReflectionStage(new Date('2026-08-08T08:16:00.000Z')),
    ).toThrowError(expect.objectContaining({ code: 'walk.reflection_guidance_unavailable' }));

    const disabled = second.disableReflectionGuidance(new Date('2026-08-08T08:17:00.000Z'));
    expect(disabled.reflectionStage).toBeNull();
    expect(disabled.status).toBe(WALK_STATUS.running);
    expect(disabled.disableReflectionGuidance(new Date('2026-08-08T08:18:00.000Z'))).toBe(disabled);
  });

  it('rejects reflection templates outside reflection intent and mismatched rehydrated stages', () => {
    expect(() =>
      Walk.create({
        id: EntityId.create('walk-invalid-reflection-template'),
        date: DATE,
        type: WALK_TYPE.restorative,
        intent: WALK_INTENT.recovery,
        reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
        now: NOW,
      }),
    ).toThrowError(expect.objectContaining({ code: 'walk.invalid_reflection_template' }));

    const started = reflectionWalk(
      'reflection-invalid-stage',
      WALK_REFLECTION_TEMPLATE.decision,
    ).start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-08T08:10:00.000Z'),
      reflectionQuestion: 'Стоит ли запускать проект?',
    });
    expect(() =>
      Walk.rehydrate({
        id: started.id,
        date: started.date,
        type: started.type,
        intent: started.intent,
        reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
        reflectionStage: WALK_REFLECTION_STAGE.rootCause,
        status: started.status,
        mode: started.mode,
        startedAt: started.startedAt,
        endedAt: started.endedAt,
        timerTargetMinutes: started.timerTargetMinutes,
        reflectionQuestion: started.reflectionQuestion,
        result: started.result,
        photo: started.photo,
        createdAt: started.createdAt,
        updatedAt: started.updatedAt,
        version: started.version,
      }),
    ).toThrowError(expect.objectContaining({ code: 'walk.invalid_reflection_stage' }));
  });

  it('restores legacy reflection walks without template or stage as free guidance', () => {
    const legacy = Walk.rehydrate({
      id: EntityId.create('walk-legacy-reflection'),
      date: DATE,
      type: WALK_TYPE.reflection,
      intent: WALK_INTENT.reflection,
      status: WALK_STATUS.running,
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-08T08:10:00.000Z'),
      endedAt: null,
      timerTargetMinutes: null,
      reflectionQuestion: 'Что сейчас важно?',
      result: null,
      photo: null,
      createdAt: NOW,
      updatedAt: new Date('2026-08-08T08:10:00.000Z'),
      version: 2,
    });

    expect(legacy.reflectionTemplate).toBeNull();
    expect(legacy.reflectionStage).toBeNull();
  });
});

function reflectionWalk(id: string, reflectionTemplate: WalkReflectionTemplate): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DATE,
    type: WALK_TYPE.reflection,
    intent: WALK_INTENT.reflection,
    reflectionTemplate,
    now: NOW,
  });
}

function runningWalk(id: string, startedAt: Date): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DATE,
    type: WALK_TYPE.mindful,
    now: new Date(startedAt.getTime() - 60_000),
  }).start({
    mode: WALK_MODE.timer,
    startedAt,
    timerTargetMinutes: 20,
    reflectionQuestion: 'Что важно заметить?',
  });
}

function recordedWalk(id: string): Walk {
  return runningWalk(id, new Date('2026-08-08T08:00:00.000Z'))
    .complete({ endedAt: ENDED_AT })
    .recordOutcome({
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: WALK_IMPACT.better,
      reflection: 'Стало понятнее, с чего начать.',
      reentryAction: TODAY_REENTRY_ACTION,
      updatedAt: OUTCOME_AT,
    });
}

function toRehydrationData(walk: Walk): WalkRehydrationData {
  return {
    id: walk.id,
    date: walk.date,
    type: walk.type,
    sphereId: walk.sphereId,
    intent: walk.intent,
    reflectionTemplate: walk.reflectionTemplate,
    reflectionStage: walk.reflectionStage,
    beforeState: walk.beforeState,
    afterState: walk.afterState,
    impact: walk.impact,
    linkedEntity: walk.linkedEntity,
    returnContext: walk.returnContext,
    reentry: walk.reentry,
    status: walk.status,
    mode: walk.mode,
    startedAt: walk.startedAt,
    pausedAt: walk.pausedAt,
    pauseIntervals: walk.pauseIntervals,
    endedAt: walk.endedAt,
    timerTargetMinutes: walk.timerTargetMinutes,
    reflectionQuestion: walk.reflectionQuestion,
    result: walk.result,
    photo: walk.photo,
    createdAt: walk.createdAt,
    updatedAt: walk.updatedAt,
    version: walk.version,
  };
}
