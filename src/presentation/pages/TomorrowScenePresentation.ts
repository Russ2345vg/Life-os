import type { TomorrowPlan } from '../../domain';

export type TomorrowSceneVisualState = 'empty' | 'partial' | 'ready';
export type TomorrowOutcomeLevel = 'minimum' | 'target' | 'stretch';

export interface TomorrowWorkingFormPresentationInput {
  readonly selectedOutcomeLevel: TomorrowOutcomeLevel;
  readonly minimum: string;
  readonly target: string;
  readonly stretch: string;
  readonly primaryReady: boolean;
  readonly firstActionReady: boolean;
  readonly overloaded: boolean;
  readonly overloadAccepted: boolean;
}

export interface TomorrowWorkingFormPresentation {
  readonly activeOutcome: {
    readonly level: TomorrowOutcomeLevel;
    readonly label: string;
    readonly value: string;
  };
  readonly outcomeValues: Readonly<Record<TomorrowOutcomeLevel, string>>;
  readonly followingBlocksDisabled: boolean;
  readonly continueReady: boolean;
}

export interface TomorrowSceneEditorValues {
  readonly primaryId: string;
  readonly vector: string;
  readonly minimum: string;
  readonly target: string;
  readonly stretch: string;
  readonly firstActionId: string;
  readonly supportingIds: readonly string[];
  readonly newPrimaryTitle: string;
  readonly newPrimaryResult: string;
  readonly newActionTitle: string;
  readonly newActionResult: string;
  readonly newSupportingTitle1: string;
  readonly newSupportingTitle2: string;
  readonly isCreatingPrimary: boolean;
  readonly primaryChooserOpen: boolean;
  readonly creatingSupportingSlots: readonly [boolean, boolean];
}

export function getTomorrowSceneEditorValues(
  plan: Pick<
    TomorrowPlan,
    | 'primaryDecisionId'
    | 'vector'
    | 'minimumOutcome'
    | 'targetOutcome'
    | 'stretchOutcome'
    | 'firstActionId'
    | 'supportingDecisionIds'
  >,
): TomorrowSceneEditorValues {
  return {
    primaryId: plan.primaryDecisionId?.toString() ?? '',
    vector: plan.vector ?? '',
    minimum: plan.minimumOutcome ?? '',
    target: plan.targetOutcome ?? '',
    stretch: plan.stretchOutcome ?? '',
    firstActionId: plan.firstActionId?.toString() ?? '',
    supportingIds: plan.supportingDecisionIds.map((id) => id.toString()),
    newPrimaryTitle: '',
    newPrimaryResult: '',
    newActionTitle: '',
    newActionResult: '',
    newSupportingTitle1: '',
    newSupportingTitle2: '',
    isCreatingPrimary: false,
    primaryChooserOpen: false,
    creatingSupportingSlots: [false, false],
  };
}

export function getTomorrowSceneVisualState({
  primaryReady,
  minimumOutcome,
  firstActionReady,
}: {
  readonly primaryReady: boolean;
  readonly minimumOutcome: string;
  readonly firstActionReady: boolean;
}): TomorrowSceneVisualState {
  if (!primaryReady) return 'empty';
  return minimumOutcome.trim().length > 0 && firstActionReady ? 'ready' : 'partial';
}

export function buildTomorrowWorkingFormPresentation(
  input: TomorrowWorkingFormPresentationInput,
): TomorrowWorkingFormPresentation {
  const outcomeValues = Object.freeze({
    minimum: input.minimum,
    target: input.target,
    stretch: input.stretch,
  });
  const labels: Readonly<Record<TomorrowOutcomeLevel, string>> = Object.freeze({
    minimum: 'Минимум',
    target: 'Норма',
    stretch: 'Максимум',
  });

  return Object.freeze({
    activeOutcome: Object.freeze({
      level: input.selectedOutcomeLevel,
      label: labels[input.selectedOutcomeLevel],
      value: outcomeValues[input.selectedOutcomeLevel],
    }),
    outcomeValues,
    followingBlocksDisabled: !input.primaryReady,
    continueReady:
      input.primaryReady &&
      input.minimum.trim().length > 0 &&
      input.firstActionReady &&
      (!input.overloaded || input.overloadAccepted),
  });
}
