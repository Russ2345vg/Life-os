import { DomainError } from '../../shared/errors/DomainError';
import { copyDate } from '../shared/dateCopy';

export interface MorningStartStateInput {
  readonly energy: number;
  readonly clarity: number;
  readonly mood: string;
}

export interface MorningStartState extends MorningStartStateInput {
  readonly recordedAt: Date;
}

export function createMorningStartState(
  input: MorningStartStateInput,
  recordedAt: Date,
): MorningStartState {
  const mood = input.mood.trim();
  if (
    !isScore(input.energy) ||
    !isScore(input.clarity) ||
    mood.length === 0 ||
    Number.isNaN(recordedAt.getTime())
  ) {
    throw invalidMorningStartState();
  }
  return {
    energy: input.energy,
    clarity: input.clarity,
    mood,
    recordedAt: copyDate(recordedAt),
  };
}

export function copyMorningStartState(state: MorningStartState): MorningStartState {
  return createMorningStartState(state, state.recordedAt);
}

export function sameMorningStartState(
  left: MorningStartState | null,
  right: MorningStartState,
): boolean {
  return (
    left !== null &&
    left.energy === right.energy &&
    left.clarity === right.clarity &&
    left.mood === right.mood
  );
}

function isScore(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 10;
}

function invalidMorningStartState(): DomainError {
  return new DomainError(
    'morning_cycle.invalid_start_state',
    'Состояние перед стартом указано неверно.',
  );
}
