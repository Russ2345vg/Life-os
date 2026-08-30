import {
  EVENING_CYCLE_STATE,
  PREPARATION_CATEGORY,
  PREPARATION_RULE_CONDITION,
  PREPARATION_SOURCE_TYPE,
  PreparationPlan,
  PreparationRule,
  type DayDate,
  type Decision,
  type EntityId,
  type EveningCycle,
  type LifeAction,
  type PreparationCategory,
  type PreparationRequirement,
  type PreparationRuleCondition,
  type Project,
  type TomorrowPlan,
} from '../../domain';
import { PREPARATION_AREA } from '../../domain/preparation';
import { DomainError } from '../../shared/errors/DomainError';
import { cloneEveningCycle } from '../evening-cycle';
import type { Clock } from '../ports/Clock';
import type { DecisionRepository } from '../ports/DecisionRepository';
import type { EveningCycleRepository } from '../ports/EveningCycleRepository';
import type { IdGenerator } from '../ports/IdGenerator';
import type { LifeActionRepository } from '../ports/LifeActionRepository';
import type { PreparationPlanRepository } from '../ports/PreparationPlanRepository';
import type { PreparationRuleRepository } from '../ports/PreparationRuleRepository';
import type { PreparationUnitOfWork } from '../ports/PreparationUnitOfWork';
import type { ProjectRepository } from '../ports/ProjectRepository';
import type { TomorrowPlanRepository } from '../ports/TomorrowPlanRepository';
import {
  environmentPreparationRequirements,
  recommendedEnvironmentCoreKeys,
} from './EnvironmentPreparationCatalog';

export interface PreparationSnapshot {
  readonly plan: PreparationPlan;
  readonly recommendedCoreKeys: readonly string[];
  readonly firstAction: LifeAction | null;
  readonly primaryDecision: Decision | null;
  readonly project: Project | null;
}

export interface CreatePreparationRuleInput {
  readonly condition: PreparationRuleCondition;
  readonly conditionValue?: string | null;
  readonly category: PreparationCategory;
  readonly title: string;
  readonly required: boolean;
}

interface GenerationContext {
  readonly plan: TomorrowPlan;
  readonly cycle: EveningCycle;
  readonly firstAction: LifeAction | null;
  readonly primaryDecision: Decision | null;
  readonly project: Project | null;
  readonly rules: readonly PreparationRule[];
}

export class PreparationService {
  public constructor(
    private readonly cycles: EveningCycleRepository,
    private readonly tomorrowPlans: TomorrowPlanRepository,
    private readonly preparationPlans: PreparationPlanRepository,
    private readonly rules: PreparationRuleRepository,
    private readonly decisions: DecisionRepository,
    private readonly lifeActions: LifeActionRepository,
    private readonly projects: ProjectRepository,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly unitOfWork: PreparationUnitOfWork,
  ) {}

