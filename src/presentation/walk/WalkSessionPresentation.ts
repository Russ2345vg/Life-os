import {
  WALK_IMPACT,
  WALK_INTENT,
  WALK_REENTRY_ACTION_KIND,
  WALK_RETURN_ORIGIN,
  type WalkImpact,
  type WalkIntent,
  type WalkReentryAction,
  type WalkReturnOrigin,
} from '../../domain';
import { APP_SECTION, type AppSection } from '../navigation/AppSection';

interface WalkIntentPresentation {
  readonly shortLabel: string;
  readonly label: string;
  readonly description: string;
  readonly prompt: string;
}

export const WALK_INTENT_PRESENTATION: Readonly<Record<WalkIntent, WalkIntentPresentation>> = {
  [WALK_INTENT.free]: {
    shortLabel: 'Свободная',
    label: 'Свободная прогулка',
    description: 'Без задачи и маршрута — просто сменить ритм и побыть в движении.',
    prompt: 'Что вокруг хочется заметить без спешки?',
  },
  [WALK_INTENT.recovery]: {
    shortLabel: 'Восстановительная',
    label: 'Восстановительная',
    description: 'Снизить напряжение, вернуть немного энергии и спокойствия.',
    prompt: 'Что поможет отпустить напряжение?',
  },
  [WALK_INTENT.reflection]: {
    shortLabel: 'Размышление',
    label: 'Размышление',
    description: 'Взять один вопрос и дать мыслям пространство без экрана.',
    prompt: 'Что мне важно спокойно обдумать?',
  },
};

export const WALK_INTENT_OPTIONS: readonly WalkIntent[] = [
  WALK_INTENT.free,
  WALK_INTENT.recovery,
  WALK_INTENT.reflection,
];

export type WalkDurationMinutes = 20 | 30 | 40;

interface WalkImpactPresentation {
  readonly value: WalkImpact;
  readonly label: string;
}

export const WALK_IMPACT_OPTIONS: readonly WalkImpactPresentation[] = [
  { value: WALK_IMPACT.better, label: 'Лучше' },
  { value: WALK_IMPACT.same, label: 'Так же' },
  { value: WALK_IMPACT.worse, label: 'Хуже' },
];

export interface WalkReturnPresentation {
  readonly label: string;
  readonly destination: AppSection;
}

const WALK_RETURN_PRESENTATION: Readonly<Record<WalkReturnOrigin, WalkReturnPresentation>> = {
  [WALK_RETURN_ORIGIN.walks]: {
    label: 'Вернуться к прогулкам',
    destination: APP_SECTION.walks,
  },
  [WALK_RETURN_ORIGIN.today]: {
    label: 'Вернуться на «Сегодня»',
    destination: APP_SECTION.today,
  },
  [WALK_RETURN_ORIGIN.decision]: {
    label: 'Вернуться к решению',
    destination: APP_SECTION.decisions,
  },
  [WALK_RETURN_ORIGIN.goal]: {
    label: 'Вернуться к цели',
    destination: APP_SECTION.management,
  },
  [WALK_RETURN_ORIGIN.project]: {
    label: 'Вернуться к цели',
    destination: APP_SECTION.management,
  },
  [WALK_RETURN_ORIGIN.lifeAction]: {
    label: 'Вернуться к действию',
    destination: APP_SECTION.actions,
  },
  [WALK_RETURN_ORIGIN.routine]: {
    label: 'Вернуться к распорядку',
    destination: APP_SECTION.routine,
  },
};

export function getWalkReturnPresentation(origin: WalkReturnOrigin): WalkReturnPresentation {
  return WALK_RETURN_PRESENTATION[origin];
}

export interface WalkReentryPresentation {
  readonly title: string;
  readonly description: string;
  readonly primaryLabel: string;
  readonly destination: AppSection;
}

export function getWalkReentryPresentation(action: WalkReentryAction): WalkReentryPresentation {
  const destination = getWalkReturnPresentation(action.destination);
  switch (action.kind) {
    case WALK_REENTRY_ACTION_KIND.recovery:
      return {
        title: 'Сначала восстановиться',
        description: 'Состояние стало тяжелее. Выберите спокойный шаг на «Сегодня».',
        primaryLabel: 'Перейти на «Сегодня»',
        destination: APP_SECTION.today,
      };
    case WALK_REENTRY_ACTION_KIND.reviewResult:
      return {
        title: 'Проверить сохранённый вывод',
        description: 'Вернитесь к связанному контексту и проверьте вывод без спешки.',
        primaryLabel: destination.label,
        destination: destination.destination,
      };
    case WALK_REENTRY_ACTION_KIND.resumeContext:
      return {
        title: 'Продолжить начатое',
        description: 'Контекст сохранён. Можно вернуться ровно к следующему шагу.',
        primaryLabel: destination.label,
        destination: destination.destination,
      };
    case WALK_REENTRY_ACTION_KIND.today:
      return {
        title: 'Вернуться в ритм дня',
        description: 'Итог сохранён. Продолжите день с одним ясным следующим шагом.',
        primaryLabel: 'Перейти на «Сегодня»',
        destination: APP_SECTION.today,
      };
  }
}
