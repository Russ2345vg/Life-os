import { ActionCancelReason, DayDate, EntityId, LifeAction, LifeActionTitle } from '../../domain';
import {
  occurrenceSlots,
  validateRule,
  type RecurrenceRule,
} from '../../domain/planner/RecurrenceRule';
import { addDays } from '../../domain/planner/PlanningPeriod';
import type { PlanningRepository, PlanningState } from '../ports/PlanningRepository';
import type { Clock } from '../ports/Clock';
import type { IdGenerator } from '../ports/IdGenerator';
import { DomainError } from '../../shared/errors/DomainError';
import { put, requireAction, planningJournal, localDate } from './planningSupport';
export type RecurrenceInput = Omit<
  RecurrenceRule,
  'id' | 'version' | 'schemaVersion' | 'updatedAt' | 'revision' | 'effectiveFrom'
>;
export class RecurringActions {
  constructor(
    readonly repository: PlanningRepository,
    readonly clock: Clock,
    readonly ids: IdGenerator,
  ) {}
  async save(input: RecurrenceInput, id?: string, actionId?: string) {
    return this.repository.change((s) => {
      const now = this.clock.now(),
        date = localDate(now),
        ruleId = id ?? (actionId ? `recurrence:${actionId}` : this.ids.generate().toString());
      const previous = s.rules.find((r) => r.id === ruleId);
      if (input.goalId && !s.goals.some((g) => g.id.toString() === input.goalId))
        throw new DomainError('goal.not_found', 'Цель не найдена.');
      const rule = validateRule({
        ...input,
        id: ruleId,
        revision: (previous?.revision ?? 0) + 1,
        effectiveFrom: date,
        version: (previous?.version ?? 0) + 1,
        schemaVersion: 1,
        updatedAt: now.toISOString(),
      });
      put(s.rules, rule);
      if (actionId) {
        const a = requireAction(s, actionId);
        if (a.occurrence && a.occurrence.ruleId !== ruleId)
          throw new DomainError(
            'recurrence.already_linked',
            'Действие уже связано с другим правилом.',
          );
        const originalDate = a.plannedDate?.toString() ?? input.startDate;
        a.setPlanningMetadata({
          priority: input.priority,
          occurrence: {
            ruleId,
            slot: input.schedule.kind === 'interval' ? 'first' : originalDate,
            ruleRevision: rule.revision,
            originalDate,
          },
        });
      }
      if (previous) this.reconcileFuture(s, rule, date);
      return rule;
    });
  }
  async pause(id: string, pauseUntil: string | null = null) {
    return this.repository.change((s) => {
      const rule = this.requireRule(s, id);
      const next = validateRule({
        ...rule,
        paused: true,
        pauseUntil,
        version: rule.version + 1,
        updatedAt: this.clock.now().toISOString(),
      });
      put(s.rules, next);
      this.reconcileFuture(s, next, localDate(this.clock.now()));
    });
  }
  async resume(id: string) {
    return this.repository.change((s) => {
      const rule = this.requireRule(s, id);
      put(s.rules, {
        ...rule,
        paused: false,
        pauseUntil: null,
        effectiveFrom: localDate(this.clock.now()),
        version: rule.version + 1,
        updatedAt: this.clock.now().toISOString(),
      });
    });
  }
  async materialize(from: string, to = addDays(from, 13)) {
    return this.repository.change((s) => {
      let created = 0;
      const now = this.clock.now();
      for (const rule of s.rules) {
        this.reconcileFuture(s, rule, from);
        const completions = this.completions(s, rule.id);
        let capacity =
          rule.maxCompletions === null
            ? Infinity
            : rule.maxCompletions -
              completions.length -
              s.actions.filter(
                (a) =>
                  a.occurrence?.ruleId === rule.id &&
                  !a.isArchived() &&
                  a.status !== 'completed' &&
                  a.status !== 'cancelled',
              ).length;
        const existing = new Set(
          s.actions.filter((a) => a.occurrence?.ruleId === rule.id).map((a) => a.occurrence!.slot),
        );
        for (const slot of occurrenceSlots(rule, from, to, completions)) {
          if (existing.has(slot.slot) || capacity <= 0) continue;
          if (s.actions.some((a) => a.id.toString() === slot.id))
            throw new DomainError(
              'recurrence.identity_collision',
              'Идентификатор повторения уже занят.',
            );
          const action = LifeAction.createDraft({
            id: EntityId.create(slot.id),
            title: LifeActionTitle.create(rule.title),
            goalId: rule.goalId ? EntityId.create(rule.goalId) : null,
            plannedDate: DayDate.create(slot.date),
            createdAt: now,
            eventId: EntityId.create(`create:${slot.id}`),
          });
          action.setPlanningMetadata({
            priority: rule.priority,
            occurrence: {
              ruleId: rule.id,
              slot: slot.slot,
              ruleRevision: rule.revision,
              originalDate: slot.date,
            },
          });
          s.actions.push(action);
          existing.add(slot.slot);
          created++;
          capacity--;
        }
      }
      return created;
    });
  }
  async skip(actionId: string) {
    return this.repository.change((s) => {
      const action = requireAction(s, actionId);
      if (!action.occurrence)
        throw new DomainError('recurrence.not_occurrence', 'Это обычное действие.');
      if (action.status === 'cancelled') return;
      const now = this.clock.now();
      action.cancel(
        now,
        EntityId.create(`skip:${actionId}`),
        ActionCancelReason.create('Повторение пропущено'),
      );
      s.journal.push(
        planningJournal(`skip:${actionId}`, 'LifeAction', actionId, 'Повторение пропущено', now, {
          ruleId: action.occurrence.ruleId,
          slot: action.occurrence.slot,
        }),
      );
    });
  }
  private completions(s: PlanningState, id: string) {
    return s.actions
      .filter((a) => a.occurrence?.ruleId === id && a.status === 'completed' && a.completedAt)
      .map((a) => ({
        key: a.completionKey,
        date: a.completedOn ?? a.completedAt!.toISOString().slice(0, 10),
      }));
  }
  private requireRule(s: PlanningState, id: string) {
    const r = s.rules.find((r) => r.id === id);
    if (!r) throw new DomainError('recurrence.not_found', 'Правило не найдено.');
    return r;
  }
  private reconcileFuture(s: PlanningState, rule: RecurrenceRule, date: string) {
    const occurrenceDate = (action: LifeAction) =>
      rule.schedule.kind === 'interval' && !action.occurrence!.manualDate
        ? (action.plannedDate?.toString() ?? action.occurrence!.originalDate)
        : action.occurrence!.originalDate;
    const completions = this.completions(s, rule.id),
      plannedSlots = occurrenceSlots(rule, date, addDays(date, 62), completions),
      slotByKey = new Map(plannedSlots.map((slot) => [slot.slot, slot])),
      slots = new Set(
        occurrenceSlots(rule, date, addDays(date, 62), completions).map((slot) => slot.slot),
      );
    const actions = s.actions
      .filter(
        (a) => a.occurrence?.ruleId === rule.id && !a.isArchived() && a.status !== 'completed',
      )
      .sort(
        (a, b) =>
          occurrenceDate(a).localeCompare(occurrenceDate(b)) ||
          a.id.toString().localeCompare(b.id.toString()),
      );
    let capacity =
      rule.maxCompletions === null
        ? Infinity
        : Math.max(0, rule.maxCompletions - completions.length);
    for (const action of actions) {
      const dateOfAction = occurrenceDate(action);
      const sourceValid =
        rule.schedule.kind !== 'interval' ||
        action.occurrence!.slot === 'first' ||
        completions.some((c) => `after:${c.key}` === action.occurrence!.slot);
      const paused =
        dateOfAction >= date &&
        rule.paused &&
        (rule.pauseUntil === null || dateOfAction < rule.pauseUntil);
      const forward = dateOfAction >= date;
      const valid =
        sourceValid &&
        !paused &&
        (forward
          ? dateOfAction > addDays(date, 62)
            ? occurrenceSlots(rule, dateOfAction, dateOfAction, completions).some(
                (slot) => slot.slot === action.occurrence!.slot,
              )
            : slots.has(action.occurrence!.slot)
          : true) &&
        capacity > 0;
      if (
        valid &&
        action.status === 'cancelled' &&
        action.cancelReason?.toString() === 'Расписание временно недоступно'
      )
        action.restoreScheduledOccurrence();
      if (valid && forward && action.occurrence!.ruleRevision !== rule.revision) {
        const slot = slotByKey.get(action.occurrence!.slot);
        if (slot)
          action.reviseRecurrence(
            LifeActionTitle.create(rule.title),
            rule.goalId ? EntityId.create(rule.goalId) : null,
            rule.priority,
            DayDate.create(slot.date),
            rule.revision,
          );
      }
      if (valid && action.status !== 'cancelled') {
        capacity--;
        continue;
      }
      if (!valid && action.status !== 'cancelled') {
        const now = this.clock.now();
        action.cancel(
          now,
          this.ids.generate(),
          ActionCancelReason.create('Расписание временно недоступно'),
        );
        s.journal.push(
          planningJournal(
            this.ids.generate().toString(),
            'LifeAction',
            action.id.toString(),
            'Повторение исключено из текущего расписания',
            now,
            { ruleId: rule.id, slot: action.occurrence!.slot },
          ),
        );
      }
    }
  }
}
