import { describe, expect, it, vi } from 'vitest';
import {
  DayDate,
  EntityId,
  ROUTINE_BLOCK_ASSIGNMENT,
  ROUTINE_BLOCK_CATEGORY,
  ROUTINE_BLOCK_RECURRENCE,
  RoutineBlock,
  RoutineBlockRecurrence,
} from '../../domain';
import { openRoutineAssignmentSection } from './RoutineAssignmentNavigation';

describe('RoutineBlock walk navigation', () => {
  it('opens the canonical walks section without creating or starting a walk', () => {
    const openWalks = vi.fn();

    expect(openRoutineAssignmentSection({ kind: ROUTINE_BLOCK_ASSIGNMENT.walk }, openWalks)).toBe(
      true,
    );
    expect(openWalks).toHaveBeenCalledOnce();
  });

  it('keeps a rehydrated legacy walk assignment connected to the walks section', () => {
    const legacyBlock = RoutineBlock.rehydrate({
      id: EntityId.create('legacy-walk-block'),
      anchorDate: DayDate.create('2026-08-08'),
      title: 'Прогулка',
      startTime: '12:00',
      endTime: '13:00',
      category: ROUTINE_BLOCK_CATEGORY.other,
      recurrence: RoutineBlockRecurrence.create(ROUTINE_BLOCK_RECURRENCE.none),
      required: false,
      assignment: { kind: ROUTINE_BLOCK_ASSIGNMENT.walk },
      createdAt: new Date('2026-08-01T00:00:00.000Z'),
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
      version: 1,
    });
    const openWalks = vi.fn();

    expect(openRoutineAssignmentSection(legacyBlock.assignment, openWalks)).toBe(true);
    expect(openWalks).toHaveBeenCalledOnce();
  });
});
