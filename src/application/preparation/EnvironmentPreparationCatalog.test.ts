import { describe, expect, it } from 'vitest';
import { PREPARATION_AREA } from '../../domain/preparation';
import {
  environmentPreparationRequirements,
  recommendedEnvironmentCoreKeys,
} from './EnvironmentPreparationCatalog';

describe('EnvironmentPreparationCatalog', () => {
  it('creates a stable 6+6 baseline and recommends two items from each area', () => {
    const requirements = environmentPreparationRequirements(null);

    expect(
      requirements.filter((item) => item.area === PREPARATION_AREA.sleepEnvironment),
    ).toHaveLength(6);
    expect(
      requirements.filter((item) => item.area === PREPARATION_AREA.tomorrowStart),
    ).toHaveLength(6);
    expect(new Set(requirements.map((item) => item.key)).size).toBe(requirements.length);
    expect(recommendedEnvironmentCoreKeys(requirements)).toEqual([
      'ENVIRONMENT:SLEEP:REMOVE_ACTIVE_SCREENS',
      'ENVIRONMENT:SLEEP:PHONE_AWAY',
      'ENVIRONMENT:TOMORROW:ALARM',
      'ENVIRONMENT:TOMORROW:FIRST_ACTION',
    ]);
  });
});
