export const WALK_REFLECTION_TEMPLATE = {
  decision: 'decision',
  problem: 'problem',
  goal: 'goal',
  strategy: 'strategy',
  freeThought: 'freeThought',
} as const;

export type WalkReflectionTemplate =
  (typeof WALK_REFLECTION_TEMPLATE)[keyof typeof WALK_REFLECTION_TEMPLATE];

export const WALK_REFLECTION_STAGE = {
  facts: 'facts',
  assumptions: 'assumptions',
  options: 'options',
  choiceCost: 'choiceCost',
  smallestTest: 'smallestTest',
  situation: 'situation',
  rootCause: 'rootCause',
  constraints: 'constraints',
  changeOptions: 'changeOptions',
  nextExperiment: 'nextExperiment',
  currentPosition: 'currentPosition',
  desiredResult: 'desiredResult',
  mainObstacle: 'mainObstacle',
  nearestLever: 'nearestLever',
  nextStep: 'nextStep',
  context: 'context',
  constraint: 'constraint',
  priority: 'priority',
  sacrifice: 'sacrifice',
  mainResult: 'mainResult',
} as const;

export type WalkReflectionStage =
  (typeof WALK_REFLECTION_STAGE)[keyof typeof WALK_REFLECTION_STAGE];

const WALK_REFLECTION_STAGES: Readonly<
  Record<WalkReflectionTemplate, readonly WalkReflectionStage[]>
> = {
  [WALK_REFLECTION_TEMPLATE.decision]: [
    WALK_REFLECTION_STAGE.facts,
    WALK_REFLECTION_STAGE.assumptions,
    WALK_REFLECTION_STAGE.options,
    WALK_REFLECTION_STAGE.choiceCost,
    WALK_REFLECTION_STAGE.smallestTest,
  ],
  [WALK_REFLECTION_TEMPLATE.problem]: [
    WALK_REFLECTION_STAGE.situation,
    WALK_REFLECTION_STAGE.rootCause,
    WALK_REFLECTION_STAGE.constraints,
    WALK_REFLECTION_STAGE.changeOptions,
    WALK_REFLECTION_STAGE.nextExperiment,
  ],
  [WALK_REFLECTION_TEMPLATE.goal]: [
    WALK_REFLECTION_STAGE.currentPosition,
    WALK_REFLECTION_STAGE.desiredResult,
    WALK_REFLECTION_STAGE.mainObstacle,
    WALK_REFLECTION_STAGE.nearestLever,
    WALK_REFLECTION_STAGE.nextStep,
  ],
  [WALK_REFLECTION_TEMPLATE.strategy]: [
    WALK_REFLECTION_STAGE.context,
    WALK_REFLECTION_STAGE.constraint,
    WALK_REFLECTION_STAGE.priority,
    WALK_REFLECTION_STAGE.sacrifice,
    WALK_REFLECTION_STAGE.mainResult,
  ],
  [WALK_REFLECTION_TEMPLATE.freeThought]: [],
};

export function isWalkReflectionTemplate(value: unknown): value is WalkReflectionTemplate {
  return Object.values(WALK_REFLECTION_TEMPLATE).some((template) => template === value);
}

export function isWalkReflectionStage(value: unknown): value is WalkReflectionStage {
  return Object.values(WALK_REFLECTION_STAGE).some((stage) => stage === value);
}

export function getWalkReflectionStages(
  template: WalkReflectionTemplate,
): readonly WalkReflectionStage[] {
  return [...WALK_REFLECTION_STAGES[template]];
}

export function isWalkReflectionStageForTemplate(
  template: WalkReflectionTemplate,
  stage: WalkReflectionStage,
): boolean {
  return WALK_REFLECTION_STAGES[template].includes(stage);
}
