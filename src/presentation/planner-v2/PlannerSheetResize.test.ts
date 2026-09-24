import { describe, expect, it } from 'vitest';
import {
  clampPlannerSheetWidth,
  nextPlannerSheetWidthFromKey,
  resizePlannerSheetFromPointer,
} from './PlannerSheetResize';

describe('PlannerSheet resize', () => {
  it('grows when the shared left edge moves left and clamps to desktop limits', () => {
    expect(resizePlannerSheetFromPointer(520, 760, 660, 1440)).toBe(620);
    expect(resizePlannerSheetFromPointer(520, 760, 100, 1440)).toBe(720);
    expect(resizePlannerSheetFromPointer(520, 760, 1200, 1440)).toBe(320);
    expect(clampPlannerSheetWidth(720, 900)).toBe(660);
  });

  it('supports precise keyboard resizing of every shared sheet', () => {
    expect(nextPlannerSheetWidthFromKey(520, 'ArrowLeft', 1440)).toBe(552);
    expect(nextPlannerSheetWidthFromKey(520, 'ArrowRight', 1440)).toBe(488);
    expect(nextPlannerSheetWidthFromKey(520, 'Home', 1440)).toBe(320);
    expect(nextPlannerSheetWidthFromKey(520, 'End', 1440)).toBe(720);
    expect(nextPlannerSheetWidthFromKey(520, 'Enter', 1440)).toBeNull();
  });
});
