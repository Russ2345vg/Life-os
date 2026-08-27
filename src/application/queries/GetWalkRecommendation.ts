import type { WalkStateSnapshot } from '../../domain';
import type { GetWalkAnalytics } from './GetWalkAnalytics';
import {
  selectWalkRecommendation,
  type WalkRecommendation,
} from '../walk/WalkRecommendationPolicy';

/** No command or persistence-write capability: accepting is handled by the existing launch UI. */
export class GetWalkRecommendation {
  public constructor(private readonly analytics: Pick<GetWalkAnalytics, 'execute'>) {}

  public async execute(
    currentState: WalkStateSnapshot | null = null,
  ): Promise<WalkRecommendation | null> {
    return selectWalkRecommendation(await this.analytics.execute('last30Days'), currentState);
  }
}
