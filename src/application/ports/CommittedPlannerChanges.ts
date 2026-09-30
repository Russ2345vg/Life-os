export type PlannerDataCollection =
  | 'goals'
  | 'directions'
  | 'spheres'
  | 'lifeActions'
  | 'inboxIdeas'
  | 'timeCapacity'
  | 'focusPeriods'
  | 'planningPeriods'
  | 'periodMemberships'
  | 'periodDecisions'
  | 'recurrenceRules'
  | 'contributionLinks'
  | 'progressContributions';

export interface CommittedPlannerChanges {
  subscribe(listener: (collections: readonly PlannerDataCollection[]) => void): () => void;
}
