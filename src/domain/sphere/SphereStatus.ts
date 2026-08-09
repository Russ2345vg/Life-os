export const SPHERE_STATUS = {
  active: 'active',
  archived: 'archived',
} as const;

export type SphereStatus = (typeof SPHERE_STATUS)[keyof typeof SPHERE_STATUS];

export function isSphereStatus(value: unknown): value is SphereStatus {
  return Object.values(SPHERE_STATUS).includes(value as SphereStatus);
}
