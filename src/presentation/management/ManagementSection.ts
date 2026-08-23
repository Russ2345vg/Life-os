export const MANAGEMENT_SECTION = {
  overview: 'overview',
  directions: 'directions',
  projects: 'projects',
  decisions: 'decisions',
  actions: 'actions',
  day: 'day',
} as const;

export type ManagementSection = (typeof MANAGEMENT_SECTION)[keyof typeof MANAGEMENT_SECTION];
