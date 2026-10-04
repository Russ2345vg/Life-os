import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  PauseInterval,
  WALK_INTENT,
  WALK_IMPACT,
  WALK_LINKED_ENTITY_TYPE,
  WALK_MODE,
  WALK_REENTRY_ACTION_KIND,
  WALK_REENTRY_STATUS,
  WALK_REFLECTION_STAGE,
  WALK_REFLECTION_TEMPLATE,
  WALK_RETURN_ORIGIN,
  WALK_STATUS,
  WALK_TYPE,
  Walk,
  type WalkRoutineContext,
} from '../../../domain';
import { WalkRecordMapper } from './WalkRecordMapper';

describe('WalkRecordMapper', () => {
  it('round-trips the minimal stage 14.1 walk record', () => {
    const walk = Walk.create({
      id: EntityId.create('walk-mapper'),
      date: DayDate.create('2026-08-08'),
      type: WALK_TYPE.reflection,
      sphereId: EntityId.create('sphere-health'),
      now: new Date('2026-08-08T08:00:00.000Z'),
    });

    const record = WalkRecordMapper.toRecord(walk);
    expect(record).toEqual({
      deletedAt: null,
      schemaVersion: 1,
      goalLinksVersion: 1,
      id: 'walk-mapper',
      date: '2026-08-08',
      type: WALK_TYPE.reflection,
      sphereId: 'sphere-health',
      intent: null,
      reflectionTemplate: null,
      reflectionStage: null,
      beforeState: null,
      afterState: null,
      impact: null,
      linkedEntity: null,
      returnContext: null,
      reentry: null,
      status: WALK_STATUS.planned,
      mode: null,
      startedAt: null,
      pausedAt: null,
      pauseIntervals: [],
      endedAt: null,
      timerTargetMinutes: null,
      reflectionQuestion: null,
      result: null,
      photo: null,
      createdAt: '2026-08-08T08:00:00.000Z',
      updatedAt: '2026-08-08T08:00:00.000Z',
      version: 1,
    });
    expect(WalkRecordMapper.fromRecord(record)).toMatchObject({
      type: WALK_TYPE.reflection,
      status: WALK_STATUS.planned,
      version: 1,
    });
  });

  it('reads a stage 14.1 record without start fields as planned', () => {
    const restored = WalkRecordMapper.fromRecord({
      schemaVersion: 1,
      id: 'walk-stage-14-1',
      date: '2026-08-08',
      type: WALK_TYPE.mindful,
      createdAt: '2026-08-08T08:00:00.000Z',
      updatedAt: '2026-08-08T08:00:00.000Z',
      version: 1,
    });

    expect(restored).toMatchObject({
      status: WALK_STATUS.planned,
      intent: null,
      beforeState: null,
      afterState: null,
      impact: null,
      linkedEntity: null,
      returnContext: null,
      reentry: null,
      mode: null,
      startedAt: null,
      pausedAt: null,
      pauseIntervals: [],
      reflectionQuestion: null,
      reflectionTemplate: null,
      reflectionStage: null,
      version: 1,
    });
    expect(restored.sphereId).toBeNull();
  });

  it('round-trips the selected reflection template and current stage', () => {
    const walk = Walk.create({
      id: EntityId.create('walk-reflection-roundtrip'),
      date: DayDate.create('2026-08-08'),
      type: WALK_TYPE.reflection,
      intent: WALK_INTENT.reflection,
      reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
      now: new Date('2026-08-08T08:00:00.000Z'),
    })
      .start({
        mode: WALK_MODE.stopwatch,
        startedAt: new Date('2026-08-08T08:01:00.000Z'),
        reflectionQuestion: 'Что важно решить?',
      })
      .advanceReflectionStage(new Date('2026-08-08T08:05:00.000Z'));

    const record = WalkRecordMapper.toRecord(walk);
    const restored = WalkRecordMapper.fromRecord(record);

    expect(record).toMatchObject({
      reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
      reflectionStage: WALK_REFLECTION_STAGE.assumptions,
    });
    expect(restored).toMatchObject({
      reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
      reflectionStage: WALK_REFLECTION_STAGE.assumptions,
      status: WALK_STATUS.running,
    });
  });

  it('preserves three optional reflection outcomes without requiring a general result', () => {
    const walk = Walk.create({
      id: EntityId.create('walk-notes'),
      date: DayDate.create('2026-10-03'),
      type: WALK_TYPE.reflection,
      intent: WALK_INTENT.reflection,
      now: new Date('2026-10-03T08:00:00Z'),
    })
      .start({ mode: WALK_MODE.stopwatch, startedAt: new Date('2026-10-03T08:00:00Z') })
      .complete({ endedAt: new Date('2026-10-03T08:20:00Z') })
      .reviseReflection({
        result: null,
        afterState: null,
        impact: null,
        notes: { understood: 'Нужен первый шаг', open: 'Сроки', next: 'Написать план' },
        updatedAt: new Date('2026-10-03T08:21:00Z'),
      });
    const record = WalkRecordMapper.toRecord(walk);
    expect(record.reflectionNotes).toEqual({
      understood: 'Нужен первый шаг',
      open: 'Сроки',
      next: 'Написать план',
    });
    expect(WalkRecordMapper.fromRecord(record).reflectionNotes).toEqual(walk.reflectionNotes);
    expect(() =>
      WalkRecordMapper.fromRecord({ ...record, reflectionNotes: { understood: 1 } }),
    ).toThrow();
    expect(() => WalkRecordMapper.fromRecord({ ...record, intent: 'free' })).toThrow();
  });

  it('reads legacy reflection records without template fields as null', () => {
    const restored = WalkRecordMapper.fromRecord({
      schemaVersion: 1,
      id: 'walk-legacy-reflection',
      date: '2026-08-08',
      type: WALK_TYPE.reflection,
      intent: WALK_INTENT.reflection,
      status: WALK_STATUS.planned,
      createdAt: '2026-08-08T08:00:00.000Z',
      updatedAt: '2026-08-08T08:00:00.000Z',
      version: 1,
    });

    expect(restored.reflectionTemplate).toBeNull();
    expect(restored.reflectionStage).toBeNull();
  });

  it.each([
    ['unknown template', { reflectionTemplate: 'unknown' }],
    ['unknown stage', { reflectionStage: 'unknown' }],
    [
      'mismatched stage',
      {
        reflectionTemplate: WALK_REFLECTION_TEMPLATE.decision,
        reflectionStage: WALK_REFLECTION_STAGE.rootCause,
      },
    ],
  ] as const)('rejects persisted reflection data with %s', (_description, reflectionData) => {
    expect(() =>
      WalkRecordMapper.fromRecord({
        schemaVersion: 1,
        id: 'walk-invalid-reflection-record',
        date: '2026-08-08',
        type: WALK_TYPE.reflection,
        intent: WALK_INTENT.reflection,
        status: WALK_STATUS.running,
        mode: WALK_MODE.stopwatch,
        startedAt: '2026-08-08T08:01:00.000Z',
        endedAt: null,
        timerTargetMinutes: null,
        reflectionQuestion: 'Что важно решить?',
        result: null,
        photo: null,
        createdAt: '2026-08-08T08:00:00.000Z',
        updatedAt: '2026-08-08T08:01:00.000Z',
        version: 2,
        ...reflectionData,
      }),
    ).toThrowError(expect.objectContaining({ code: 'persistence.invalid_record' }));
  });

  it('round-trips populated session fields and timestamp-based pause data', () => {
    const linkedEntity = {
      type: WALK_LINKED_ENTITY_TYPE.goal,
      id: EntityId.create('goal-health'),
    };
    const walk = Walk.rehydrate({
      id: EntityId.create('walk-session-roundtrip'),
      date: DayDate.create('2026-08-08'),
      type: WALK_TYPE.restorative,
      intent: WALK_INTENT.recovery,
      beforeState: { energy: 2, tension: 9, clarity: 3 },
      afterState: { energy: 6, tension: 4, clarity: 8 },
      impact: WALK_IMPACT.better,
      linkedEntity,
      returnContext: {
        origin: WALK_RETURN_ORIGIN.goal,
        entity: linkedEntity,
        nextStep: 'Уточнить следующий этап цели',
      },
      status: WALK_STATUS.completed,
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-08T08:10:00.000Z'),
      pausedAt: null,
      pauseIntervals: [
        PauseInterval.create(
          new Date('2026-08-08T08:20:00.000Z'),
          new Date('2026-08-08T08:25:00.000Z'),
        ),
      ],
      endedAt: new Date('2026-08-08T08:50:00.000Z'),
      timerTargetMinutes: null,
      reflectionQuestion: 'Что изменилось?',
      result: null,
      photo: null,
      createdAt: new Date('2026-08-08T08:00:00.000Z'),
      updatedAt: new Date('2026-08-08T08:50:00.000Z'),
      version: 4,
    });

    const record = WalkRecordMapper.toRecord(walk);
    const restored = WalkRecordMapper.fromRecord(record);

    expect(record).toMatchObject({
      intent: WALK_INTENT.recovery,
      startedAt: '2026-08-08T08:10:00.000Z',
      pausedAt: null,
      pauseIntervals: [
        {
          startedAt: '2026-08-08T08:20:00.000Z',
          endedAt: '2026-08-08T08:25:00.000Z',
        },
      ],
      endedAt: '2026-08-08T08:50:00.000Z',
      impact: WALK_IMPACT.better,
    });
    expect(restored).toMatchObject({
      intent: WALK_INTENT.recovery,
      beforeState: { energy: 2, tension: 9, clarity: 3 },
      afterState: { energy: 6, tension: 4, clarity: 8 },
      impact: WALK_IMPACT.better,
      status: WALK_STATUS.completed,
      returnContext: {
        origin: WALK_RETURN_ORIGIN.goal,
        nextStep: 'Уточнить следующий этап цели',
      },
    });
    expect(restored.linkedEntity?.id.toString()).toBe('goal-health');
    expect(restored.pauseIntervals[0]?.durationMilliseconds).toBe(5 * 60 * 1000);
  });

  it('round-trips a pending Reentry action in schema version 1', () => {
    const linkedEntity = {
      type: WALK_LINKED_ENTITY_TYPE.routine,
      id: EntityId.create('routine-evening'),
    };
    const routineContext = {
      source: {
        routineBlockId: linkedEntity.id,
        occurrenceDate: DayDate.create('2026-08-24'),
        effectiveDate: DayDate.create('2026-08-25'),
      },
      sourceTitle: 'Вечерняя прогулка',
      next: {
        routineBlockId: EntityId.create('routine-evening-review'),
        occurrenceDate: DayDate.create('2026-08-25'),
        effectiveDate: DayDate.create('2026-08-25'),
      },
    } satisfies WalkRoutineContext;
    const completed = Walk.create({
      id: EntityId.create('walk-reentry-roundtrip'),
      date: DayDate.create('2026-08-25'),
      type: WALK_TYPE.reflection,
      linkedEntity,
      returnContext: {
        origin: WALK_RETURN_ORIGIN.routine,
        entity: linkedEntity,
        nextStep: 'Душ и вода',
        routineContext,
      },
      now: new Date('2026-08-25T09:00:00.000Z'),
    })
      .start({
        mode: WALK_MODE.stopwatch,
        startedAt: new Date('2026-08-25T10:00:00.000Z'),
        reflectionQuestion: 'Что сейчас важно заметить?',
      })
      .complete({ endedAt: new Date('2026-08-25T10:29:00.000Z') });
    const walk = completed.recordOutcome({
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: WALK_IMPACT.better,
      reentryAction: {
        kind: WALK_REENTRY_ACTION_KIND.resumeContext,
        destination: WALK_RETURN_ORIGIN.routine,
        entity: linkedEntity,
        nextStep: 'Душ и вода',
        routineContext,
      },
      updatedAt: new Date('2026-08-25T10:30:00.000Z'),
    });

    const record = WalkRecordMapper.toRecord(walk);
    const restored = WalkRecordMapper.fromRecord(record);

    expect(record.schemaVersion).toBe(1);
    expect(record.returnContext).toEqual({
      origin: 'routine',
      entity: { type: 'routine', id: 'routine-evening' },
      nextStep: 'Душ и вода',
      routineContext: {
        source: {
          routineBlockId: 'routine-evening',
          occurrenceDate: '2026-08-24',
          effectiveDate: '2026-08-25',
        },
        sourceTitle: 'Вечерняя прогулка',
        next: {
          routineBlockId: 'routine-evening-review',
          occurrenceDate: '2026-08-25',
          effectiveDate: '2026-08-25',
        },
      },
    });
    expect(record.reentry).toEqual({
      status: 'pending',
      action: {
        kind: 'resumeContext',
        destination: 'routine',
        entity: { type: 'routine', id: 'routine-evening' },
        nextStep: 'Душ и вода',
        routineContext: {
          source: {
            routineBlockId: 'routine-evening',
            occurrenceDate: '2026-08-24',
            effectiveDate: '2026-08-25',
          },
          sourceTitle: 'Вечерняя прогулка',
          next: {
            routineBlockId: 'routine-evening-review',
            occurrenceDate: '2026-08-25',
            effectiveDate: '2026-08-25',
          },
        },
      },
      preparedAt: '2026-08-25T10:30:00.000Z',
      resolvedAt: null,
    });
    expect(restored.reentry).toEqual({
      status: WALK_REENTRY_STATUS.pending,
      action: {
        kind: WALK_REENTRY_ACTION_KIND.resumeContext,
        destination: WALK_RETURN_ORIGIN.routine,
        entity: linkedEntity,
        nextStep: 'Душ и вода',
        routineContext,
      },
      preparedAt: new Date('2026-08-25T10:30:00.000Z'),
      resolvedAt: null,
    });
  });

  it('reads legacy Routine-linked contexts without occurrence details as null', () => {
    const record = routineWalkRecordFixture();
    const legacyReturnContext = { ...record.returnContext! } as Record<string, unknown>;
    const legacyAction = { ...record.reentry!.action } as Record<string, unknown>;
    delete legacyReturnContext.routineContext;
    delete legacyAction.routineContext;

    const restored = WalkRecordMapper.fromRecord({
      ...record,
      returnContext: legacyReturnContext,
      reentry: { ...record.reentry!, action: legacyAction },
    });

    expect(restored.returnContext?.routineContext).toBeNull();
    expect(restored.reentry?.action.routineContext).toBeNull();
  });

  it.each([
    [
      'malformed routine id',
      {
        source: {
          routineBlockId: '',
          occurrenceDate: '2026-08-24',
          effectiveDate: '2026-08-25',
        },
      },
      'persistence.invalid_entity_id',
    ],
    [
      'malformed occurrence date',
      {
        source: {
          routineBlockId: 'routine-evening',
          occurrenceDate: '2026-02-30',
          effectiveDate: '2026-08-25',
        },
      },
      'persistence.invalid_date',
    ],
    ['blank source title', { sourceTitle: '   ' }, 'persistence.invalid_record'],
  ] as const)('rejects persisted Routine context with %s', (_description, override, code) => {
    const record = routineWalkRecordFixture();
    const routineContext = record.returnContext!.routineContext!;

    expect(() =>
      WalkRecordMapper.fromRecord({
        ...record,
        returnContext: {
          ...record.returnContext!,
          routineContext: { ...routineContext, ...override },
        },
      }),
    ).toThrowError(expect.objectContaining({ code }));
  });

  it('reads a legacy completed Walk without Reentry as non-pending', () => {
    const completed = completedWalkRecordFixture();
    const { reentry: _reentry, ...legacyRecord } = completed;

    expect(_reentry).not.toBeNull();
    const restored = WalkRecordMapper.fromRecord(legacyRecord);

    expect(restored.reentry).toBeNull();
  });

  it.each([
    ['unknown status', { status: 'unknown' }],
    [
      'unknown action kind',
      {
        action: {
          kind: 'unknown',
          destination: 'today',
          entity: null,
          nextStep: null,
        },
      },
    ],
    [
      'unknown destination',
      {
        action: {
          kind: 'today',
          destination: 'unknown',
          entity: null,
          nextStep: null,
        },
      },
    ],
    [
      'malformed entity',
      {
        action: {
          kind: 'reviewResult',
          destination: 'decision',
          entity: { type: 'decision' },
          nextStep: null,
        },
      },
    ],
    ['invalid prepared timestamp', { preparedAt: 'not-a-date' }],
    ['pending with resolved timestamp', { resolvedAt: '2026-08-25T10:31:00.000Z' }],
  ] as const)('rejects persisted Reentry with %s', (_description, override) => {
    const record = completedWalkRecordFixture();

    expect(() =>
      WalkRecordMapper.fromRecord({
        ...record,
        reentry: { ...record.reentry!, ...override },
      }),
    ).toThrowError(expect.objectContaining({ code: 'persistence.invalid_record' }));
  });

  it.each([WALK_REENTRY_STATUS.completed, WALK_REENTRY_STATUS.closedWithoutContinuation])(
    'rejects persisted terminal Reentry status %s without resolvedAt',
    (status) => {
      const record = completedWalkRecordFixture();

      expect(() =>
        WalkRecordMapper.fromRecord({
          ...record,
          reentry: { ...record.reentry!, status, resolvedAt: null },
        }),
      ).toThrowError(expect.objectContaining({ code: 'persistence.invalid_record' }));
    },
  );

  it('rejects a persisted unknown walk type', () => {
    expect(() =>
      WalkRecordMapper.fromRecord({
        schemaVersion: 1,
        id: 'walk-invalid',
        date: '2026-08-08',
        type: 'unknown',
        createdAt: '2026-08-08T08:00:00.000Z',
        updatedAt: '2026-08-08T08:00:00.000Z',
        version: 1,
      }),
    ).toThrowError(expect.objectContaining({ code: 'persistence.invalid_record' }));
  });

  it('rejects an unknown persisted walk impact', () => {
    const completed = Walk.create({
      id: EntityId.create('walk-invalid-impact-record'),
      date: DayDate.create('2026-08-08'),
      type: WALK_TYPE.mindful,
      now: new Date('2026-08-08T07:00:00.000Z'),
    })
      .start({
        mode: WALK_MODE.stopwatch,
        startedAt: new Date('2026-08-08T08:00:00.000Z'),
        reflectionQuestion: 'Что изменилось?',
      })
      .complete({ endedAt: new Date('2026-08-08T08:30:00.000Z') });

    expect(() =>
      WalkRecordMapper.fromRecord({
        ...WalkRecordMapper.toRecord(completed),
        impact: 'unknown',
      }),
    ).toThrowError(expect.objectContaining({ code: 'persistence.invalid_record' }));
  });
});

