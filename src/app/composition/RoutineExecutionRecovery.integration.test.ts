import { IDBFactory } from 'fake-indexeddb';
import { describe, expect, it } from 'vitest';
import {
  DayDate,
  DECISION_KIND,
  EntityId,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  RoutineBlock,
  RoutineBlockRecurrence,
  RoutineOccurrenceExecution,
} from '../../domain';
import { IndexedDbRoutineBlockRepository } from '../../infrastructure/persistence/IndexedDbRoutineBlockRepository';
import { IndexedDbRoutineOccurrenceExecutionRepository } from '../../infrastructure/persistence/IndexedDbRoutineOccurrenceExecutionRepository';
import { LifeOsIndexedDb } from '../../infrastructure/persistence/indexed-db/LifeOsIndexedDb';
import { FakeClock, FakeCurrentDateProvider, FakeIdGenerator } from '../../test/helpers/Fakes';
import { createLifeOsApplication } from './createLifeOsApplication';

const YESTERDAY = DayDate.create('2026-08-07');
const TODAY = DayDate.create('2026-08-08');

describe('routine execution recovery composition', () => {
  it('recovers yesterday, completes it and unlocks today without recreating the application', async () => {
    const factory = new IDBFactory();
    const seedDatabase = new LifeOsIndexedDb(factory);
    const block = RoutineBlock.create({
      id: EntityId.create('daily-recovery-block'),
      anchorDate: YESTERDAY,
      title: 'Ежедневный фокус',
      startTime: '08:00',
      endTime: '09:00',
      category: ROUTINE_BLOCK_CATEGORY.work,
      recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.daily),
      required: true,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });
    await new IndexedDbRoutineBlockRepository(seedDatabase).save(block);
    await new IndexedDbRoutineOccurrenceExecutionRepository(seedDatabase).addIfNoRunning(
      RoutineOccurrenceExecution.start({
        id: EntityId.create('yesterday-running'),
        routineBlockId: block.id,
        occurrenceDate: YESTERDAY,
        occurredAt: new Date('2026-08-07T08:15:00.000Z'),
      }),
    );
    seedDatabase.close();

    const clock = new FakeClock(new Date('2026-08-08T09:20:00.000Z'));
    const application = await createLifeOsApplication({
      database: new LifeOsIndexedDb(factory),
      clock,
      currentDateProvider: new FakeCurrentDateProvider(TODAY),
      idGenerator: new FakeIdGenerator('recovery'),
    });
    expect(
      (
        await application.createDecisionForDate.execute({
          title: 'Главное решение',
          kind: DECISION_KIND.main,
          plannedDate: TODAY,
          expectedResult: 'Текущий день открыт',
        })
      ).ok,
    ).toBe(true);
    expect((await application.startCurrentDay.execute()).ok).toBe(true);
    const recovery = await application.getRunningRoutineOccurrence.execute();
    expect(recovery).toMatchObject({
      occurrence: { title: 'Ежедневный фокус', effectiveDate: YESTERDAY },
      execution: { status: 'running' },
    });
    if (recovery === null) throw new Error('Recovery was not restored');

    const completed = await application.completeRoutineOccurrence.execute({
      routineBlockId: recovery.occurrence.sourceBlockId,
      occurrenceDate: recovery.occurrence.occurrenceDate,
      effectiveDate: recovery.occurrence.effectiveDate,
      expectedVersion: recovery.execution.version,
    });
    expect(completed).toMatchObject({
      ok: true,
      value: { actualEndedAt: new Date('2026-08-08T09:20:00.000Z') },
    });
    await expect(application.getRunningRoutineOccurrence.execute()).resolves.toBeNull();

    const todayOccurrence = (await application.getRoutineBlocksForDate.execute(TODAY))[0]!;
    await expect(
      application.startRoutineOccurrence.execute({
        routineBlockId: todayOccurrence.sourceBlockId,
        occurrenceDate: todayOccurrence.occurrenceDate,
        effectiveDate: todayOccurrence.effectiveDate,
      }),
    ).resolves.toMatchObject({ ok: true, value: { status: 'running' } });
    application.close();
  });
});
