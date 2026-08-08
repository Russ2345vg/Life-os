import { describe, expect, it } from 'vitest';
import {
  DayDate,
  EntityId,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  ROUTINE_OCCURRENCE_OVERRIDE_TYPE,
  RoutineBlock,
  RoutineBlockRecurrence,
  RoutineOccurrenceExecution,
  RoutineOccurrenceOverride,
} from '../../domain';
import {
  InMemoryRoutineBlockRepository,
  InMemoryRoutineOccurrenceExecutionRepository,
  InMemoryRoutineOccurrenceOverrideRepository,
} from '../../infrastructure';
import { GetRunningRoutineOccurrence } from './GetRunningRoutineOccurrence';

const OCCURRENCE_DATE = DayDate.create('2026-08-07');
const EFFECTIVE_DATE = DayDate.create('2026-08-08');

describe('GetRunningRoutineOccurrence', () => {
  it('restores the locked block and rescheduled historical plan around the running fact', async () => {
    const block = RoutineBlock.create({
      id: EntityId.create('recovery-block'),
      anchorDate: OCCURRENCE_DATE,
      title: 'Утренний фокус',
      startTime: '08:00',
      endTime: '09:00',
      category: ROUTINE_BLOCK_CATEGORY.work,
      recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
      required: true,
      now: new Date('2026-08-01T00:00:00.000Z'),
    });
    const override = RoutineOccurrenceOverride.create({
      id: EntityId.create('recovery-override'),
      routineBlockId: block.id,
      occurrenceDate: OCCURRENCE_DATE,
      type: ROUTINE_OCCURRENCE_OVERRIDE_TYPE.rescheduled,
      targetDate: EFFECTIVE_DATE,
      targetStartTime: '10:30',
      now: new Date('2026-08-07T07:00:00.000Z'),
    });
    const execution = RoutineOccurrenceExecution.start({
      id: EntityId.create('recovery-execution'),
      routineBlockId: block.id,
      occurrenceDate: OCCURRENCE_DATE,
      occurredAt: new Date('2026-08-08T10:42:00.000Z'),
    });
    const blocks = new InMemoryRoutineBlockRepository();
    await blocks.save(block);
    const query = new GetRunningRoutineOccurrence(
      new InMemoryRoutineOccurrenceExecutionRepository([execution]),
      blocks,
      new InMemoryRoutineOccurrenceOverrideRepository([override]),
    );

    await expect(query.execute()).resolves.toMatchObject({
      execution: {
        actualStartedAt: new Date('2026-08-08T10:42:00.000Z'),
        status: 'running',
      },
      occurrence: {
        title: 'Утренний фокус',
        occurrenceDate: OCCURRENCE_DATE,
        effectiveDate: EFFECTIVE_DATE,
        effectiveStartTime: '10:30',
        effectiveEndTime: '11:30',
      },
    });
  });

  it('treats multiple running facts as an integrity error', async () => {
    const executions = ['one', 'two'].map((id, index) =>
      RoutineOccurrenceExecution.start({
        id: EntityId.create(`execution-${id}`),
        routineBlockId: EntityId.create(`block-${index}`),
        occurrenceDate: OCCURRENCE_DATE,
        occurredAt: new Date('2026-08-07T08:00:00.000Z'),
      }),
    );
    const query = new GetRunningRoutineOccurrence(
      new InMemoryRoutineOccurrenceExecutionRepository(executions),
      new InMemoryRoutineBlockRepository(),
      new InMemoryRoutineOccurrenceOverrideRepository(),
    );

    await expect(query.execute()).rejects.toMatchObject({
      code: 'routine_execution.multiple_running',
    });
  });
});
