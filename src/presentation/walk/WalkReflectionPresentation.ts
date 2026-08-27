import {
  WALK_REFLECTION_STAGE,
  WALK_REFLECTION_TEMPLATE,
  type WalkReflectionStage,
  type WalkReflectionTemplate,
} from '../../domain';

interface WalkReflectionTemplatePresentation {
  readonly label: string;
  readonly description: string;
}

interface WalkReflectionStagePresentation {
  readonly label: string;
  readonly prompt: string;
}

export const WALK_REFLECTION_TEMPLATE_OPTIONS: readonly WalkReflectionTemplate[] = [
  WALK_REFLECTION_TEMPLATE.decision,
  WALK_REFLECTION_TEMPLATE.problem,
  WALK_REFLECTION_TEMPLATE.goal,
  WALK_REFLECTION_TEMPLATE.strategy,
  WALK_REFLECTION_TEMPLATE.freeThought,
];

export const WALK_REFLECTION_TEMPLATE_PRESENTATION: Readonly<
  Record<WalkReflectionTemplate, WalkReflectionTemplatePresentation>
> = {
  [WALK_REFLECTION_TEMPLATE.decision]: {
    label: 'Принятие решения',
    description: 'Отделить факты от предположений и выбрать небольшой способ проверить решение.',
  },
  [WALK_REFLECTION_TEMPLATE.problem]: {
    label: 'Разбор проблемы',
    description: 'Увидеть причину, ограничения и ближайший безопасный эксперимент.',
  },
  [WALK_REFLECTION_TEMPLATE.goal]: {
    label: 'Прояснение цели',
    description: 'Сверить желаемый результат, препятствие и следующий шаг.',
  },
  [WALK_REFLECTION_TEMPLATE.strategy]: {
    label: 'Стратегия',
    description: 'Выбрать приоритет, принять ограничения и определить главный результат.',
  },
  [WALK_REFLECTION_TEMPLATE.freeThought]: {
    label: 'Свободная мысль',
    description: 'Без этапов и подсказок — только ваш вопрос и пространство прогулки.',
  },
};

const WALK_REFLECTION_STAGE_PRESENTATION: Readonly<
  Record<WalkReflectionStage, WalkReflectionStagePresentation>
> = {
  [WALK_REFLECTION_STAGE.facts]: {
    label: 'Факты',
    prompt: 'Что известно наверняка, без интерпретаций?',
  },
  [WALK_REFLECTION_STAGE.assumptions]: {
    label: 'Предположения',
    prompt: 'Какие выводы пока остаются предположениями?',
  },
  [WALK_REFLECTION_STAGE.options]: {
    label: 'Варианты',
    prompt: 'Какие реальные варианты выбора у вас есть?',
  },
  [WALK_REFLECTION_STAGE.choiceCost]: {
    label: 'Цена выбора',
    prompt: 'Чем придётся пожертвовать в каждом варианте?',
  },
  [WALK_REFLECTION_STAGE.smallestTest]: {
    label: 'Минимальный проверочный шаг',
    prompt: 'Какой небольшой шаг быстрее всего проверит выбранное направление?',
  },
  [WALK_REFLECTION_STAGE.situation]: {
    label: 'Ситуация',
    prompt: 'Что происходит сейчас, если описать ситуацию коротко и точно?',
  },
  [WALK_REFLECTION_STAGE.rootCause]: {
    label: 'Корневая причина',
    prompt: 'Что поддерживает проблему глубже видимых симптомов?',
  },
  [WALK_REFLECTION_STAGE.constraints]: {
    label: 'Ограничения',
    prompt: 'Какие ограничения действительно нельзя игнорировать?',
  },
  [WALK_REFLECTION_STAGE.changeOptions]: {
    label: 'Варианты изменений',
    prompt: 'Что можно изменить, не пытаясь решить всё сразу?',
  },
  [WALK_REFLECTION_STAGE.nextExperiment]: {
    label: 'Следующий эксперимент',
    prompt: 'Какой небольшой эксперимент даст новую информацию?',
  },
  [WALK_REFLECTION_STAGE.currentPosition]: {
    label: 'Текущая точка',
    prompt: 'Где вы находитесь сейчас относительно цели?',
  },
  [WALK_REFLECTION_STAGE.desiredResult]: {
    label: 'Желаемый результат',
    prompt: 'Какой конкретный результат будет означать, что цель достигнута?',
  },
  [WALK_REFLECTION_STAGE.mainObstacle]: {
    label: 'Главное препятствие',
    prompt: 'Что сильнее всего мешает приблизиться к результату?',
  },
  [WALK_REFLECTION_STAGE.nearestLever]: {
    label: 'Ближайший рычаг',
    prompt: 'На что вы можете повлиять уже сейчас?',
  },
  [WALK_REFLECTION_STAGE.nextStep]: {
    label: 'Следующий шаг',
    prompt: 'Какой один шаг стоит сделать после прогулки?',
  },
  [WALK_REFLECTION_STAGE.context]: {
    label: 'Контекст',
    prompt: 'В каком контексте нужно принять стратегическое решение?',
  },
  [WALK_REFLECTION_STAGE.constraint]: {
    label: 'Ключевое ограничение',
    prompt: 'Какое ограничение сильнее всего определяет выбор?',
  },
  [WALK_REFLECTION_STAGE.priority]: {
    label: 'Приоритет',
    prompt: 'Что должно получить внимание раньше остального?',
  },
  [WALK_REFLECTION_STAGE.sacrifice]: {
    label: 'От чего отказаться',
    prompt: 'От чего нужно отказаться, чтобы сохранить выбранный приоритет?',
  },
  [WALK_REFLECTION_STAGE.mainResult]: {
    label: 'Главный результат',
    prompt: 'Какой результат станет главным ориентиром стратегии?',
  },
};

export function getWalkReflectionStagePresentation(
  stage: WalkReflectionStage,
): WalkReflectionStagePresentation {
  return WALK_REFLECTION_STAGE_PRESENTATION[stage];
}
