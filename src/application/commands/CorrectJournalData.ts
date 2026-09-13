import {
  ActionActualResult,
  ActionCancelReason,
  DayDate,
  Decision,
  DecisionCancelReason,
  JOURNAL_CORRECTION_FIELD,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
  LifeAction,
  type EntityId,
  type JournalCorrectionField,
} from '../../domain';
import { DomainError } from '../../shared/errors/DomainError';
import { failure, success, type Result } from '../../shared/result/Result';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { JournalRepository } from '../ports/JournalRepository';
import type { JournalUnitOfWork } from '../ports/JournalUnitOfWork';
import type { LifeActionRepository } from '../ports/LifeActionRepository';

export interface CorrectJournalDataInput {
  readonly commandId: EntityId;
  readonly sourceEntryId: EntityId;
  readonly newValue: string;
  readonly reason: string;
}

export class CorrectJournalData {
  readonly #journalRepository: JournalRepository;
  readonly #decisionRepository: DecisionRepository;
  readonly #lifeActionRepository: LifeActionRepository;
  readonly #journalUnitOfWork: JournalUnitOfWork;
  readonly #clock: Clock;

  public constructor(
    journalRepository: JournalRepository,
    decisionRepository: DecisionRepository,
    lifeActionRepository: LifeActionRepository,
    journalUnitOfWork: JournalUnitOfWork,
    clock: Clock,
  ) {
    this.#journalRepository = journalRepository;
    this.#decisionRepository = decisionRepository;
    this.#lifeActionRepository = lifeActionRepository;
    this.#journalUnitOfWork = journalUnitOfWork;
    this.#clock = clock;
  }

  public async execute(input: CorrectJournalDataInput): Promise<Result<JournalEntry, DomainError>> {
    const reason = input.reason.trim();
    if (reason.length === 0) {
      return failure(
        new DomainError('journal.correction_reason_required', 'Укажите причину исправления.'),
      );
    }
    if (reason.length > 2_000) {
      return failure(
        new DomainError(
          'journal.correction_reason_too_long',
          'Причина исправления не может быть длиннее 2000 символов.',
        ),
      );
    }

    const existing = await this.#journalRepository.findById(input.commandId);
    if (existing !== null) return this.resolveExisting(existing, input, reason);

    const source = await this.#journalRepository.findById(input.sourceEntryId);
    if (source === null) {
      return failure(
        new DomainError('journal.source_not_found', 'Исходное событие больше недоступно.'),
      );
    }

    try {
      const correction = await this.createCorrection(source, input, reason);
      await this.#journalUnitOfWork.commit(correction.commitInput);
      return success(correction.entry);
    } catch (error: unknown) {
      const savedByConcurrentCommand = await this.#journalRepository.findById(input.commandId);
      if (savedByConcurrentCommand !== null) {
        return this.resolveExisting(savedByConcurrentCommand, input, reason);
      }
      return failure(
        error instanceof DomainError
          ? error
          : new DomainError(
              'journal.correction_failed',
              'Исправление не сохранено. Исходные данные не изменились.',
              { cause: error },
            ),
      );
    }
  }

  private async createCorrection(
    source: JournalEntry,
    input: CorrectJournalDataInput,
    reason: string,
  ): Promise<CorrectionCommit> {
    if (source.type === JOURNAL_ENTRY_TYPE.decisionCancelled) {
      return this.correctDecisionCancellation(source, input, reason);
    }
    if (source.type === JOURNAL_ENTRY_TYPE.actionCompleted) {
      return this.correctLifeActionActualResult(source, input, reason);
    }
    if (source.type === JOURNAL_ENTRY_TYPE.actionCancelled) {
      return this.correctLifeActionCancellation(source, input, reason);
    }
    throw new DomainError(
      'journal.correction_not_allowed',
      'Это событие нельзя безопасно связать с исправляемыми данными.',
    );
  }

