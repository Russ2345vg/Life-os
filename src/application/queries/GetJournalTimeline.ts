import {
  JOURNAL_SUBJECT_TYPE,
  JOURNAL_CORRECTION_FIELD,
  JOURNAL_ENTRY_TYPE,
  DECISION_STATUS,
  LIFE_ACTION_STATUS,
  EntityId,
  type DayDate,
  type Decision,
  type JournalEntry,
  type LifeAction,
  type JournalCorrectionField,
} from '../../domain';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { JournalRepository } from '../ports/JournalRepository';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { SphereRepository } from '../ports/SphereRepository';

export interface GetJournalTimelineInput {
  readonly startDate: DayDate;
  readonly endDate: DayDate;
}

export interface JournalTimelineItem {
  readonly entry: JournalEntry;
  readonly sphereName: string | null;
  readonly decision: Decision | null;
  readonly lifeAction: LifeAction | null;
  readonly correctionTarget: JournalCorrectionTarget | null;
  readonly sourceEntry: JournalEntry | null;
}

export interface JournalCorrectionTarget {
  readonly field: JournalCorrectionField;
  readonly fieldLabel: string;
  readonly entityLabel: string;
  readonly currentValue: string | null;
}

export interface JournalTimelineResult {
  readonly startDate: DayDate;
  readonly endDate: DayDate;
  readonly items: readonly JournalTimelineItem[];
}

export class GetJournalTimeline {
  readonly #journalRepository: JournalRepository;
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #sphereRepository: SphereRepository;

  public constructor(
    journalRepository: JournalRepository,
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    sphereRepository: SphereRepository,
  ) {
    this.#journalRepository = journalRepository;
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#sphereRepository = sphereRepository;
  }

  public async execute(input: GetJournalTimelineInput): Promise<JournalTimelineResult> {
    const entries = await this.#journalRepository.findByEffectiveDateRange(
      input.startDate,
      input.endDate,
    );
    const items = await Promise.all(entries.map((entry) => this.resolveItem(entry)));

    return Object.freeze({
      startDate: input.startDate,
      endDate: input.endDate,
      items: Object.freeze(items),
    });
  }

  private async resolveItem(entry: JournalEntry): Promise<JournalTimelineItem> {
    const [sphereName, decision, lifeAction] = await Promise.all([
      this.resolveSphereName(entry),
      this.resolveDecision(entry),
      this.resolveLifeAction(entry),
    ]);
    const sourceEntry = await this.resolveSourceEntry(entry);
    return Object.freeze({
      entry,
      sphereName,
      decision,
      lifeAction,
      correctionTarget: resolveCorrectionTarget(entry, decision, lifeAction),
      sourceEntry,
    });
  }

  private async resolveSphereName(entry: JournalEntry): Promise<string | null> {
    if (entry.sphereId === null) return null;
    const sphere = await this.#sphereRepository.findById(entry.sphereId);
    return sphere?.name ?? null;
  }

  private async resolveDecision(entry: JournalEntry): Promise<Decision | null> {
    if (entry.subjectType !== JOURNAL_SUBJECT_TYPE.decision || entry.subjectId === null) {
      return null;
    }
    return this.#decisionRepository.findById(entry.subjectId);
  }

  private async resolveLifeAction(entry: JournalEntry): Promise<LifeAction | null> {
    if (entry.subjectType === JOURNAL_SUBJECT_TYPE.lifeAction && entry.subjectId !== null) {
      return this.#lifeActionRepository.findById(entry.subjectId);
    }
    if (entry.subjectType !== JOURNAL_SUBJECT_TYPE.workSession) return null;
    const value = entry.metadata?.lifeActionId;
    if (typeof value !== 'string') return null;
    return this.#lifeActionRepository.findById(EntityId.create(value));
  }

  private async resolveSourceEntry(entry: JournalEntry): Promise<JournalEntry | null> {
    return entry.correction === null
      ? null
      : this.#journalRepository.findById(entry.correction.sourceEntryId);
  }
}

function resolveCorrectionTarget(
  entry: JournalEntry,
  decision: Decision | null,
  lifeAction: LifeAction | null,
): JournalCorrectionTarget | null {
  if (
    entry.type === JOURNAL_ENTRY_TYPE.decisionCancelled &&
    decision?.status === DECISION_STATUS.cancelled
  ) {
    return target(
      JOURNAL_CORRECTION_FIELD.decisionCancelReason,
      'Причина отмены решения',
      decision.title.toString(),
      decision.cancelReason?.toString() ?? null,
    );
  }
  if (
    entry.type === JOURNAL_ENTRY_TYPE.actionCompleted &&
    lifeAction?.status === LIFE_ACTION_STATUS.completed
  ) {
    return target(
      JOURNAL_CORRECTION_FIELD.lifeActionActualResult,
      'Фактический результат действия',
      lifeAction.title.toString(),
      lifeAction.actualResult?.toString() ?? null,
    );
  }
  if (
    entry.type === JOURNAL_ENTRY_TYPE.actionCancelled &&
    lifeAction?.status === LIFE_ACTION_STATUS.cancelled
  ) {
    return target(
      JOURNAL_CORRECTION_FIELD.lifeActionCancelReason,
      'Причина отмены действия',
      lifeAction.title.toString(),
      lifeAction.cancelReason?.toString() ?? null,
    );
  }
  return null;
}

function target(
  field: JournalCorrectionField,
  fieldLabel: string,
  entityLabel: string,
  currentValue: string | null,
): JournalCorrectionTarget {
  return Object.freeze({ field, fieldLabel, entityLabel, currentValue });
}
