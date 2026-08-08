import { describe, expect, it } from 'vitest';
import { DayDate, ROUTINE_BLOCK_ASSIGNMENT, ROUTINE_BLOCK_RECURRENCE } from '../../domain';
import { RoutineSubmissionGuard } from './RoutineSubmissionGuard';
import {
  changeRoutineBlockAssignment,
  createEmptyRoutineBlockForm,
  validateRoutineBlockForm,
} from './RoutineBlockFormState';

const DATE = DayDate.create('2026-08-08');

describe('RoutineBlockFormState', () => {
  it('starts with the selected date and empty required values', () => {
    const form = createEmptyRoutineBlockForm(DATE);
    expect(form.anchorDate).toBe('2026-08-08');
    expect(form.title).toBe('');
    expect(form.startTime).toBe('');
    expect(form.endTime).toBe('');
    expect(form.assignmentKind).toBe(ROUTINE_BLOCK_ASSIGNMENT.reminder);
  });

  it('requires an action for existingAction and clears it for reminder', () => {
    const existingAction = changeRoutineBlockAssignment(
      createEmptyRoutineBlockForm(DATE),
      ROUTINE_BLOCK_ASSIGNMENT.existingAction,
    );
    expect(validateRoutineBlockForm(existingAction).actionId).toBeDefined();
    const selected = { ...existingAction, actionId: 'action-1' };
    expect(changeRoutineBlockAssignment(selected, ROUTINE_BLOCK_ASSIGNMENT.reminder)).toMatchObject(
      { assignmentKind: ROUTINE_BLOCK_ASSIGNMENT.reminder, actionId: '' },
    );
  });

  it('reports empty title, startTime, and endTime', () => {
    expect(validateRoutineBlockForm(createEmptyRoutineBlockForm(DATE))).toMatchObject({
      title: expect.any(String),
      startTime: expect.any(String),
      endTime: expect.any(String),
    });
  });

  it('reports an end time that is not later than start time', () => {
    const form = {
      ...createEmptyRoutineBlockForm(DATE),
      title: 'Блок',
      startTime: '10:00',
      endTime: '09:00',
    };
    expect(validateRoutineBlockForm(form).endTime).toContain('позже');
  });

  it('requires weekdays for selectedWeekdays', () => {
    const form = {
      ...createEmptyRoutineBlockForm(DATE),
      title: 'Блок',
      startTime: '09:00',
      endTime: '10:00',
      recurrence: ROUTINE_BLOCK_RECURRENCE.selectedWeekdays,
    };
    expect(validateRoutineBlockForm(form).selectedWeekdays).toBeDefined();
  });
});

describe('RoutineSubmissionGuard', () => {
  it('blocks a fast double submission until the first one is released', () => {
    const guard = new RoutineSubmissionGuard();
    expect(guard.tryAcquire()).toBe(true);
    expect(guard.tryAcquire()).toBe(false);
    guard.release();
    expect(guard.tryAcquire()).toBe(true);
  });
});
