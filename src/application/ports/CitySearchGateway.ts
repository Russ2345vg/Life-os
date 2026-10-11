import type { WalkCity } from '../../domain/walk/SunsetWalkSchedule';
export interface CitySearchGateway {
  search(query: string, signal?: AbortSignal): Promise<readonly WalkCity[]>;
}
