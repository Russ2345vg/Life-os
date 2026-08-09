import { describe, expect, it } from 'vitest';
import {
  ActionExpectedResult,
  Day,
  DayDate,
  DECISION_KIND,
  Decision,
  DecisionTitle,
  EntityId,
  LifeAction,
  LifeActionTitle,
  WALK_TYPE,
  Walk,
} from './index';

const NOW = new Date('2026-08-08T08:00:00.000Z');
const DATE = DayDate.create('2026-08-08');
const sphereA = EntityId.create('sphere-a');
const sphereB = EntityId.create('sphere-b');

describe('sphereId usage', () => {
  it('assigns, changes and removes a Decision sphere', () => {
    const decision = Decision.createDraft({
      id: EntityId.create('decision-sphere'),
      title: DecisionTitle.create('Решение со сферой'),
      kind: DECISION_KIND.additional,
      sphereId: sphereA,
      occurredAt: NOW,
      eventId: EntityId.create('decision-created'),
    });
    decision.plan({
      plannedDate: DATE,
      kind: DECISION_KIND.additional,
      occurredAt: NOW,
      eventId: EntityId.create('decision-planned'),
    });

    decision.updateDetails({
      sphereId: sphereB,
      occurredAt: NOW,
      eventId: EntityId.create('decision-changed'),
    });
    expect(decision.sphereId?.equals(sphereB)).toBe(true);
    decision.updateDetails({
      sphereId: null,
      occurredAt: NOW,
      eventId: EntityId.create('decision-unlinked'),
    });
    expect(decision.sphereId).toBeNull();
  });

  it('assigns, changes and removes a LifeAction sphere', () => {
    const action = LifeAction.createDraft({
      id: EntityId.create('action-sphere'),
      title: LifeActionTitle.create('Действие со сферой'),
      sphereId: sphereA,
      createdAt: NOW,
      eventId: EntityId.create('action-created'),
    });
    action.makeReady({
      expectedResult: ActionExpectedResult.create('Получен результат'),
      plannedDate: DATE,
      occurredAt: NOW,
      eventId: EntityId.create('action-ready'),
    });
    action.updateDetails({
      title: action.title,
      description: action.description,
      expectedResult: action.expectedResult!,
      sphereId: sphereB,
      occurredAt: NOW,
      eventId: EntityId.create('action-changed'),
    });
    expect(action.sphereId?.equals(sphereB)).toBe(true);
    action.updateDetails({
      title: action.title,
      description: action.description,
      expectedResult: action.expectedResult!,
      sphereId: null,
      occurredAt: NOW,
      eventId: EntityId.create('action-unlinked'),
    });
    expect(action.sphereId).toBeNull();
  });

  it('assigns, changes and removes a Walk sphere without changing its lifecycle', () => {
    const walk = Walk.create({
      id: EntityId.create('walk-sphere'),
      date: DATE,
      type: WALK_TYPE.restorative,
      sphereId: sphereA,
      now: NOW,
    });
    const changed = walk.changeSphere(sphereB, new Date(NOW.getTime() + 1_000));
    const unlinked = changed.changeSphere(null, new Date(NOW.getTime() + 2_000));

    expect(changed.sphereId?.equals(sphereB)).toBe(true);
    expect(unlinked.sphereId).toBeNull();
    expect(unlinked.status).toBe(walk.status);
    expect(unlinked.version).toBe(walk.version + 2);
  });

  it('assigns, changes and removes a sphere on the canonical completed Day result', () => {
    const day = Day.openCurrent({
      id: EntityId.create('day-sphere'),
      currentDate: DATE,
      occurredAt: NOW,
      createdEventId: EntityId.create('day-created'),
      openedEventId: EntityId.create('day-opened'),
    });
    day.complete(
      new Date(NOW.getTime() + 1_000),
      EntityId.create('day-completed'),
      'Итог',
      sphereA,
    );
    expect(day.sphereId?.equals(sphereA)).toBe(true);
    day.changeResultSphere(sphereB);
    expect(day.sphereId?.equals(sphereB)).toBe(true);
    day.changeResultSphere(null);
    expect(day.sphereId).toBeNull();
  });
});
