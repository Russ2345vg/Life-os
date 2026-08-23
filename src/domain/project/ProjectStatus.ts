export const PROJECT_STATUS = {
  active: 'active',
  paused: 'paused',
  completed: 'completed',
  archived: 'archived',
} as const;

export type ProjectStatus = (typeof PROJECT_STATUS)[keyof typeof PROJECT_STATUS];

export function isProjectStatus(value: unknown): value is ProjectStatus {
  return Object.values(PROJECT_STATUS).includes(value as ProjectStatus);
}