  private async correctDecisionCancellation(
    source: JournalEntry,
    input: CorrectJournalDataInput,
    reason: string,
  ): Promise<CorrectionCommit> {
    const subjectId = requireSubject(source, JOURNAL_SUBJECT_TYPE.decision);
    const stored = await this.#decisionRepository.findById(subjectId);
    if (stored === null) throw relatedEntityNotFound();
    const previousValue = stored.cancelReason?.toString() ?? null;
    const newReason = DecisionCancelReason.create(input.newValue);
    const normalizedValue = newReason.toString();
    assertChanged(previousValue, normalizedValue);

    const decision = cloneDecision(stored);
    decision.correctCancellationReason(newReason);
    const entry = await this.createEntry(
      source,
      input.commandId,
      JOURNAL_CORRECTION_FIELD.decisionCancelReason,
      previousValue,
      normalizedValue,
      reason,
      decision.title.toString(),
      decision.sphereId,
    );
    return {
      entry,
      commitInput: {
        decisions: [{ decision, expectedVersion: stored.version }],
        journalEntries: [entry],
      },
    };
  }

  private async correctLifeActionActualResult(
    source: JournalEntry,
    input: CorrectJournalDataInput,
    reason: string,
  ): Promise<CorrectionCommit> {
    const subjectId = requireSubject(source, JOURNAL_SUBJECT_TYPE.lifeAction);
    const stored = await this.#lifeActionRepository.findById(subjectId);
    if (stored === null) throw relatedEntityNotFound();
    const previousValue = stored.actualResult?.toString() ?? null;
    const newResult = ActionActualResult.create(input.newValue);
    const normalizedValue = newResult.toString();
    assertChanged(previousValue, normalizedValue);

    const lifeAction = cloneLifeAction(stored);
    lifeAction.correctActualResult(newResult);
    const entry = await this.createEntry(
      source,
      input.commandId,
      JOURNAL_CORRECTION_FIELD.lifeActionActualResult,
      previousValue,
      normalizedValue,
      reason,
      lifeAction.title.toString(),
      lifeAction.sphereId,
    );
    return {
      entry,
      commitInput: {
        lifeActions: [{ lifeAction, expectedVersion: stored.version }],
        journalEntries: [entry],
      },
    };
  }

  private async correctLifeActionCancellation(
    source: JournalEntry,
    input: CorrectJournalDataInput,
    reason: string,
  ): Promise<CorrectionCommit> {
    const subjectId = requireSubject(source, JOURNAL_SUBJECT_TYPE.lifeAction);
    const stored = await this.#lifeActionRepository.findById(subjectId);
    if (stored === null) throw relatedEntityNotFound();
    const previousValue = stored.cancelReason?.toString() ?? null;
    const newReason = ActionCancelReason.create(input.newValue);
    const normalizedValue = newReason.toString();
    assertChanged(previousValue, normalizedValue);

    const lifeAction = cloneLifeAction(stored);
    lifeAction.correctCancellationReason(newReason);
    const entry = await this.createEntry(
      source,
      input.commandId,
      JOURNAL_CORRECTION_FIELD.lifeActionCancelReason,
      previousValue,
      normalizedValue,
      reason,
      lifeAction.title.toString(),
      lifeAction.sphereId,
    );
    return {
      entry,
      commitInput: {
        lifeActions: [{ lifeAction, expectedVersion: stored.version }],
        journalEntries: [entry],
      },
    };
  }

