import {
  confirmSleepObservation,
  createWakeObservationDraft,
  isConfirmedSleepObservation,
  reviseSleepObservation,
  recordManualSleepDraft,
  validateSleepObservation,
  type SleepObservation,
  setSleepMorningFeedback,
  clearSleepMorningFeedback,
} from '../../domain/sleep/SleepObservation';
import type { SleepMorningFeedbackPatch } from '../../domain/sleep/SleepMorningFeedback';
import type { SleepScheduleState, WakeResult } from '../../domain/sleep/SleepSchedule';
import { resolveSleepCycleDate } from '../../domain/sleep/NightTime';
import type { Clock } from '../ports/Clock';
import type { SleepObservationRepository } from './SleepObservationRepository';
import type { SleepScheduleRepository } from './SleepScheduleRepository';

export interface SleepObservationInput {
  readonly timeZone?: string;
  readonly cycleDate: string;
  readonly wentToBedAt: Date;
  readonly wokeAt: Date;
}

export interface SleepQuickEntryContext {
  readonly bedtimeCycleDate: string;
  readonly wakeCycleDate: string;
  readonly timeZone: string;
}

export class SleepObservationService {
  private mutationQueue: Promise<unknown> = Promise.resolve();
  public constructor(
    private readonly observations: SleepObservationRepository,
    private readonly schedules: SleepScheduleRepository,
    private readonly clock: Clock,
  ) {}

  public async quickEntryContext(now: Date = this.clock.now()): Promise<SleepQuickEntryContext> {
    const state = await this.schedules.load();
    const settings = state?.settings;
    if (!settings) throw new Error('Сначала настройте время сна и подъёма.');
    const today = resolveSleepCycleDate(now, settings.timeZone, '00:00');
    const previousDate = new Date(`${today}T12:00:00Z`);
    previousDate.setUTCDate(previousDate.getUTCDate() - 1);
    const pastNight = previousDate.toISOString().slice(0, 10);
    const recent = await this.observations.list({ from: pastNight, to: today });
    const bedtimeDraft = recent
      .filter(
        (item) =>
          !isConfirmedSleepObservation(item) &&
          item.wentToBedAt !== null &&
          item.wentToBedAt <= now &&
          now.getTime() - item.wentToBedAt.getTime() < 24 * 60 * 60_000,
      )
      .sort((a, b) => b.wentToBedAt!.getTime() - a.wentToBedAt!.getTime())[0];
    return {
      bedtimeCycleDate: resolveSleepCycleDate(now, settings.timeZone, settings.wakeTime),
      wakeCycleDate: bedtimeDraft?.cycleDate ?? pastNight,
      timeZone: settings.timeZone,
    };
  }

  public markBedtimeNow(): Promise<SleepObservation> {
    return this.markNow('BEDTIME');
  }
  public markWakeNow(): Promise<SleepObservation> {
    return this.markNow('WAKE');
  }

  private markNow(kind: 'BEDTIME' | 'WAKE'): Promise<SleepObservation> {
    const now = this.clock.now();
    return this.mutate(async () => {
      const context = await this.quickEntryContext(now);
      const cycleDate = kind === 'BEDTIME' ? context.bedtimeCycleDate : context.wakeCycleDate;
      const [existing, state] = await Promise.all([
        this.observations.getByCycleDate(cycleDate),
        this.schedules.load(),
      ]);
      const draft = recordManualSleepDraft(existing, {
        id: observationId(cycleDate),
        cycleDate,
        nightCycleId: state?.nightCycles.find((cycle) => cycle.cycleDate === cycleDate)?.id ?? null,
        timeZone: context.timeZone,
        kind,
        recordedAt: now,
        now,
      });
      if (draft !== existing) await this.observations.save(draft);
      return draft;
    });
  }

  private mutate<T>(work: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(work);
    this.mutationQueue = result.catch(() => undefined);
    return result;
  }

  public setMorningFeedback(input: {
    readonly cycleDate: string;
    readonly timeZone?: string;
    readonly feedback: SleepMorningFeedbackPatch;
  }): Promise<SleepObservation> {
    return this.mutate(async () => {
      const [existing, state] = await Promise.all([
        this.observations.getByCycleDate(input.cycleDate),
        this.schedules.load(),
      ]);
      const observation = setSleepMorningFeedback(existing, {
        id: observationId(input.cycleDate),
        cycleDate: input.cycleDate,
        nightCycleId:
          state?.nightCycles.find((cycle) => cycle.cycleDate === input.cycleDate)?.id ?? null,
        timeZone:
          existing?.timeZone ?? input.timeZone ?? state?.settings?.timeZone ?? localTimeZone(),
        patch: input.feedback,
        now: this.clock.now(),
      });
      await this.observations.save(observation);
      return observation;
    });
  }

  public clearMorningFeedback(cycleDate: string): Promise<SleepObservation | null> {
    return this.mutate(async () => {
      const existing = await this.observations.getByCycleDate(cycleDate);
      if (existing === null) return null;
      const cleared = clearSleepMorningFeedback(existing, this.clock.now());
      if (cleared !== existing) await this.observations.save(cleared);
      return cleared;
    });
  }

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
    return this.mutate(async () => {
      if (result.kind === 'NO_RESULT') return null;
      const occurrence = state.wakeOccurrences.find(({ id }) => id === result.occurrenceId);
      if (occurrence === undefined || state.settings === null) return null;
      const existing = await this.observations.getByCycleDate(occurrence.cycleDate);
      if (existing !== null && (isConfirmedSleepObservation(existing) || existing.wokeAt !== null))
        return existing;
      if (existing?.wentToBedAt && existing.wentToBedAt >= result.recordedAt) return existing;
      const cycle = state.nightCycles.find(({ cycleDate }) => cycleDate === occurrence.cycleDate);
      const candidate = createWakeObservationDraft({
        id: observationId(occurrence.cycleDate),
        cycleDate: occurrence.cycleDate,
        nightCycleId: cycle?.id ?? null,
        wakeOccurrenceId: occurrence.id,
        wakeKind: result.kind,
        wokeAt: result.recordedAt,
        timeZone: state.settings.timeZone,
        now: this.clock.now(),
      });
      const draft: SleepObservation = existing
        ? {
            ...existing,
            wokeAt: candidate.wokeAt,
            wakeSource: candidate.wakeSource,
            wakeOccurrenceId: candidate.wakeOccurrenceId,
            updatedAt: candidate.updatedAt,
          }
        : candidate;
      validateSleepObservation(draft);
      await this.observations.save(draft);
      return draft;
    });
  }

  public async confirm(input: SleepObservationInput): Promise<SleepObservation> {
    return this.mutate(async () => {
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
        timeZone:
          existing?.timeZone ?? input.timeZone ?? state?.settings?.timeZone ?? localTimeZone(),
        confirmedAt: this.clock.now(),
      });
      await this.observations.save(confirmed);
      return confirmed;
    });
  }

  public async revise(input: SleepObservationInput): Promise<SleepObservation> {
    return this.mutate(async () => {
      const existing = await this.observations.getByCycleDate(input.cycleDate);
      if (existing === null) throw new Error('Наблюдение за этой ночью не найдено.');
      const revised = reviseSleepObservation(existing, {
        wentToBedAt: input.wentToBedAt,
        wokeAt: input.wokeAt,
        updatedAt: this.clock.now(),
      });
      await this.observations.save(revised);
      return revised;
    });
  }
}

function observationId(cycleDate: string): string {
  return `sleep-observation:${cycleDate}`;
}

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