function completedWalkRecordFixture() {
  const completed = Walk.create({
    id: EntityId.create('walk-reentry-record-fixture'),
    date: DayDate.create('2026-08-25'),
    type: WALK_TYPE.reflection,
    now: new Date('2026-08-25T09:00:00.000Z'),
  })
    .start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-25T10:00:00.000Z'),
      reflectionQuestion: 'Что сейчас важно заметить?',
    })
    .complete({ endedAt: new Date('2026-08-25T10:29:00.000Z') })
    .recordOutcome({
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: WALK_IMPACT.better,
      reentryAction: {
        kind: WALK_REENTRY_ACTION_KIND.today,
        destination: WALK_RETURN_ORIGIN.today,
        entity: null,
        nextStep: null,
      },
      updatedAt: new Date('2026-08-25T10:30:00.000Z'),
    });
  return WalkRecordMapper.toRecord(completed);
}

function routineWalkRecordFixture() {
  const linkedEntity = {
    type: WALK_LINKED_ENTITY_TYPE.routine,
    id: EntityId.create('routine-evening'),
  } as const;
  const routineContext = {
    source: {
      routineBlockId: linkedEntity.id,
      occurrenceDate: DayDate.create('2026-08-24'),
      effectiveDate: DayDate.create('2026-08-25'),
    },
    sourceTitle: 'Вечерняя прогулка',
    next: null,
  } satisfies WalkRoutineContext;
  const completed = Walk.create({
    id: EntityId.create('walk-routine-record-fixture'),
    date: DayDate.create('2026-08-25'),
    type: WALK_TYPE.mindful,
    linkedEntity,
    returnContext: {
      origin: WALK_RETURN_ORIGIN.routine,
      entity: linkedEntity,
      nextStep: null,
      routineContext,
    },
    now: new Date('2026-08-25T09:00:00.000Z'),
  })
    .start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-25T10:00:00.000Z'),
      reflectionQuestion: 'Что сейчас важно заметить?',
    })
    .complete({ endedAt: new Date('2026-08-25T10:29:00.000Z') })
    .recordOutcome({
      afterState: { energy: 7, tension: 2, clarity: 8 },
      impact: WALK_IMPACT.better,
      reentryAction: {
        kind: WALK_REENTRY_ACTION_KIND.resumeContext,
        destination: WALK_RETURN_ORIGIN.routine,
        entity: linkedEntity,
        nextStep: null,
        routineContext,
      },
      updatedAt: new Date('2026-08-25T10:30:00.000Z'),
    });
  return WalkRecordMapper.toRecord(completed);
}
