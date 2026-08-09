import {
  ActionSessionCompleted,
  ActionSessionPaused,
  ActionSessionResumed,
  ActionSessionStarted,
  DayCompleted,
  DayDate,
  DayOpened,
  DecisionCancelled,
  DecisionDraftCreated,
  DecisionRescheduled,
  JOURNAL_ENTRY_TYPE,
  JOURNAL_SUBJECT_TYPE,
  JournalEntry,
  LifeActionCancelled,
  LifeActionCompleted,
  LifeActionRescheduled,
  type ActionSession,
  type Day,
  type Decision,
  type DomainEvent,
  type JournalMetadata,
  type LifeAction,
} from '../../domain';

export function createDayJournalEntries(day: Day): readonly JournalEntry[] {
  return day.getUncommittedEvents().flatMap((event) => {
    if (event instanceof DayOpened) {
      return [
        entry(event, JOURNAL_ENTRY_TYPE.dayStarted, JOURNAL_SUBJECT_TYPE.day, {
          subjectId: day.id,
          effectiveDate: event.date,
        }),
      ];
    }

    if (event instanceof DayCompleted) {
      return [
        entry(event, JOURNAL_ENTRY_TYPE.dayCompleted, JOURNAL_SUBJECT_TYPE.day, {
          subjectId: day.id,
          sphereId: event.sphereId,
          effectiveDate: event.date,
          ...(event.summary === null ? {} : { metadata: { summary: event.summary } }),
        }),
      ];
    }

    return [];
  });
}

export function createDecisionJournalEntries(decision: Decision): readonly JournalEntry[] {
  return decision.getUncommittedEvents().flatMap((event) => {
    if (event instanceof DecisionDraftCreated) {
      return [
        entry(event, JOURNAL_ENTRY_TYPE.decisionCreated, JOURNAL_SUBJECT_TYPE.decision, {
          subjectId: decision.id,
          sphereId: decision.sphereId,
          labelAtEvent: decision.title.toString(),
          ...(decision.plannedDate === null
            ? {}
            : { metadata: { plannedDate: decision.plannedDate.toString() } }),
        }),
      ];
    }

    if (event instanceof DecisionRescheduled) {
      return [
        entry(event, JOURNAL_ENTRY_TYPE.decisionRescheduled, JOURNAL_SUBJECT_TYPE.decision, {
          subjectId: decision.id,
          sphereId: decision.sphereId,
          labelAtEvent: decision.title.toString(),
          metadata: {
            previousDate: event.previousDate.toString(),
            newDate: event.newDate.toString(),
            reason: event.reason,
          },
        }),
      ];
    }

    if (event instanceof DecisionCancelled) {
      return [
        entry(event, JOURNAL_ENTRY_TYPE.decisionCancelled, JOURNAL_SUBJECT_TYPE.decision, {
          subjectId: decision.id,
          sphereId: decision.sphereId,
          labelAtEvent: decision.title.toString(),
          ...(event.reason === null ? {} : { metadata: { reason: event.reason.toString() } }),
        }),
      ];
    }

    return [];
  });
}

export function createLifeActionJournalEntries(lifeAction: LifeAction): readonly JournalEntry[] {
  return lifeAction.getUncommittedEvents().flatMap((event) => {
    const common = {
      subjectId: lifeAction.id,
      sphereId: lifeAction.sphereId,
      labelAtEvent: lifeAction.title.toString(),
    };

    if (event instanceof LifeActionRescheduled) {
      return [
        entry(event, JOURNAL_ENTRY_TYPE.actionRescheduled, JOURNAL_SUBJECT_TYPE.lifeAction, {
          ...common,
          metadata: {
            previousDate: event.previousDate.toString(),
            newDate: event.newDate.toString(),
          },
        }),
      ];
    }

    if (event instanceof LifeActionCompleted) {
      return [
        entry(event, JOURNAL_ENTRY_TYPE.actionCompleted, JOURNAL_SUBJECT_TYPE.lifeAction, {
          ...common,
          metadata: { actualResult: event.actualResult.toString() },
        }),
      ];
    }

    if (event instanceof LifeActionCancelled) {
      return [
        entry(event, JOURNAL_ENTRY_TYPE.actionCancelled, JOURNAL_SUBJECT_TYPE.lifeAction, {
          ...common,
          metadata: { reason: event.reason.toString() },
        }),
      ];
    }

    return [];
  });
}

export function createWorkSessionJournalEntries(
  workSession: ActionSession,
  lifeAction: LifeAction | null,
): readonly JournalEntry[] {
  return workSession.getUncommittedEvents().flatMap((event) => {
    const common = {
      subjectId: workSession.id,
      sphereId: lifeAction?.sphereId ?? null,
      labelAtEvent: lifeAction?.title.toString() ?? null,
      metadata: {
        lifeActionId: workSession.lifeActionId.toString(),
      } satisfies JournalMetadata,
    };

    if (event instanceof ActionSessionStarted) {
      return [
        entry(
          event,
          JOURNAL_ENTRY_TYPE.workSessionStarted,
          JOURNAL_SUBJECT_TYPE.workSession,
          common,
        ),
      ];
    }

    if (event instanceof ActionSessionPaused) {
      return [
        entry(
          event,
          JOURNAL_ENTRY_TYPE.workSessionPaused,
          JOURNAL_SUBJECT_TYPE.workSession,
          common,
        ),
      ];
    }

    if (event instanceof ActionSessionResumed) {
      return [
        entry(event, JOURNAL_ENTRY_TYPE.workSessionResumed, JOURNAL_SUBJECT_TYPE.workSession, {
          ...common,
          metadata: {
            ...common.metadata,
            pausedAt: event.pausedAt.toISOString(),
          },
        }),
      ];
    }

    if (event instanceof ActionSessionCompleted) {
      return [
        entry(event, JOURNAL_ENTRY_TYPE.workSessionCompleted, JOURNAL_SUBJECT_TYPE.workSession, {
          ...common,
          metadata: {
            ...common.metadata,
            completionKind: event.completionKind,
            workedDurationMilliseconds: event.workedDurationMilliseconds,
            pausedDurationMilliseconds: event.pausedDurationMilliseconds,
            resultNote: event.resultNote?.toString() ?? null,
          },
        }),
      ];
    }

    return [];
  });
}

interface EntryOptions {
  readonly subjectId?: JournalEntry['subjectId'];
  readonly sphereId?: JournalEntry['sphereId'];
  readonly labelAtEvent?: string | null;
  readonly metadata?: JournalMetadata;
  readonly effectiveDate?: DayDate;
}

function entry(
  event: DomainEvent,
  type: JournalEntry['type'],
  subjectType: JournalEntry['subjectType'],
  options: EntryOptions,
): JournalEntry {
  return JournalEntry.create({
    id: event.eventId,
    type,
    occurredAt: event.occurredAt,
    effectiveDate: options.effectiveDate ?? effectiveDateFrom(event.occurredAt),
    subjectType,
    ...(options.subjectId === undefined ? {} : { subjectId: options.subjectId }),
    ...(options.sphereId === undefined ? {} : { sphereId: options.sphereId }),
    ...(options.labelAtEvent === undefined ? {} : { labelAtEvent: options.labelAtEvent }),
    ...(options.metadata === undefined ? {} : { metadata: options.metadata }),
    createdAt: event.occurredAt,
  });
}

function effectiveDateFrom(value: Date): DayDate {
  return DayDate.fromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
}
