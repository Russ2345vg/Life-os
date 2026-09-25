import { ActionCancelReason, DayDate, EntityId, LifeAction, LifeActionTitle } from '../../domain';
import {
  occurrenceSlots,
  validateRule,
  type RecurrenceRule,
} from '../../domain/planner/RecurrenceRule';
import { addDays } from '../../domain/planner/PlanningPeriod';
import type { PlanningRepository, PlanningState } from '../ports/PlanningRepository';
import type { Clock } from '../ports/Clock';
import type { CurrentDateProvider } from '../ports/CurrentDateProvider';
import type { IdGenerator } from '../ports/IdGenerator';
import { DomainError } from '../../shared/errors/DomainError';
import { put, requireAction, planningJournal, localDate } from './planningSupport';
export type RecurrenceInput = Omit<
  RecurrenceRule,
  | 'id'
  | 'version'
  | 'schemaVersion'
  | 'updatedAt'
  | 'revision'
  | 'effectiveFrom'
  | 'removedAt'
  | 'lastRemovedAt'
  | 'restoredFromTrashAt'
  | 'purgedAt'
  | 'restorationGeneration'
>;
export class RecurringActions {
  constructor(
    readonly repository: PlanningRepository,
    readonly clock: Clock,
    readonly ids: IdGenerator,
    readonly currentDate?: CurrentDateProvider,
  ) {}
  async save(input: RecurrenceInput, id?: string, actionId?: string) {
    return this.repository.change((s) => {
      const now = this.clock.now(),
        date = localDate(now),
        ruleId = id ?? (actionId ? `recurrence:${actionId}` : this.ids.generate().toString());
      const previous = s.rules.find((r) => r.id === ruleId);
      if (previous?.purgedAt != null)
        throw new DomainError('trash.expired', 'Серия удалена навсегда.');
      if (previous?.removedAt != null)
        throw new DomainError('recurrence.removed', 'Удалённую серию нельзя изменить.');
      if (input.goalId && !s.goals.some((g) => g.id.toString() === input.goalId))
        throw new DomainError('goal.not_found', 'Цель не найдена.');
      const rule = validateRule({
        ...input,
        directionId:
          input.directionId ??
          previous?.directionId ??
          (actionId ? requireAction(s, actionId).directionId?.toString() : null) ??
          null,
        sphereId:
          input.sphereId ??
          previous?.sphereId ??
          (actionId ? requireAction(s, actionId).sphereId?.toString() : null) ??
          null,
        id: ruleId,
        removedAt: previous?.removedAt ?? null,
        lastRemovedAt: previous?.lastRemovedAt ?? null,
        restoredFromTrashAt: previous?.restoredFromTrashAt ?? null,
        purgedAt: previous?.purgedAt ?? null,
        restorationGeneration: previous?.restorationGeneration ?? 0,
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
            slot:
              input.schedule.kind === 'interval' || input.schedule.kind === 'count'
                ? 'first'
                : originalDate,
            ruleRevision: rule.revision,
            restorationGeneration: rule.restorationGeneration ?? 0,
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
      const rule = this.requireActiveRule(s, id);
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
      const rule = this.requireActiveRule(s, id);
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
  async materialize(from: string, to = addDays(from, 13), onlyRuleId?: string) {
    return this.repository.change((s) => {
      let created = 0;
      const now = this.clock.now();
      for (const rule of s.rules.filter(
        (r) => r.removedAt == null && r.purgedAt == null && (!onlyRuleId || r.id === onlyRuleId),
      )) {
        const windowFrom = rule.schedule.kind === 'count' ? localDate(now) : from;
        const windowTo = rule.schedule.kind === 'count' ? addDays(windowFrom, 62) : to;
        this.reconcileFuture(s, rule, windowFrom);
        const completions = this.completions(s, rule.id);
        if (
          rule.schedule.kind === 'count' &&
          s.actions.some(
            (a) =>
              this.isCurrentOccurrence(a, rule) &&
              !a.isArchived() &&
              a.status !== 'completed' &&
              a.status !== 'cancelled',
          )
        )
          continue;
        let capacity =
          rule.maxCompletions === null
            ? Infinity
            : rule.maxCompletions -
              completions.length -
              s.actions.filter(
                (a) =>
                  this.isCurrentOccurrence(a, rule) &&
                  !a.isArchived() &&
                  a.status !== 'completed' &&
                  a.status !== 'cancelled',
              ).length;
        const existing = new Set(
          s.actions.filter((a) => this.isCurrentOccurrence(a, rule)).map((a) => a.occurrence!.slot),
        );
        for (const slot of occurrenceSlots(rule, windowFrom, windowTo, completions)) {
          if (existing.has(slot.slot) || capacity <= 0) continue;
          if (s.actions.some((a) => a.id.toString() === slot.id))
            throw new DomainError(
              'recurrence.identity_collision',
              'Идентификатор повторения уже занят.',
            );
          const action = LifeAction.createDraft({
            id: EntityId.create(slot.id),
            title: LifeActionTitle.create(rule.title),
            directionId: rule.directionId ? EntityId.create(rule.directionId) : null,
            sphereId: rule.sphereId ? EntityId.create(rule.sphereId) : null,
            goalId: rule.goalId ? EntityId.create(rule.goalId) : null,
            plannedDate: rule.schedule.kind === 'count' ? null : DayDate.create(slot.date),
            createdAt: now,
            eventId: EntityId.create(`create:${slot.id}`),
          });
          action.setPlanningMetadata({
            priority: rule.priority,
            occurrence: {
              ruleId: rule.id,
              slot: slot.slot,
              ruleRevision: rule.revision,
              restorationGeneration: rule.restorationGeneration ?? 0,
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
  async resolveForDate(ruleId: string, date: string): Promise<LifeAction | null> {
    DayDate.create(date);
    const initial = await this.repository.read();
    if (!initial.rules.some((r) => r.id === ruleId && r.removedAt == null && r.purgedAt == null))
      return null;
    if (date >= localDate(this.clock.now())) await this.materialize(date, date, ruleId);
    return this.findOnDate(await this.repository.read(), ruleId, date);
  }
  async selectForDate(ruleId: string, date: string): Promise<LifeAction | null> {
    const existing = await this.resolveForDate(ruleId, date);
    if (existing || date < localDate(this.clock.now())) return existing;
    return this.repository.change((s) => {
      const rule = s.rules.find((r) => r.id === ruleId);
      const dated = this.findOnDate(s, ruleId, date);
      if (
        dated ||
        !rule ||
        rule.removedAt != null ||
        rule.purgedAt != null ||
        rule.schedule.kind !== 'count'
      )
        return dated;
      const action = s.actions.find(
        (a) =>
          this.isCurrentOccurrence(a, rule) &&
          !a.isArchived() &&
          !a.plannedDate &&
          !['completed', 'cancelled'].includes(a.status),
      );
      if (!action) return null;
      action.setPlan(DayDate.create(date), false);
      s.journal.push(
        planningJournal(
          this.ids.generate().toString(),
          'LifeAction',
          action.id.toString(),
          'Повторение назначено на дату',
          this.clock.now(),
          { ruleId, date },
        ),
      );
      return action;
    });
  }
  private findOnDate(s: PlanningState, ruleId: string, date: string): LifeAction | null {
    const rule = s.rules.find((r) => r.id === ruleId);
    return (
      s.actions.find(
        (a) =>
          a.occurrence?.ruleId === ruleId &&
          !a.isArchived() &&
          a.status !== 'cancelled' &&
          (a.plannedDate?.toString() === date ||
            (rule?.schedule.kind === 'count' &&
              a.status === 'completed' &&
              !a.plannedDate &&
              a.completedOn === date)),
      ) ?? null
    );
  }
  async skip(actionId: string) {
    return this.repository.change((s) => {
      const action = requireAction(s, actionId);
      if (!action.occurrence)
        throw new DomainError('recurrence.not_occurrence', 'Это обычное действие.');
      if (this.requireActiveRule(s, action.occurrence.ruleId).schedule.kind === 'count')
        throw new DomainError(
          'recurrence.count_skip_unsupported',
          'Повторение без расписания нельзя пропустить. Его можно приостановить.',
        );
      if (action.status === 'cancelled') return;
      const now = this.clock.now();
      action.cancel(
        now,
        EntityId.create(`skip:${actionId}`),
        ActionCancelReason.create('Повторение пропущено'),
      );
      action.archive(now, EntityId.create(`archive:skip:${actionId}`));
      s.journal.push(
        planningJournal(`skip:${actionId}`, 'LifeAction', actionId, 'Повторение пропущено', now, {
          ruleId: action.occurrence.ruleId,
          slot: action.occurrence.slot,
        }),
      );
    });
  }
  async remove(id: string) {
    return this.repository.change((s) => {
      const rule = this.requireRule(s, id);
      if (rule.purgedAt != null) throw new DomainError('trash.expired', 'Серия удалена навсегда.');
      if (rule.removedAt != null) return;
      const now = this.clock.now();
      const removedAt = now.toISOString();
      put(
        s.rules,
        validateRule({
          ...rule,
          paused: true,
          pauseUntil: null,
          removedAt,
          lastRemovedAt: removedAt,
          restoredFromTrashAt: null,
          revision: rule.revision + 1,
          version: rule.version + 1,
          updatedAt: removedAt,
        }),
      );
      let cancelledOccurrences = 0;
      for (const action of s.actions.filter(
        (candidate) =>
          candidate.occurrence?.ruleId === id &&
          !candidate.isArchived() &&
          candidate.status !== 'completed',
      )) {
        if (action.status !== 'cancelled') {
          action.cancel(now, this.ids.generate(), ActionCancelReason.create('Серия удалена'));
          cancelledOccurrences += 1;
        }
        action.archive(now, this.ids.generate());
      }
      for (const membership of s.memberships.filter(
        (candidate) =>
          candidate.entityType === 'rule' && candidate.entityId === id && !candidate.removed,
      ))
        put(s.memberships, {
          ...membership,
          removed: true,
          focused: false,
          version: membership.version + 1,
          updatedAt: removedAt,
        });
      s.journal.push(
        planningJournal(
          this.ids.generate().toString(),
          'RecurrenceRule',
          id,
          'Серия повторений удалена',
          now,
          { cancelledOccurrences },
        ),
      );
    });
  }
  async restore(id: string): Promise<void> {
    return this.repository.change((s) => {
      const rule = this.requireRule(s, id);
      if (rule.purgedAt != null) throw new DomainError('trash.expired', 'Серия удалена навсегда.');
      if (rule.removedAt == null)
        throw new DomainError(
          'recurrence.not_removed',
          'Восстановить можно только серию из корзины.',
        );
      const now = this.clock.now();
      const restoredAt = now.toISOString();
      put(
        s.rules,
        validateRule({
          ...rule,
          removedAt: null,
          lastRemovedAt: rule.removedAt,
          restoredFromTrashAt: restoredAt,
          restorationGeneration: (rule.restorationGeneration ?? 0) + 1,
          revision: rule.revision + 1,
          version: rule.version + 1,
          updatedAt: restoredAt,
          effectiveFrom: this.currentDate?.getCurrentDate().toString() ?? localDate(now),
          paused: false,
          pauseUntil: null,
        }),
      );
      s.journal.push(
        planningJournal(
          this.ids.generate().toString(),
          'RecurrenceRule',
          id,
          'Серия повторений восстановлена',
          now,
        ),
      );
    });
  }
  private isCurrentOccurrence(action: LifeAction, rule: RecurrenceRule): boolean {
    return (
      action.occurrence?.ruleId === rule.id &&
      (action.occurrence.restorationGeneration ?? 0) === (rule.restorationGeneration ?? 0)
    );
  }
  private completions(s: PlanningState, id: string) {
    return s.actions
      .filter((a) => a.occurrence?.ruleId === id && a.status === 'completed' && a.completedAt)
      .map((a) => ({
        key: a.completionKey,
        date: a.completedOn ?? a.completedAt!.toISOString().slice(0, 10),
        at: a.completedAt!.toISOString(),
      }));
  }
  private requireRule(s: PlanningState, id: string) {
    const r = s.rules.find((r) => r.id === id);
    if (!r) throw new DomainError('recurrence.not_found', 'Правило не найдено.');
    return r;
  }
  private requireActiveRule(s: PlanningState, id: string) {
    const rule = this.requireRule(s, id);
    if (rule.purgedAt != null) throw new DomainError('trash.expired', 'Серия удалена навсегда.');
    if (rule.removedAt != null) throw new DomainError('recurrence.removed', 'Серия уже удалена.');
    return rule;
  }
  private reconcileFuture(s: PlanningState, rule: RecurrenceRule, date: string) {
    if (rule.schedule.kind === 'count') {
      this.reconcileCount(s, rule, date);
      return;
    }
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
        (a) => this.isCurrentOccurrence(a, rule) && !a.isArchived() && a.status !== 'completed',
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

  private reconcileCount(s: PlanningState, rule: RecurrenceRule, date: string) {
    const desired = occurrenceSlots(rule, date, addDays(date, 62), this.completions(s, rule.id))[0]
      ?.slot;
    const open = s.actions
      .filter(
        (a) =>
          this.isCurrentOccurrence(a, rule) &&
          !a.isArchived() &&
          a.status !== 'completed' &&
          a.status !== 'cancelled',
      )
      .sort(
        (a, b) =>
          a.createdAt.getTime() - b.createdAt.getTime() ||
          a.id.toString().localeCompare(b.id.toString()),
      );
    for (const action of open.slice(desired ? 1 : 0)) {
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
    if (!desired || open.length) return;
    const cancelled = s.actions.find(
      (a) =>
        this.isCurrentOccurrence(a, rule) &&
        !a.isArchived() &&
        a.occurrence?.slot === desired &&
        a.status === 'cancelled' &&
        a.cancelReason?.toString() === 'Расписание временно недоступно',
    );
    cancelled?.restoreScheduledOccurrence();
  }
}
