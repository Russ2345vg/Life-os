import type { ActionListFilters } from '../actionListFilters';

export interface ActionListFiltersStore {
  load(): ActionListFilters;
  save(filters: ActionListFilters): boolean;
  reset(): boolean;
}
