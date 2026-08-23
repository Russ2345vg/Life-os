import { describe, expect, it } from 'vitest';
import {
  Day,
  DayDate,
  EntityId,
  EveningCycle,
  OPEN_LOOP_ENTITY_TYPE,
  OPEN_LOOP_REQUIREMENT,
  OPEN_LOOP_RESOLUTION,
  OpenLoopReference,
} from '../../domain';
import { createPlannedDecision } from '../../test/helpers/DecisionTestFactory';
import type {
  ActionSessionRepository,
  DayRepository,
  DecisionRepository,
  LifeActionRepository,
  EveningCycleRepository,
} from '../ports';
import { GetReflectionContext } from './GetReflectionContext';

const OWNER_DATE = DayDate.create('2026-08-14');
const NEXT_DATE = DayDate.create('2026-08-15');
const AFTER_MIDNIGHT = new Date('2026-08-15T00:08:00.000+09:00');

describe('GetReflectionContext', () => {
  it('собирает перенесённое главное Решение по EveningCycle.dayId после полуночи', async () => {
    const day = openDay();
    const decision = createPlannedDecision('main', OWNER_DATE);
    const cycle = EveningCycle.create({
      id: id('cycle'),
      dayId: day.id,
      dateKey: OWNER_DATE,
      occurredAt: AFTER_MIDNIGHT,
    });
    cycle.start(AFTER_MIDNIGHT);
    cycle.beginResolving(AFTER_MIDNIGHT);
    cycle.initializeOpenLoops(
      [
        OpenLoopReference.create({
          entityType: OPEN_LOOP_ENTITY_TYPE.decision,
          entityId: decision.id,
          requirement: OPEN_LOOP_REQUIREMENT.requiresResolution,
          sourceVersion: decision.version,
        }),
      ],
      AFTER_MIDNIGHT,
    );
    decision.updateDetails({
      reason: 'Уточнён способ выполнения после REVISE',
      occurredAt: AFTER_MIDNIGHT,
      eventId: id('revised'),
    });
    decision.reschedule(NEXT_DATE, 'Недостаток времени', AFTER_MIDNIGHT, id('rescheduled'), 1);
    cycle.recordOpenLoopResolution(
      OPEN_LOOP_ENTITY_TYPE.decision,
      decision.id,
      OPEN_LOOP_RESOLUTION.carryForward,
      AFTER_MIDNIGHT,
      'Недостаток времени',
    );
    cycle.completeResolving(AFTER_MIDNIGHT);
    const cycles = new MemoryEveningCycleRepository();
    await cycles.createIfAbsent(cycle);

    const query = new GetReflectionContext(
      cycles,
      dayRepository(day),
      decisionRepository(decision),
      emptyLifeActionRepository(),
      emptySessionRepository(),
    );
    const context = await query.execute(cycle.id);

    expect(context.dayId.equals(day.id)).toBe(true);
    expect(context.dateKey).toBe(OWNER_DATE.toString());
    expect(context.mainDecision?.entityId.equals(decision.id)).toBe(true);
    expect(context.incompleteDecisions.map((item) => item.entityId.toString())).toEqual([
      decision.id.toString(),
    ]);
    expect(context.carriedForwardItems[0]?.reasonKnown).toBe(true);
    expect(context.revisedItems.map((item) => item.entityId.toString())).toEqual([
      decision.id.toString(),
    ]);
    expect(context.openLoopResultCount).toBe(1);
  });
});

function openDay(): Day {
  return Day.openCurrent({
    id: id('day'),
    currentDate: OWNER_DATE,
    occurredAt: new Date('2026-08-14T08:00:00.000+09:00'),
    createdEventId: id('day-created'),
    openedEventId: id('day-opened'),
  });
}

function dayRepository(day: Day): DayRepository {
  return {
    findByDate: async (date) => (date.equals(day.date) ? day : null),
    findOpen: async () => day,
    save: async () => undefined,
    saveIfVersionMatches: async () => true,
  };
}

function decisionRepository(
  decision: ReturnType<typeof createPlannedDecision>,
): DecisionRepository {
  return {
    findById: async (candidateId) => (candidateId.equals(decision.id) ? decision : null),
    findByDate: async (date) => (decision.plannedDate?.equals(date) === true ? [decision] : []),
    findAll: async () => [decision],
    save: async () => undefined,
    saveIfVersionMatches: async () => true,
  };
}

function emptyLifeActionRepository(): LifeActionRepository {
  return {
    findById: async () => null,
    findByDate: async () => [],
    findByDecisionId: async () => [],
    findAll: async () => [],
    save: async () => undefined,
  };
}

function emptySessionRepository(): ActionSessionRepository {
  return {
    findById: async () => null,
    findByLifeActionId: async () => [],
    findUnfinished: async () => null,
    findAll: async () => [],
    save: async () => undefined,
  };
}

function id(value: string): EntityId {
  return EntityId.create(value);
}

class MemoryEveningCycleRepository implements EveningCycleRepository {
  readonly #cycles = new Map<string, EveningCycle>();

  public async findById(cycleId: EntityId): Promise<EveningCycle | null> {
    return [...this.#cycles.values()].find((cycle) => cycle.id.equals(cycleId)) ?? null;
  }

  public async findByDayId(dayId: EntityId): Promise<EveningCycle | null> {
    return [...this.#cycles.values()].find((cycle) => cycle.dayId.equals(dayId)) ?? null;
  }

  public async findByDateKey(dateKey: DayDate): Promise<EveningCycle | null> {
    return this.#cycles.get(dateKey.toString()) ?? null;
  }

  public async createIfAbsent(cycle: EveningCycle): Promise<EveningCycle> {
    this.#cycles.set(cycle.dateKey.toString(), cycle);
    return cycle;
  }

  public async saveIfVersionMatches(
    cycle: EveningCycle,
    expectedVersion: number,
  ): Promise<boolean> {
    const stored = await this.findByDateKey(cycle.dateKey);
    if (stored === null || stored.version !== expectedVersion) return false;
    this.#cycles.set(cycle.dateKey.toString(), cycle);
    return true;
  }
}
