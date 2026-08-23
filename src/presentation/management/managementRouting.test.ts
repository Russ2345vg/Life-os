import { describe, expect, it } from 'vitest';
import { MANAGEMENT_SECTION } from './ManagementSection';
import {
  INITIAL_MANAGEMENT_NAVIGATION,
  popManagementRoute,
  pushManagementRoute,
} from './managementRouting';

describe('Management routing', () => {
  it('returns from a project opened inside a direction to that exact direction', () => {
    const direction = {
      section: MANAGEMENT_SECTION.directions,
      directionId: 'direction-1',
      projectId: null,
      decisionId: null,
    } as const;
    const project = {
      section: MANAGEMENT_SECTION.projects,
      directionId: null,
      projectId: 'project-1',
      decisionId: null,
    } as const;
    const opened = pushManagementRoute(INITIAL_MANAGEMENT_NAVIGATION, project, direction);

    expect(opened.route).toEqual(project);
    expect(popManagementRoute(opened).route).toEqual(direction);
  });

  it('preserves Project → Direction → Back navigation', () => {
    const project = {
      section: MANAGEMENT_SECTION.projects,
      directionId: null,
      projectId: 'project-1',
      decisionId: null,
    } as const;
    const direction = {
      section: MANAGEMENT_SECTION.directions,
      directionId: 'direction-1',
      projectId: null,
      decisionId: null,
    } as const;
    const projectState = pushManagementRoute(INITIAL_MANAGEMENT_NAVIGATION, project);
    const directionState = pushManagementRoute(projectState, direction);

    expect(popManagementRoute(directionState).route).toEqual(project);
  });
});
