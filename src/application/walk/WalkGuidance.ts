import type { WalkReflectionStage } from '../../domain/walk/WalkReflectionTemplate';
const prompts: Readonly<Record<WalkReflectionStage, string>> = {
  facts: 'Какие факты вам известны?',
  assumptions: 'Что здесь пока только предположение?',
  options: 'Какие варианты вы видите?',
  choiceCost: 'Какова цена каждого выбора?',
  smallestTest: 'Какой небольшой шаг поможет проверить решение?',
  situation: 'Что именно происходит?',
  rootCause: 'Что может быть причиной?',
  constraints: 'Какие ограничения действительно важны?',
  changeOptions: 'Что вы можете изменить?',
  nextExperiment: 'Что можно попробовать следующим?',
  currentPosition: 'Где вы находитесь сейчас?',
  desiredResult: 'Какой результат вы хотите получить?',
  mainObstacle: 'Что больше всего мешает?',
  nearestLever: 'На что вы можете повлиять уже сейчас?',
  nextStep: 'Какой следующий шаг будет посильным?',
  context: 'Что изменилось вокруг вас?',
  constraint: 'Какое ограничение определяет выбор?',
  priority: 'Что сейчас важнее остального?',
  sacrifice: 'От чего можно отказаться?',
  mainResult: 'Какой результат вы хотите сохранить в фокусе?',
};
export function getWalkPrompt(stage: WalkReflectionStage | null): string | null {
  return stage === null ? null : prompts[stage];
}
