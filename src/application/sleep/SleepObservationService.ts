import {
  confirmSleepObservation,
  createWakeObservationDraft,
  isConfirmedSleepObservation,
  reviseSleepObservation,
  type SleepObservation,
} from '../../domain/sleep/SleepObservation';
import type { SleepScheduleState, WakeResult } from '../../domain/sleep/SleepSchedule';
import type { Clock } from '../ports/Clock';
import type { SleepObservationRepository } from './SleepObservationRepository';
import type { SleepScheduleRepository } from './SleepScheduleRepository';

export interface SleepObservationInput {
  readonly cycleDate: string;
  readonly wentToBedAt: Date;
  readonly wokeAt: Date;
}

export class SleepObservationService {
  public constructor(
    private readonly observations: SleepObservationRepository,
    private readonly schedules: SleepScheduleRepository,
    private readonly clock: Clock,
  ) {}

  public async pending(cycleDate?: string): Promise<SleepObservation | null> {
    if (cycleDate !== undefined) {
      const observation = await this.observations.getByCycleDate(cycleDate);
      return observation !== null && !isConfirmedSleepObservation(observation) ? observation : null;
    }
    const state = await this.schedules.load();
    if (state === null) return null;
    for (const cycle of [...state.nightCycles].sort((left, right) =>
      right.cycleDate.localeCompare(left.cycleDate),
    )) {
      const observation = await this.observations.getByCycleDate(cycle.cycleDate);
      if (observation !== null && !isConfirmedSleepObservation(observation)) return observation;
    }
    return null;
  }

  public history(from: string, to: string): Promise<readonly SleepObservation[]> {
    return this.observations.list({ from, to });
  }

  public async reconcileWakeResult(
    state: SleepScheduleState,
    result: WakeResult,
  ): Promise<SleepObservation | null> {
    if (result.kind === 'NO_RESULT') return null;
    const occurrence = state.wakeOccurrences.find(({ id }) => id === result.occurrenceId);
    if (occurrence === undefined || state.settings === null) return null;
    const existing = await this.observations.getByCycleDate(occurrence.cycleDate);
    if (existing !== null) return existing;
    const cycle = state.nightCycles.find(({ cycleDate }) => cycleDate === occurrence.cycleDate);
    const draft = createWakeObservationDraft({
      id: observationId(occurrence.cycleDate),
      cycleDate: occurrence.cycleDate,
      nightCycleId: cycle?.id ?? null,
      wakeOccurrenceId: occurrence.id,
      wakeKind: result.kind,
      wokeAt: result.recordedAt,
      timeZone: state.settings.timeZone,
      now: this.clock.now(),
    });
    await this.observations.save(draft);
    return draft;
  }

  public async confirm(input: SleepObservationInput): Promise<SleepObservation> {
    const [existing, state] = await Promise.all([
      this.observations.getByCycleDate(input.cycleDate),
      this.schedules.load(),
    ]);
    const cycle = state?.nightCycles.find(({ cycleDate }) => cycleDate === input.cycleDate);
    const confirmed = confirmSleepObservation(existing, {
      id: observationId(input.cycleDate),
      cycleDate: input.cycleDate,
      nightCycleId: cycle?.id ?? null,
      wentToBedAt: input.wentToBedAt,
      wokeAt: input.wokeAt,
      timeZone: existing?.timeZone ?? state?.settings?.timeZone ?? localTimeZone(),
      confirmedAt: this.clock.now(),
    });
    await this.observations.save(confirmed);
    return confirmed;
  }

  public async revise(input: SleepObservationInput): Promise<SleepObservation> {
    const existing = await this.observations.getByCycleDate(input.cycleDate);
    if (existing === null) throw new Error('Наблюдение за этой ночью не найдено.');
    const revised = reviseSleepObservation(existing, {
      wentToBedAt: input.wentToBedAt,
      wokeAt: input.wokeAt,
      updatedAt: this.clock.now(),
    });
    await this.observations.save(revised);
    return revised;
  }
}

function observationId(cycleDate: string): string {
  return `sleep-observation:${cycleDate}`;
}

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
