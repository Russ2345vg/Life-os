export const ROUTINE_BLOCK_CATEGORY = {
  sleep: 'sleep',
  morning: 'morning',
  work: 'work',
  rest: 'rest',
  meal: 'meal',
  physical: 'physical',
  personal: 'personal',
  other: 'other',
} as const;

export type RoutineBlockCategory =
  (typeof ROUTINE_BLOCK_CATEGORY)[keyof typeof ROUTINE_BLOCK_CATEGORY];

export function isRoutineBlockCategory(value: string): value is RoutineBlockCategory {
  return Object.values(ROUTINE_BLOCK_CATEGORY).some((category) => category === value);
}
