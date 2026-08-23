import { PROJECT_STATUS, type Project } from '../../domain';

export function sortProjects(projects: readonly Project[]): readonly Project[] {
  return [...projects].sort((left, right) => {
    if (left.isMain !== right.isMain) return left.isMain ? -1 : 1;
    const leftActive = left.status === PROJECT_STATUS.active;
    const rightActive = right.status === PROJECT_STATUS.active;
    if (leftActive !== rightActive) return leftActive ? -1 : 1;
    return right.updatedAt.getTime() - left.updatedAt.getTime();
  });
}
