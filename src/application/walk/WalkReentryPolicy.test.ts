import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  WALK_IMPACT,
  WALK_LINKED_ENTITY_TYPE,
  WALK_MODE,
  WALK_REENTRY_ACTION_KIND,
  WALK_RETURN_ORIGIN,
  WALK_TYPE,
  Walk,
  type WalkLinkedEntity,
  type WalkReturnContext,
} from '../../domain';
import { resolveWalkReentryAction } from './WalkReentryPolicy';

const DATE = DayDate.create('2026-08-25');

describe('resolveWalkReentryAction', () => {
  it.each([WALK_IMPACT.better, WALK_IMPACT.same, WALK_IMPACT.worse])(
    'keeps the original Decision as the explicit return for impact=%s',
    (impact) => {
      const entity = linkedEntity(WALK_LINKED_ENTITY_TYPE.decision, 'decision-worse');
      const walk = completedWalk('worse', {
        linkedEntity: entity,
        returnContext: {
          origin: WALK_RETURN_ORIGIN.decision,
          entity,
          nextStep: 'Вернуться к решению',
        },
      });

      expect(
        resolveWalkReentryAction(walk, {
          impact,
          reflection: 'Есть вывод, но стало хуже.',
        }),
      ).toEqual({
        kind: WALK_REENTRY_ACTION_KIND.reviewResult,
        destination: WALK_RETURN_ORIGIN.decision,
        entity,
        nextStep: null,
        routineContext: null,
      });
    },
  );

  it('still prioritizes recovery for an ordinary walk with no Decision return context', () => {
    expect(
      resolveWalkReentryAction(completedWalk('ordinary-worse'), { impact: WALK_IMPACT.worse }),
    ).toMatchObject({
      kind: WALK_REENTRY_ACTION_KIND.recovery,
      destination: WALK_RETURN_ORIGIN.today,
    });
  });

  it.each([WALK_IMPACT.better, WALK_IMPACT.same, WALK_IMPACT.worse])(
    'returns a blank outcome to the original context id for impact=%s',
    (impact) => {
      const original = linkedEntity(WALK_LINKED_ENTITY_TYPE.decision, 'original-decision');
      const walk = completedWalk('original-return', {
        linkedEntity: linkedEntity(WALK_LINKED_ENTITY_TYPE.decision, 'different-decision'),
        returnContext: { origin: WALK_RETURN_ORIGIN.decision, entity: original, nextStep: null },
      });
      expect(resolveWalkReentryAction(walk, { impact, reflection: '  ' })).toMatchObject({
        kind: WALK_REENTRY_ACTION_KIND.resumeContext,
        destination: WALK_RETURN_ORIGIN.decision,
        entity: original,
      });
    },
  );

  it.each([
    [WALK_LINKED_ENTITY_TYPE.decision, WALK_RETURN_ORIGIN.decision],
    [WALK_LINKED_ENTITY_TYPE.goal, WALK_RETURN_ORIGIN.goal],
    [WALK_LINKED_ENTITY_TYPE.project, WALK_RETURN_ORIGIN.project],
  ] as const)('returns to review a non-empty result linked to %s', (entityType, destination) => {
    const entity = linkedEntity(entityType, `${entityType}-review`);
    const walk = completedWalk(`review-${entityType}`, { linkedEntity: entity });

    expect(
      resolveWalkReentryAction(walk, {
        impact: WALK_IMPACT.better,
        reflection: '  Появился конкретный вывод.  ',
      }),
    ).toEqual({
      kind: WALK_REENTRY_ACTION_KIND.reviewResult,
      destination,
      entity,
      nextStep: null,
      routineContext: null,
    });
  });

  it('uses the explicit return context and trims its next step', () => {
    const entity = linkedEntity(WALK_LINKED_ENTITY_TYPE.lifeAction, 'action-return');
    const walk = completedWalk('resume-context', {
      returnContext: {
        origin: WALK_RETURN_ORIGIN.lifeAction,
        entity,
        nextStep: '  Продолжить выбранное действие  ',
      },
    });

    expect(resolveWalkReentryAction(walk, { impact: WALK_IMPACT.same })).toEqual({
      kind: WALK_REENTRY_ACTION_KIND.resumeContext,
      destination: WALK_RETURN_ORIGIN.lifeAction,
      entity,
      nextStep: 'Продолжить выбранное действие',
      routineContext: null,
    });
  });

  it('falls back to Today when no usable context exists', () => {
    expect(
      resolveWalkReentryAction(completedWalk('today'), { impact: WALK_IMPACT.better }),
    ).toEqual({
      kind: WALK_REENTRY_ACTION_KIND.today,
      destination: WALK_RETURN_ORIGIN.today,
      entity: null,
      nextStep: null,
      routineContext: null,
    });
  });

  it.each([WALK_LINKED_ENTITY_TYPE.lifeAction, WALK_LINKED_ENTITY_TYPE.routine] as const)(
    'does not infer a return destination from a bare %s link',
    (entityType) => {
      const walk = completedWalk(`bare-${entityType}`, {
        linkedEntity: linkedEntity(entityType, `${entityType}-bare`),
      });

      expect(resolveWalkReentryAction(walk, { impact: WALK_IMPACT.same })).toEqual({
        kind: WALK_REENTRY_ACTION_KIND.today,
        destination: WALK_RETURN_ORIGIN.today,
        entity: null,
        nextStep: null,
        routineContext: null,
      });
    },
  );

  it('does not treat whitespace-only reflection as a reviewable result', () => {
    const walk = completedWalk('blank-result', {
      linkedEntity: linkedEntity(WALK_LINKED_ENTITY_TYPE.goal, 'goal-blank'),
    });

    expect(
      resolveWalkReentryAction(walk, {
        impact: WALK_IMPACT.better,
        reflection: '   ',
      }),
    ).toEqual({
      kind: WALK_REENTRY_ACTION_KIND.today,
      destination: WALK_RETURN_ORIGIN.today,
      entity: null,
      nextStep: null,
      routineContext: null,
    });
  });

  it.each([WALK_IMPACT.better, WALK_IMPACT.same])(
    'preserves exact Routine context for %s',
    (impact) => {
      const entity = linkedEntity(WALK_LINKED_ENTITY_TYPE.routine, 'routine-source');
      const routineContext = {
        source: { routineBlockId: entity.id, occurrenceDate: DATE, effectiveDate: DATE },
        sourceTitle: 'Прогулка',
        next: {
          routineBlockId: EntityId.create('routine-next'),
          occurrenceDate: DATE,
          effectiveDate: DATE,
        },
      };
      const walk = completedWalk('routine-context', {
        linkedEntity: entity,
        returnContext: {
          origin: WALK_RETURN_ORIGIN.routine,
          entity,
          nextStep: 'Завтрак',
          routineContext,
        },
      });

      const action = resolveWalkReentryAction(walk, { impact });
      expect(action).toEqual({
        kind: WALK_REENTRY_ACTION_KIND.resumeContext,
        destination: WALK_RETURN_ORIGIN.routine,
        entity,
        nextStep: 'Завтрак',
        routineContext,
      });
      expect(action.routineContext).not.toBe(walk.returnContext?.routineContext);
      expect(resolveWalkReentryAction(walk, { impact: WALK_IMPACT.worse })).toMatchObject({
        destination: WALK_RETURN_ORIGIN.today,
        routineContext: null,
      });
    },
  );
});

interface WalkContextOptions {
  readonly linkedEntity?: WalkLinkedEntity;
  readonly returnContext?: WalkReturnContext;
}

function completedWalk(id: string, options: WalkContextOptions = {}): Walk {
  return Walk.create({
    id: EntityId.create(`walk-${id}`),
    date: DATE,
    type: WALK_TYPE.reflection,
    ...(options.linkedEntity === undefined ? {} : { linkedEntity: options.linkedEntity }),
    ...(options.returnContext === undefined ? {} : { returnContext: options.returnContext }),
    now: new Date('2026-08-25T09:00:00.000Z'),
  })
    .start({
      mode: WALK_MODE.stopwatch,
      startedAt: new Date('2026-08-25T09:05:00.000Z'),
      reflectionQuestion: 'Что сейчас важно заметить?',
    })
    .complete({ endedAt: new Date('2026-08-25T09:35:00.000Z') });
}

function linkedEntity(type: WalkLinkedEntity['type'], id: string): WalkLinkedEntity {
  return { type, id: EntityId.create(id) };
}
