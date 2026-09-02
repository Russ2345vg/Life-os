import {
  EVENING_CYCLE_MODE,
  EVENING_CYCLE_STATE,
  type DayDate,
  type EveningCycle,
  type RelaxationPractice,
  type ScreenFreeDurationMinutes,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import type { Clock } from '../ports/Clock';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import type { EveningRitualSettingsReader } from '../ports/EveningRitualSettingsReader';
import { DEFAULT_EVENING_RITUAL_SETTINGS } from '../evening-settings';
import { cloneEveningCycle } from './EveningCycleApplicationService';

type RelaxationMutation = (cycle: EveningCycle, occurredAt: Date) => void;

export class RelaxationApplicationService {
  readonly #cycles: EveningCycleRepository;
  readonly #clock: Clock;
  readonly #settings: EveningRitualSettingsReader | null;

  public constructor(
    cycles: EveningCycleRepository,
    clock: Clock,
    settings?: EveningRitualSettingsReader,
  ) {
    this.#cycles = cycles;
    this.#clock = clock;
    this.#settings = settings ?? null;
  }

  public async getOrInitialize(dateKey: DayDate): Promise<EveningCycle> {
    const stored = await this.requiredCycle(dateKey);
    if (stored.state !== EVENING_CYCLE_STATE.relaxing) {
      throw new DomainError(
        'relaxation.not_available',
        'Этап расслабления недоступен в текущем состоянии вечернего цикла.',
      );
    }
    if (stored.relaxation !== null) return stored;
    const settings = this.#settings?.loadEveningRitualSettings() ?? DEFAULT_EVENING_RITUAL_SETTINGS;
    const latest =
      !settings.adaptiveRelaxationEnabled ||
      this.#cycles.findLatestWithSavedRelaxationDefaultBefore === undefined
        ? null
        : await this.#cycles.findLatestWithSavedRelaxationDefaultBefore(dateKey);
    const defaultPractice =
      latest?.relaxation?.defaultPractice ?? settings.defaultRelaxationPractice;
    const special = stored.mode !== EVENING_CYCLE_MODE.normal;
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.initializeRelaxation(
        defaultPractice,
        special ? 5 : 15,
        (special ? 10 : settings.defaultScreenFreeDuration) as ScreenFreeDurationMinutes,
        occurredAt,
      );
    });
  }

  public getStored(dateKey: DayDate): Promise<EveningCycle | null> {
    return this.#cycles.findByDateKey(dateKey);
  }

  public choosePractice(
    dateKey: DayDate,
    practice: RelaxationPractice,
    persistAsDefault: boolean,
  ): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.chooseRelaxationPractice(practice, persistAsDefault, occurredAt);
    });
  }

  public setPracticeDuration(dateKey: DayDate, minutes: number): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.setRelaxationPracticeDuration(minutes, occurredAt);
    });
  }

  public completeDrink(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.completeRelaxationDrink(occurredAt);
    });
  }

  public completeHygiene(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.completeRelaxationHygiene(occurredAt);
    });
  }

  public startPracticeTimer(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.startRelaxationPracticeTimer(occurredAt);
    });
  }

  public completePractice(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.completeRelaxationPractice(occurredAt);
    });
  }

  public startScreenFree(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.startRelaxationScreenFree(occurredAt);
    });
  }

  public shortenScreenFree(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.shortenRelaxationScreenFree(occurredAt);
    });
  }

  public skipScreenFree(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.skipRelaxationScreenFree(occurredAt);
    });
  }

  public complete(dateKey: DayDate): Promise<EveningCycle> {
    return this.mutate(dateKey, (cycle, occurredAt) => {
      cycle.completeRelaxation(occurredAt);
    });
  }

  private async requiredCycle(dateKey: DayDate): Promise<EveningCycle> {
    const cycle = await this.#cycles.findByDateKey(dateKey);
    if (cycle === null) {
      throw new DomainError('evening_cycle.not_found', 'Вечерний цикл не найден.');
    }
    return cycle;
  }

  private async mutate(dateKey: DayDate, mutation: RelaxationMutation): Promise<EveningCycle> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const stored = await this.requiredCycle(dateKey);
      const cycle = cloneEveningCycle(stored);
      const expectedVersion = cycle.version;
      mutation(cycle, this.#clock.now());
      if (cycle.version === expectedVersion) return cycle;
      if (await this.#cycles.saveIfVersionMatches(cycle, expectedVersion)) return cycle;
    }
    throw new DomainError(
      'relaxation.concurrent_change',
      'Расслабление изменилось в другом окне. Повторите операцию.',
    );
  }
}