  public async getOrGenerate(cycleDate: DayDate): Promise<PreparationSnapshot> {
    const cycle = await this.requirePreparingCycle(cycleDate);
    const storedPlan = await this.preparationPlans.findByCycleId(cycle.id);
    if (cycle.state === EVENING_CYCLE_STATE.completed && storedPlan !== null) {
      return snapshot(storedPlan, await this.historyContextForCycle(cycle));
    }

    const context = await this.contextForCycle(cycle);
    const signature = generationSignature(context);
    const requirements = generateRequirements(context);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const existing = await this.preparationPlans.findByCycleId(context.cycle.id);
      if (existing === null) {
        const now = this.clock.now();
        const created = PreparationPlan.create({
          id: this.ids.generate(),
          cycleId: context.cycle.id,
          tomorrowPlanId: context.plan.id,
          targetDayId: context.plan.targetDayId,
          sourceVersion: context.plan.version,
          generationSignature: 'UNINITIALIZED',
          createdAt: now,
        });
        created.synchronize(requirements, context.plan.version, signature, now, () =>
          this.ids.generate(),
        );
        const stored = await this.preparationPlans.createIfAbsent(created);
        if (stored.id.equals(created.id)) return snapshot(created, context);
        continue;
      }
      if (!existing.tomorrowPlanId.equals(context.plan.id)) {
        throw new DomainError(
          'preparation.tomorrow_plan_mismatch',
          'Подготовка связана с другим планом завтра.',
        );
      }
      if (existing.generationSignature === signature) return snapshot(existing, context);
      const changed = clonePreparationPlan(existing);
      const expectedVersion = changed.version;
      changed.synchronize(requirements, context.plan.version, signature, this.clock.now(), () =>
        this.ids.generate(),
      );
      if (await this.preparationPlans.saveIfVersionMatches(changed, expectedVersion)) {
        return snapshot(changed, context);
      }
    }
    throw concurrentChange();
  }

  public async getByTargetDayId(targetDayId: EntityId): Promise<PreparationPlan | null> {
    return this.preparationPlans.findByTargetDayId(targetDayId);
  }

  public async completeItem(cycleDate: DayDate, itemId: EntityId): Promise<PreparationSnapshot> {
    return this.mutate(cycleDate, (plan, now) => plan.completeItem(itemId, now));
  }

  public async skipItem(
    cycleDate: DayDate,
    itemId: EntityId,
    reason?: string | null,
  ): Promise<PreparationSnapshot> {
    return this.mutate(cycleDate, (plan, now) => plan.skipItem(itemId, now, reason));
  }

  public async configureRequiredCore(
    cycleDate: DayDate,
    itemKeys: readonly string[],
  ): Promise<PreparationSnapshot> {
    return this.mutate(cycleDate, (plan, now) => plan.configureRequiredCore(itemKeys, now));
  }

  public async createRule(input: CreatePreparationRuleInput): Promise<PreparationRule> {
    const rule = PreparationRule.create({
      id: this.ids.generate(),
      condition: input.condition,
      conditionValue: input.conditionValue ?? null,
      category: input.category,
      title: input.title,
      required: input.required,
      createdAt: this.clock.now(),
    });
    await this.rules.save(rule);
    return rule;
  }

  public async continueToShutdown(cycleDate: DayDate): Promise<PreparationSnapshot> {
    const currentCycle = await this.cycles.findByDateKey(cycleDate);
    if (currentCycle?.state === EVENING_CYCLE_STATE.shutdown) {
      return this.recoverCompletedPreparation(currentCycle);
    }
    const generated = await this.getOrGenerate(cycleDate);
    const storedCycle = await this.requirePreparingCycle(cycleDate);
    const cycle = cloneEveningCycle(storedCycle);
    const expectedEveningCycleVersion = cycle.version;
    const plan = clonePreparationPlan(generated.plan);
    const expectedPlanVersion = plan.version;
    const now = this.clock.now();
    plan.complete(now);
    if (storedCycle.state === EVENING_CYCLE_STATE.completed) {
      await this.unitOfWork.commit({ plan, expectedPlanVersion });
      return { ...generated, plan };
    }
    cycle.completePreparation(now);
    try {
      await this.unitOfWork.commit({
        plan,
        expectedPlanVersion,
        eveningCycle: cycle,
        expectedEveningCycleVersion,
      });
      return { ...generated, plan };
    } catch (error: unknown) {
      const concurrentCycle = await this.cycles.findByDateKey(cycleDate);
      if (concurrentCycle?.state === EVENING_CYCLE_STATE.shutdown) {
        return this.recoverCompletedPreparation(concurrentCycle);
      }
      throw error;
    }
  }

  private async recoverCompletedPreparation(cycle: EveningCycle): Promise<PreparationSnapshot> {
    const plan = await this.preparationPlans.findByCycleId(cycle.id);
    if (plan === null || plan.status !== 'COMPLETED') {
      throw new DomainError(
        'preparation.inconsistent_shutdown',
        'SHUTDOWN не содержит завершённого плана подготовки.',
      );
    }
    return snapshot(plan, await this.contextForCycle(cycle));
  }

  private async mutate(
    cycleDate: DayDate,
    mutation: (plan: PreparationPlan, now: Date) => boolean,
  ): Promise<PreparationSnapshot> {
    await this.getOrGenerate(cycleDate);
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const context = await this.generationContext(cycleDate);
      const stored = await this.preparationPlans.findByCycleId(context.cycle.id);
      if (stored === null)
        throw new DomainError('preparation.not_found', 'План подготовки не найден.');
      const plan = clonePreparationPlan(stored);
      const expectedVersion = plan.version;
      if (!mutation(plan, this.clock.now())) return snapshot(plan, context);
      if (await this.preparationPlans.saveIfVersionMatches(plan, expectedVersion)) {
        return snapshot(plan, context);
      }
    }
    throw concurrentChange();
  }

  private async generationContext(cycleDate: DayDate): Promise<GenerationContext> {
    const cycle = await this.requirePreparingCycle(cycleDate);
    return this.contextForCycle(cycle);
  }

  private async contextForCycle(cycle: EveningCycle): Promise<GenerationContext> {
    const plan = await this.tomorrowPlans.findByCycleId(cycle.id);
    if (plan === null) {
      throw new DomainError('preparation.tomorrow_plan_not_found', 'План завтра не найден.');
    }
    const [firstAction, primaryDecision, rules] = await Promise.all([
      plan.firstActionId === null ? null : this.lifeActions.findById(plan.firstActionId),
      plan.primaryDecisionId === null ? null : this.decisions.findById(plan.primaryDecisionId),
      this.rules.findActive(),
    ]);
    const project =
      primaryDecision?.projectId === null || primaryDecision?.projectId === undefined
        ? null
        : await this.projects.findById(primaryDecision.projectId);
    return { plan, cycle, firstAction, primaryDecision, project, rules };
  }

  private async historyContextForCycle(cycle: EveningCycle): Promise<GenerationContext> {
    const plan = await this.tomorrowPlans.findByCycleId(cycle.id);
    if (plan === null) {
      throw new DomainError('preparation.tomorrow_plan_not_found', 'План завтра не найден.');
    }
    const firstAction =
      plan.firstActionId === null ? null : await this.lifeActions.findById(plan.firstActionId);
    return {
      plan,
      cycle,
      firstAction,
      primaryDecision: null,
      project: null,
      rules: [],
    };
  }

  private async requirePreparingCycle(cycleDate: DayDate): Promise<EveningCycle> {
    const cycle = await this.cycles.findByDateKey(cycleDate);
    if (cycle === null)
      throw new DomainError('evening_cycle.not_found', 'Вечерний цикл не найден.');
    if (
      cycle.state !== EVENING_CYCLE_STATE.preparing &&
      cycle.state !== EVENING_CYCLE_STATE.completed
    ) {
      throw new DomainError(
        'preparation.wrong_cycle_state',
        'Подготовка доступна на этапе PREPARING и после завершения вечернего цикла.',
      );
    }
    return cycle;
  }
}

