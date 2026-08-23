import type { DirectionOverviewItem } from '../../application';
import { DIRECTION_STATUS, PROJECT_STATUS, type Project } from '../../domain';

export type ManagementFocus =
  | { readonly kind: 'project'; readonly project: Project }
  | { readonly kind: 'direction'; readonly direction: DirectionOverviewItem }
  | { readonly kind: 'empty' };

export function selectManagementFocus(
  directions: readonly DirectionOverviewItem[],
  projects: readonly Project[],
): ManagementFocus {
  const project = projects.find((item) => item.isMain && item.status === PROJECT_STATUS.active);
  if (project !== undefined) return { kind: 'project', project };
  const direction = directions.find(
    (item) => item.isMain && item.direction.status === DIRECTION_STATUS.active,
  );
  return direction === undefined ? { kind: 'empty' } : { kind: 'direction', direction };
}
