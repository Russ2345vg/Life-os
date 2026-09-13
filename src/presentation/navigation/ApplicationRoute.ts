import { parseGoalAlbumRoute, type GoalAlbumRoute } from '../goals/GoalAlbumNavigation';
import { MANAGEMENT_SECTION } from '../management/ManagementSection';
import { parseRoutineRoute, type RoutineRoute } from '../routine/RoutineNavigation';
import { APP_SECTION, resolveMenuEntrySection, type AppSection } from './AppSection';
import { parsePlannerV2Route, type PlannerV2Route } from '../planner-v2/PlannerV2Navigation';

export type RoutedApplicationSection =
  | { readonly section: typeof APP_SECTION.today; readonly route: PlannerV2Route }
  | {
      readonly section: typeof APP_SECTION.management;
      readonly managementSection: typeof MANAGEMENT_SECTION.goals;
      readonly route: GoalAlbumRoute;
    }
  | {
      readonly section: typeof APP_SECTION.routine;
      readonly route: RoutineRoute;
    };

export function parseApplicationRoute(hash: string): RoutedApplicationSection | null {
  const plannerRoute = parsePlannerV2Route(hash);
  if (plannerRoute !== null) return { section: APP_SECTION.today, route: plannerRoute };
  const goalRoute = parseGoalAlbumRoute(hash);
  if (goalRoute !== null) {
    return {
      section: APP_SECTION.management,
      managementSection: MANAGEMENT_SECTION.goals,
      route: goalRoute,
    };
  }

  const routineRoute = parseRoutineRoute(hash);
  if (routineRoute !== null) {
    return { section: APP_SECTION.routine, route: routineRoute };
  }

  return null;
}

export function resolveInitialApplicationSection(
  route: RoutedApplicationSection | null,
  defaultSection: AppSection,
): AppSection {
  return route?.section ?? resolveMenuEntrySection(defaultSection);
}