export function clonePreparationPlan(plan: PreparationPlan): PreparationPlan {
  return PreparationPlan.rehydrate({
    id: plan.id,
    cycleId: plan.cycleId,
    tomorrowPlanId: plan.tomorrowPlanId,
    targetDayId: plan.targetDayId,
    items: plan.items,
    requiredCoreKeys: plan.requiredCoreKeys,
    sourceVersion: plan.sourceVersion,
    generationSignature: plan.generationSignature,
    status: plan.status,
    createdAt: plan.createdAt,
    updatedAt: plan.updatedAt,
    completedAt: plan.completedAt,
    version: plan.version,
  });
}

function snapshot(plan: PreparationPlan, context: GenerationContext): PreparationSnapshot {
  return Object.freeze({
    plan,
    recommendedCoreKeys:
      plan.requiredCoreKeys === null
        ? recommendedEnvironmentCoreKeys(plan.activeItems)
        : plan.requiredCoreKeys,
    firstAction: context.firstAction,
    primaryDecision: context.primaryDecision,
    project: context.project,
  });
}

function generationSignature(context: GenerationContext): string {
  const ruleSignature = context.rules
    .map((rule) => `${rule.id.toString()}:${rule.version}`)
    .sort()
    .join(',');
  const corrections = context.cycle.reflectionCorrections
    .map((item) => item.id.toString())
    .sort()
    .join(',');
  return `environment:r4|tomorrow:${context.plan.version}|rules:${ruleSignature}|corrections:${corrections}`;
}

