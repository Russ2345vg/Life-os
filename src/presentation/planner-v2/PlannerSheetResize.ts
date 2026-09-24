export const DEFAULT_PLANNER_SHEET_WIDTH = 520;
export const PLANNER_SHEET_WIDTH_STORAGE_KEY = 'lifeos.planner-sheet-width.v1';
export const MIN_PLANNER_SHEET_WIDTH = 320;
export const MAX_PLANNER_SHEET_WIDTH = 720;

const MIN_VISIBLE_WORKSPACE = 240;
const KEYBOARD_STEP = 32;

export function clampPlannerSheetWidth(width: number, viewportWidth: number): number {
  const availableMaximum = Math.max(MIN_PLANNER_SHEET_WIDTH, viewportWidth - MIN_VISIBLE_WORKSPACE);
  return Math.round(
    Math.min(
      Math.max(width, MIN_PLANNER_SHEET_WIDTH),
      Math.min(MAX_PLANNER_SHEET_WIDTH, availableMaximum),
    ),
  );
}

export function resizePlannerSheetFromPointer(
  startWidth: number,
  startX: number,
  currentX: number,
  viewportWidth: number,
): number {
  return clampPlannerSheetWidth(startWidth + startX - currentX, viewportWidth);
}

export function nextPlannerSheetWidthFromKey(
  width: number,
  key: string,
  viewportWidth: number,
): number | null {
  if (key === 'ArrowLeft') return clampPlannerSheetWidth(width + KEYBOARD_STEP, viewportWidth);
  if (key === 'ArrowRight') return clampPlannerSheetWidth(width - KEYBOARD_STEP, viewportWidth);
  if (key === 'Home') return clampPlannerSheetWidth(MIN_PLANNER_SHEET_WIDTH, viewportWidth);
  if (key === 'End') return clampPlannerSheetWidth(MAX_PLANNER_SHEET_WIDTH, viewportWidth);
  return null;
}
