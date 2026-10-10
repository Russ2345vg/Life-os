import { DayDate, EntityId, RoutineBlock, RoutineBlockRecurrence } from '../../domain';
export function routineTestBlock(id: string, startTime = '12:00'): RoutineBlock {
  return RoutineBlock.create({
    id: EntityId.create(id),
    anchorDate: DayDate.create('2026-10-10'),
    title: 'Отдых',
    startTime,
    endTime: '12:15',
    category: 'rest',
    recurrence: RoutineBlockRecurrence.create('none'),
    required: false,
    now: new Date('2026-10-10T00:00:00Z'),
  });
}
