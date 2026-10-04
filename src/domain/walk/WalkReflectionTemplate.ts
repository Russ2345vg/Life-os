export const WALK_REFLECTION_TEMPLATE = {
  decision: 'decision',
  problem: 'problem',
  goal: 'goal',
  strategy: 'strategy',
  freeThought: 'freeThought',
  ownQuestion: 'ownQuestion',
  self: 'self',
  dailyReview: 'dailyReview',
  priorities: 'priorities',
  relationships: 'relationships',
  ideas: 'ideas',
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
  whyImportant: 'whyImportant',
  whatKnown: 'whatKnown',
  doubts: 'doubts',
  overlookedOptions: 'overlookedOptions',
  whatCleared: 'whatCleared',
  onMyMind: 'onMyMind',
  whatMissing: 'whatMissing',
  wantChange: 'wantChange',
  memorable: 'memorable',
  gaveEnergy: 'gaveEnergy',
  carryTomorrow: 'carryTomorrow',
  canWait: 'canWait',
  giveAttention: 'giveAttention',
  myView: 'myView',
  otherView: 'otherView',
  discussDirectly: 'discussDirectly',
  simplify: 'simplify',
  tryDifferently: 'tryDifferently',
  smallestExperiment: 'smallestExperiment',
  desiredOutcome: 'desiredOutcome',
  previousAttempts: 'previousAttempts',
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
    WALK_REFLECTION_STAGE.desiredOutcome,
    WALK_REFLECTION_STAGE.constraints,
    WALK_REFLECTION_STAGE.previousAttempts,
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
  [WALK_REFLECTION_TEMPLATE.ownQuestion]: [
    WALK_REFLECTION_STAGE.whyImportant,
    WALK_REFLECTION_STAGE.whatKnown,
    WALK_REFLECTION_STAGE.doubts,
    WALK_REFLECTION_STAGE.overlookedOptions,
    WALK_REFLECTION_STAGE.whatCleared,
  ],
  [WALK_REFLECTION_TEMPLATE.self]: [
    WALK_REFLECTION_STAGE.onMyMind,
    WALK_REFLECTION_STAGE.whatMissing,
    WALK_REFLECTION_STAGE.wantChange,
  ],
  [WALK_REFLECTION_TEMPLATE.dailyReview]: [
    WALK_REFLECTION_STAGE.memorable,
    WALK_REFLECTION_STAGE.gaveEnergy,
    WALK_REFLECTION_STAGE.carryTomorrow,
  ],
  [WALK_REFLECTION_TEMPLATE.priorities]: [
    WALK_REFLECTION_STAGE.priority,
    WALK_REFLECTION_STAGE.canWait,
    WALK_REFLECTION_STAGE.giveAttention,
  ],
  [WALK_REFLECTION_TEMPLATE.relationships]: [
    WALK_REFLECTION_STAGE.myView,
    WALK_REFLECTION_STAGE.otherView,
    WALK_REFLECTION_STAGE.discussDirectly,
  ],
  [WALK_REFLECTION_TEMPLATE.ideas]: [
    WALK_REFLECTION_STAGE.simplify,
    WALK_REFLECTION_STAGE.tryDifferently,
    WALK_REFLECTION_STAGE.smallestExperiment,
  ],
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
