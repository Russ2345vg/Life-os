export const MORNING_PHYSICAL_STATUS = {
  notConfigured: 'NOT_CONFIGURED',
  ready: 'READY',
  inProgress: 'IN_PROGRESS',
  done: 'DONE',
  skipped: 'SKIPPED',
} as const;

export type MorningPhysicalStatus =
  (typeof MORNING_PHYSICAL_STATUS)[keyof typeof MORNING_PHYSICAL_STATUS];

export function isMorningPhysicalStatus(value: string): value is MorningPhysicalStatus {
  return (Object.values(MORNING_PHYSICAL_STATUS) as readonly string[]).includes(value);
}