  private async createEntry(
    source: JournalEntry,
    commandId: EntityId,
    field: JournalCorrectionField,
    previousValue: string | null,
    newValue: string,
    reason: string,
    labelAtEvent: string,
    sphereId: EntityId | null,
  ): Promise<JournalEntry> {
    const priorCorrections = await this.#journalRepository.findCorrectionsBySourceEntryId(
      source.id,
    );
    const previousCorrectionId = priorCorrections.at(-1)?.id ?? null;
    const occurredAt = this.#clock.now();
    return JournalEntry.create({
      id: commandId,
      type: JOURNAL_ENTRY_TYPE.dataCorrected,
      occurredAt,
      effectiveDate: DayDate.fromParts(
        occurredAt.getFullYear(),
        occurredAt.getMonth() + 1,
        occurredAt.getDate(),
      ),
      subjectType: source.subjectType,
      subjectId: source.subjectId,
      sphereId,
      labelAtEvent,
      correction: {
        sourceEntryId: source.id,
        previousCorrectionId,
        field,
        previousValue,
        newValue,
        reason,
        commandId,
      },
      createdAt: occurredAt,
    });
  }

  private resolveExisting(
    existing: JournalEntry,
    input: CorrectJournalDataInput,
    reason: string,
  ): Result<JournalEntry, DomainError> {
    const correction = existing.correction;
    if (
      existing.type === JOURNAL_ENTRY_TYPE.dataCorrected &&
      correction !== null &&
      correction.sourceEntryId.equals(input.sourceEntryId) &&
      correction.newValue === input.newValue.trim() &&
      correction.reason === reason
    ) {
      return success(existing);
    }
    return failure(
      new DomainError(
        'journal.correction_command_conflict',
        'Эта команда уже использована для другого исправления.',
      ),
    );
  }
}

interface CorrectionCommit {
  readonly entry: JournalEntry;
  readonly commitInput: Parameters<JournalUnitOfWork['commit']>[0];
}

function requireSubject(source: JournalEntry, expectedType: JournalEntry['subjectType']): EntityId {
  if (source.subjectType !== expectedType || source.subjectId === null) {
    throw new DomainError(
      'journal.correction_subject_invalid',
      'Событие нельзя безопасно связать с актуальными данными.',
    );
  }
  return source.subjectId;
}

function assertChanged(previousValue: string | null, newValue: string): void {
  if (previousValue === newValue) {
    throw new DomainError(
      'journal.correction_unchanged',
      'Новое значение должно отличаться от прежнего.',
    );
  }
}

function relatedEntityNotFound(): DomainError {
  return new DomainError(
    'journal.correction_entity_not_found',
    'Связанная сущность больше недоступна. Историческая запись сохранена без изменений.',
  );
}

function cloneDecision(decision: Decision): Decision {
  return Decision.rehydrate({
    id: decision.id,
    title: decision.title,
    reason: decision.reason,
    sphereId: decision.sphereId,
    price: decision.price,
    sacrifices: decision.sacrifices,
    priority: decision.priority,
    projectReference: decision.projectReference,
    projectId: decision.projectId,
    expectedResult: decision.expectedResult,
    actualResultSummary: decision.actualResultSummary,
    status: decision.status,
    kind: decision.kind,
    plannedDate: decision.plannedDate,
    order: decision.order,
    createdAt: decision.createdAt,
    plannedAt: decision.plannedAt,
    startedAt: decision.startedAt,
    confirmedAt: decision.confirmedAt,
    cancelledAt: decision.cancelledAt,
    cancelReason: decision.cancelReason,
    archivedAt: decision.archivedAt,
    deletedAt: decision.deletedAt,
    lastDeletedAt: decision.lastDeletedAt,
    restoredFromTrashAt: decision.restoredFromTrashAt,
    evidenceIds: decision.evidenceIds,
    rescheduleCount: decision.rescheduleCount,
    rescheduleHistory: decision.rescheduleHistory,
    version: decision.version,
  });
}

function cloneLifeAction(lifeAction: LifeAction): LifeAction {
  return LifeAction.rehydrate({
    id: lifeAction.id,
    title: lifeAction.title,
    description: lifeAction.description,
    expectedResult: lifeAction.expectedResult,
    actualResult: lifeAction.actualResult,
    status: lifeAction.status,
    decisionId: lifeAction.decisionId,
    sphereId: lifeAction.sphereId,
    goalId: lifeAction.goalId,
    isNext: lifeAction.isNext,
    plannedDate: lifeAction.plannedDate,
    createdAt: lifeAction.createdAt,
    readyAt: lifeAction.readyAt,
    startedAt: lifeAction.startedAt,
    completedAt: lifeAction.completedAt,
    cancelledAt: lifeAction.cancelledAt,
    cancelReason: lifeAction.cancelReason,
    archivedAt: lifeAction.archivedAt,
    rescheduleCount: lifeAction.rescheduleCount,
    version: lifeAction.version,
  });
}
