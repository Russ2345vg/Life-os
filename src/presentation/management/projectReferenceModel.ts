import { useEffect, useState } from 'react';
import type { GetProjects } from '../../application';
import type { Decision, LifeAction, Project } from '../../domain';

export function useProjects(getProjects?: Pick<GetProjects, 'execute'>): readonly Project[] {
  const [projects, setProjects] = useState<readonly Project[]>([]);
  useEffect(() => {
    let cancelled = false;
    if (getProjects === undefined) return () => undefined;
    void getProjects
      .execute()
      .then((value) => {
        if (!cancelled) setProjects(value);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [getProjects]);
  return projects;
}

export function findProject(
  projects: readonly Project[],
  projectId: string | null,
): Project | null {
  if (projectId === null) return null;
  return projects.find((project) => project.id.toString() === projectId) ?? null;
}

export function findProjectForLifeAction(
  projects: readonly Project[],
  decisions: readonly Decision[],
  lifeAction: LifeAction,
): Project | null {
  const decisionId = lifeAction.decisionId;
  if (decisionId === null) return null;
  const decision = decisions.find((candidate) => candidate.id.equals(decisionId));
  return findProject(projects, decision?.projectId?.toString() ?? null);
}