function generateRequirements(context: GenerationContext): readonly PreparationRequirement[] {
  const requirements: PreparationRequirement[] = [
    ...environmentPreparationRequirements(context.firstAction),
  ];
  const actionText = normalizeMatchText(context.firstAction?.title.toString() ?? '');
  const decisionText = normalizeMatchText(context.primaryDecision?.title.toString() ?? '');
  const projectText = normalizeMatchText(context.project?.title ?? '');
  const combined = `${actionText} ${decisionText} ${projectText}`;

  for (const rule of context.rules.filter((candidate) => matchesRule(candidate, context))) {
    requirements.push({
      key: `RULE:${rule.id.toString()}`,
      area: PREPARATION_AREA.tomorrowStart,
      category: rule.category,
      title: rule.title,
      sourceType: PREPARATION_SOURCE_TYPE.rule,
      sourceId: rule.id,
      required: rule.required,
    });
  }

  if (context.project !== null) {
    requirements.push({
      key: `PROJECT:${context.project.id.toString()}:OPEN`,
      area: PREPARATION_AREA.tomorrowStart,
      category: PREPARATION_CATEGORY.digital,
      title: `Открыть проект «${context.project.title}»`,
      sourceType: PREPARATION_SOURCE_TYPE.project,
      sourceId: context.project.id,
      required: true,
    });
  }

  if (matchesAny(combined, DEVELOPMENT_MARKERS)) {
    requirements.push(
      requirementForAction(
        context.firstAction,
        'DEVELOPMENT_WORKSPACE',
        PREPARATION_CATEGORY.physical,
        'Подготовить рабочее место',
        false,
      ),
    );
    if (context.project === null) {
      requirements.push(
        requirementForAction(
          context.firstAction,
          'DEVELOPMENT_ENVIRONMENT',
          PREPARATION_CATEGORY.digital,
          'Подготовить среду разработки',
          true,
        ),
      );
    }
  }

  if (matchesAny(actionText, RESEARCH_MARKERS)) {
    requirements.push(
      requirementForAction(
        context.firstAction,
        'RESEARCH_INFORMATION',
        PREPARATION_CATEGORY.cognitive,
        'Подготовить нужную информацию для первого действия',
        false,
      ),
    );
  }

  if (matchesAny(actionText, OUTSIDE_MARKERS)) {
    requirements.push(
      requirementForAction(
        context.firstAction,
        'OUTSIDE_ITEMS',
        PREPARATION_CATEGORY.physical,
        'Подготовить необходимые вещи для первого действия',
        false,
      ),
    );
  }

  for (const correction of context.cycle.reflectionCorrections.filter(isPreparationCorrection)) {
    requirements.push({
      key: `REFLECTION:${correction.id.toString()}`,
      area: PREPARATION_AREA.tomorrowStart,
      category: categoryForText(correction.action),
      title: correction.action,
      sourceType: PREPARATION_SOURCE_TYPE.reflection,
      sourceId: correction.id,
      required: false,
    });
  }

  const deduplicated = new Map<string, PreparationRequirement>();
  for (const requirement of requirements) {
    if (!deduplicated.has(requirement.key)) deduplicated.set(requirement.key, requirement);
  }
  return [...deduplicated.values()].sort(
    (left, right) => Number(right.required) - Number(left.required),
  );
}

function requirementForAction(
  action: LifeAction | null,
  suffix: string,
  category: PreparationCategory,
  title: string,
  required: boolean,
): PreparationRequirement {
  return {
    key: `FIRST_ACTION:${action?.id.toString() ?? 'MISSING'}:${suffix}`,
    area: PREPARATION_AREA.tomorrowStart,
    category,
    title,
    sourceType: PREPARATION_SOURCE_TYPE.firstAction,
    sourceId: action?.id ?? null,
    required,
  };
}

function matchesRule(rule: PreparationRule, context: GenerationContext): boolean {
  if (rule.condition === PREPARATION_RULE_CONDITION.hasLinkedProject) {
    return context.project !== null;
  }
  if (rule.condition === PREPARATION_RULE_CONDITION.primaryDecisionKind) {
    return context.primaryDecision?.kind === rule.conditionValue;
  }
  return normalizeMatchText(context.firstAction?.title.toString() ?? '').includes(
    normalizeMatchText(rule.conditionValue ?? ''),
  );
}

function isPreparationCorrection(correction: { readonly action: string }): boolean {
  return matchesAny(normalizeMatchText(correction.action), [
    'завтра',
    'перед ',
    'подготов',
    'prepare',
    'before ',
  ]);
}

function categoryForText(value: string): PreparationCategory {
  const normalized = normalizeMatchText(value);
  if (matchesAny(normalized, ['проект', 'документ', 'ноутбук', 'телефон', 'уведомлен', 'device'])) {
    return PREPARATION_CATEGORY.digital;
  }
  if (matchesAny(normalized, ['одежд', 'вода', 'стол', 'место', 'вещ', 'инструмент'])) {
    return PREPARATION_CATEGORY.physical;
  }
  return PREPARATION_CATEGORY.cognitive;
}

function normalizeMatchText(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU');
}

function matchesAny(value: string, markers: readonly string[]): boolean {
  return markers.some((marker) => value.includes(marker));
}

function concurrentChange(): DomainError {
  return new DomainError(
    'preparation.concurrent_change',
    'Подготовка изменилась в другом окне. Повторите операцию.',
  );
}

const DEVELOPMENT_MARKERS = [
  'разработ',
  'программ',
  'код',
  'development',
  'software',
  'coding',
] as const;
const RESEARCH_MARKERS = [
  'исслед',
  'изуч',
  'проанализ',
  'разобраться',
  'research',
  'analyse',
  'analyze',
] as const;
const OUTSIDE_MARKERS = [
  'офис',
  'встреч',
  'поезд',
  'дорог',
  'трениров',
  'office',
  'meeting',
  'travel',
] as const;
