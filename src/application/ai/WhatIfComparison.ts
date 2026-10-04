import type { AnalyticsSnapshot } from '../ports/AnalyticsSnapshotReader';
import { buildTimeScheduleDay } from '../queries/GetTimeSchedule';
import { addDays } from '../../domain/planner/PlanningPeriod';
import { calculateNightWindow, resolveSleepCycleDate } from '../../domain/sleep/NightTime';
import type { AiContext, AiSource } from './AiContext';

export interface WhatIfOption {
  readonly title: string;
  readonly durationMinutes: number;
}

export interface WhatIfInput {
  readonly date: string;
  readonly now: Date;
  readonly timeZone?: string;
  readonly options: readonly [WhatIfOption, WhatIfOption];
}

export interface WhatIfOptionResult extends WhatIfOption {
  readonly finishAt: string;
  readonly overlappingActionCount: number;
  readonly overlappingActionTitles: readonly string[];
  readonly sleepOverrunMinutes: number | null;
}

export interface WhatIfComparison {
  readonly plan: {
    readonly actionCount: number;
    readonly knownMinutes: number;
    readonly unknownEstimateCount: number;
  };
  readonly startedAt: string;
  readonly nextSleepAt: string | null;
  readonly sleepTimeZone: string | null;
  readonly options: readonly [WhatIfOptionResult, WhatIfOptionResult];
  readonly context: AiContext;
}

const MINUTE_MS = 60_000;
const encoder = new TextEncoder();

function currentLocalMinute(now: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value);
  if (!Number.isInteger(hour) || !Number.isInteger(minute))
    throw new Error('Не удалось определить текущее время.');
  return hour * 60 + minute;
}

function nextBedtime(snapshot: AnalyticsSnapshot, now: Date): Date | null {
  const settings = snapshot.sleep?.settings;
  if (!settings) return null;
  let cycleDate = resolveSleepCycleDate(now, settings.timeZone, settings.wakeTime);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const sleepAt = calculateNightWindow({ cycleDate, ...settings }).plannedSleepAt;
    if (sleepAt.getTime() > now.getTime()) return sleepAt;
    cycleDate = addDays(cycleDate, 1);
  }
  return null;
}

export function compareWhatIf(input: WhatIfInput, snapshot: AnalyticsSnapshot): WhatIfComparison {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || Number.isNaN(input.now.getTime()))
    throw new Error('Не удалось определить дату сравнения.');
  const normalize = (option: WhatIfOption): WhatIfOption => ({
    title: option.title.trim(),
    durationMinutes: option.durationMinutes,
  });
  const options: [WhatIfOption, WhatIfOption] = [
    normalize(input.options[0]),
    normalize(input.options[1]),
  ];
  if (
    options.some(
      (option) =>
        !option.title ||
        option.title.length > 120 ||
        !Number.isInteger(option.durationMinutes) ||
        option.durationMinutes < 5 ||
        option.durationMinutes > 720,
    )
  )
    throw new Error('Введите два названия до 120 символов и длительность от 5 до 720 минут.');

  const outstanding = snapshot.actions.filter((action) => action.status !== 'completed');
  const schedule = buildTimeScheduleDay(input.date, outstanding, null);
  const planActions = [...schedule.timed, ...schedule.untimed];
  const startMinute = currentLocalMinute(
    input.now,
    input.timeZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
  );
  const sleepAt = nextBedtime(snapshot, input.now);
  const project = (option: WhatIfOption): WhatIfOptionResult => {
    const finish = new Date(input.now.getTime() + option.durationMinutes * MINUTE_MS);
    const overlapping = schedule.timed.filter(
      (action) =>
        action.scheduledStartMinute! < startMinute + option.durationMinutes &&
        action.scheduledStartMinute! + action.scheduledDurationMinutes! > startMinute,
    );
    return {
      ...option,
      finishAt: finish.toISOString(),
      overlappingActionCount: overlapping.length,
      overlappingActionTitles: overlapping.slice(0, 3).map((action) => action.title.toString()),
      sleepOverrunMinutes: sleepAt
        ? Math.max(0, Math.ceil((finish.getTime() - sleepAt.getTime()) / MINUTE_MS))
        : null,
    };
  };
  const mapped: [WhatIfOptionResult, WhatIfOptionResult] = [
    project(options[0]),
    project(options[1]),
  ];
  const plan = {
    actionCount: planActions.length,
    knownMinutes: schedule.plannedMinutes,
    unknownEstimateCount: schedule.unknownEstimateCount,
  };
  const facts = [
    'Сценарий «Что будет, если?»: оба варианта начинаются сейчас; данные не изменены.',
    `Время расчёта: ${input.now.toISOString()}.`,
    `Вариант А: ${mapped[0].title}; ${mapped[0].durationMinutes} мин; завершение: ${mapped[0].finishAt}.`,
    `Вариант А: пересечений с действиями по времени: ${mapped[0].overlappingActionCount}; превышение планового сна: ${mapped[0].sleepOverrunMinutes === null ? 'неизвестно' : `${mapped[0].sleepOverrunMinutes} мин`}.`,
    `Вариант Б: ${mapped[1].title}; ${mapped[1].durationMinutes} мин; завершение: ${mapped[1].finishAt}.`,
    `Вариант Б: пересечений с действиями по времени: ${mapped[1].overlappingActionCount}; превышение планового сна: ${mapped[1].sleepOverrunMinutes === null ? 'неизвестно' : `${mapped[1].sleepOverrunMinutes} мин`}.`,
    `Невыполненных действий сегодня: ${plan.actionCount}; известная нагрузка: ${plan.knownMinutes} мин; без оценки: ${plan.unknownEstimateCount}.`,
    sleepAt
      ? `Ближайший плановый отход ко сну: ${sleepAt.toISOString()} (${snapshot.sleep!.settings!.timeZone}).`
      : 'Сон не настроен; влияние на сон неизвестно.',
    'Расчёт не учитывает перерывы и не предсказывает результат или самочувствие.',
  ];
  const sources: AiSource[] = [];
  for (const action of planActions) {
    const source: AiSource = {
      id: action.id.toString().slice(0, 160),
      kind: 'actions',
      title: action.title.toString().slice(0, 200),
      date: input.date,
      detail:
        action.scheduledStartMinute === null
          ? `Без времени; оценка: ${action.estimateMinutes ?? 'нет'} мин`
          : `Начало: ${String(Math.floor(action.scheduledStartMinute / 60)).padStart(2, '0')}:${String(action.scheduledStartMinute % 60).padStart(2, '0')}; длительность: ${action.scheduledDurationMinutes} мин`,
    };
    if (
      sources.length >= 24 ||
      encoder.encode(JSON.stringify({ facts, sources: [...sources, source] })).byteLength > 16_000
    )
      break;
    sources.push(source);
  }
  return {
    plan,
    startedAt: input.now.toISOString(),
    nextSleepAt: sleepAt?.toISOString() ?? null,
    sleepTimeZone: snapshot.sleep?.settings?.timeZone ?? null,
    options: mapped,
    context: {
      version: 1,
      section: 'today',
      date: input.date,
      period: { start: input.date, end: input.date },
      facts,
      sources,
      omittedCount: planActions.length - sources.length,
    },
  };
}
