import {
  PREPARATION_CATEGORY,
  PREPARATION_SOURCE_TYPE,
  type LifeAction,
  type PreparationRequirement,
} from '../../domain';
import { PREPARATION_AREA } from '../../domain/preparation';

const RECOMMENDED_CORE_KEYS = [
  'ENVIRONMENT:SLEEP:REMOVE_ACTIVE_SCREENS',
  'ENVIRONMENT:SLEEP:PHONE_AWAY',
  'ENVIRONMENT:TOMORROW:ALARM',
  'ENVIRONMENT:TOMORROW:FIRST_ACTION',
] as const;

export function environmentPreparationRequirements(
  firstAction: LifeAction | null,
): readonly PreparationRequirement[] {
  return [
    requirement(
      'ENVIRONMENT:SLEEP:VENTILATE_ROOM',
      PREPARATION_AREA.sleepEnvironment,
      PREPARATION_CATEGORY.physical,
      'Проветрить комнату',
    ),
    requirement(
      'ENVIRONMENT:SLEEP:DIM_LIGHTS',
      PREPARATION_AREA.sleepEnvironment,
      PREPARATION_CATEGORY.physical,
      'Приглушить освещение',
    ),
    requirement(
      'ENVIRONMENT:SLEEP:REMOVE_ACTIVE_SCREENS',
      PREPARATION_AREA.sleepEnvironment,
      PREPARATION_CATEGORY.digital,
      'Убрать активные экраны',
    ),
    requirement(
      'ENVIRONMENT:SLEEP:PREPARE_BED',
      PREPARATION_AREA.sleepEnvironment,
      PREPARATION_CATEGORY.physical,
      'Подготовить кровать',
    ),
    requirement(
      'ENVIRONMENT:SLEEP:REDUCE_NOISE',
      PREPARATION_AREA.sleepEnvironment,
      PREPARATION_CATEGORY.physical,
      'Убрать лишний шум',
    ),
    requirement(
      'ENVIRONMENT:SLEEP:PHONE_AWAY',
      PREPARATION_AREA.sleepEnvironment,
      PREPARATION_CATEGORY.digital,
      'Поставить телефон на зарядку и убрать от кровати',
    ),
    requirement(
      'ENVIRONMENT:TOMORROW:CLOTHES',
      PREPARATION_AREA.tomorrowStart,
      PREPARATION_CATEGORY.physical,
      'Подготовить одежду',
    ),
    requirement(
      'ENVIRONMENT:TOMORROW:WATER',
      PREPARATION_AREA.tomorrowStart,
      PREPARATION_CATEGORY.physical,
      'Подготовить воду',
    ),
    requirement(
      'ENVIRONMENT:TOMORROW:ALARM',
      PREPARATION_AREA.tomorrowStart,
      PREPARATION_CATEGORY.digital,
      'Проверить будильник',
    ),
    requirement(
      'ENVIRONMENT:TOMORROW:NECESSARY_ITEMS',
      PREPARATION_AREA.tomorrowStart,
      PREPARATION_CATEGORY.physical,
      'Подготовить необходимые вещи',
    ),
    requirement(
      'ENVIRONMENT:TOMORROW:WORKSPACE',
      PREPARATION_AREA.tomorrowStart,
      PREPARATION_CATEGORY.physical,
      'Подготовить рабочее место',
    ),
    requirement(
      'ENVIRONMENT:TOMORROW:FIRST_ACTION',
      PREPARATION_AREA.tomorrowStart,
      PREPARATION_CATEGORY.cognitive,
      'Подготовить всё необходимое для первого действия',
      firstAction?.id ?? null,
    ),
  ];
}

export function recommendedEnvironmentCoreKeys(
  items: readonly Pick<PreparationRequirement, 'key'>[],
): readonly string[] {
  const availableKeys = new Set(items.map((item) => item.key));
  return RECOMMENDED_CORE_KEYS.filter((key) => availableKeys.has(key));
}

function requirement(
  key: string,
  area: PreparationRequirement['area'],
  category: PreparationRequirement['category'],
  title: string,
  sourceId: PreparationRequirement['sourceId'] = null,
): PreparationRequirement {
  return {
    key,
    area,
    category,
    title,
    sourceType: PREPARATION_SOURCE_TYPE.firstAction,
    sourceId,
    required: false,
  };
}
