import { DomainError } from '../../shared/errors/DomainError';

export const MORNING_SHORTENED_MODE_STATE = {
  normal: 'normal',
  shortenedActive: 'shortened_active',
  revertedToNormal: 'reverted_to_normal',
} as const;

export type MorningShortenedModeState =
  (typeof MORNING_SHORTENED_MODE_STATE)[keyof typeof MORNING_SHORTENED_MODE_STATE];

export const MORNING_SHORTENED_ACTION = {
  keep: 'keep',
  shorten: 'shorten',
  skip: 'skip',
} as const;

export type MorningShortenedAction =
  (typeof MORNING_SHORTENED_ACTION)[keyof typeof MORNING_SHORTENED_ACTION];

export interface MorningShortenedConfiguration {
  readonly coldShower: typeof MORNING_SHORTENED_ACTION.keep | typeof MORNING_SHORTENED_ACTION.skip;
  readonly physical: MorningShortenedAction;
  readonly mirror: typeof MORNING_SHORTENED_ACTION.keep | typeof MORNING_SHORTENED_ACTION.skip;
}

export const DEFAULT_MORNING_SHORTENED_CONFIGURATION: MorningShortenedConfiguration = {
  coldShower: MORNING_SHORTENED_ACTION.skip,
  physical: MORNING_SHORTENED_ACTION.shorten,
  mirror: MORNING_SHORTENED_ACTION.keep,
};

export function isMorningShortenedModeState(value: unknown): value is MorningShortenedModeState {
  return Object.values(MORNING_SHORTENED_MODE_STATE).includes(value as MorningShortenedModeState);
}

export function copyMorningShortenedConfiguration(
  configuration: MorningShortenedConfiguration,
): MorningShortenedConfiguration {
  assertMorningShortenedConfiguration(configuration);
  return {
    coldShower: configuration.coldShower,
    physical: configuration.physical,
    mirror: configuration.mirror,
  };
}

export function assertMorningShortenedConfiguration(
  configuration: MorningShortenedConfiguration,
): void {
  const keepOrSkip = [MORNING_SHORTENED_ACTION.keep, MORNING_SHORTENED_ACTION.skip] as const;
  const physicalActions = Object.values(MORNING_SHORTENED_ACTION);
  if (
    configuration === null ||
    typeof configuration !== 'object' ||
    !keepOrSkip.includes(configuration.coldShower) ||
    !physicalActions.includes(configuration.physical) ||
    !keepOrSkip.includes(configuration.mirror)
  ) {
    throw new DomainError(
      'morning_cycle.invalid_shortened_configuration',
      'Настройки сокращённого утра указаны неверно.',
    );
  }
}
