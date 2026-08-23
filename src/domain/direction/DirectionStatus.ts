export const DIRECTION_STATUS = {
  active: 'active',
  archived: 'archived',
} as const;

export type DirectionStatus = (typeof DIRECTION_STATUS)[keyof typeof DIRECTION_STATUS];

export function isDirectionStatus(value: unknown): value is DirectionStatus {
  return Object.values(DIRECTION_STATUS).includes(value as DirectionStatus);
}
