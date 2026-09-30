import { diaryPeriod, type DayDate, type DiaryPeriodKind } from '../../domain';
import {
  DIARY_MEMORY_FIELDS,
  type DiaryMemoryField,
  type MemoryDiarySource,
  type MemoryDraft,
} from '../../domain/memory';
import { DomainError } from '../../shared/errors/DomainError';
import type { DiaryRepository } from '../ports/DiaryRepository';
import type { MemoryApplicationService } from './MemoryService';

const TITLES: Readonly<Record<DiaryMemoryField, string>> = {
  worldBetter: 'Что я сделал, чтобы мир стал лучше',
  energyReflection: 'Что дало мне энергию',
  tomorrowReflection: 'Мысль на завтра',
  note: 'Момент из дневника',
  learned: 'Чему я научился',
  biggestAchievement: 'Моё достижение',
  memorableMoments: 'Запоминающийся момент',
  nextWeek: 'Решение на неделю',
  learnedAboutSelf: 'Что я узнал о себе',
  energyAndMood: 'Энергия и настроение',
  nextMonth: 'Решение на месяц',
};

export class MemoryDiaryImport {
  public constructor(
    private readonly diary: DiaryRepository,
    private readonly commands: MemoryApplicationService,
  ) {}

  public async prepare(
    kind: DiaryPeriodKind,
    anchor: DayDate,
    field: DiaryMemoryField,
    expectedVersion: number,
  ): Promise<MemoryDraft> {
    if (!this.commands.enabled)
      throw new DomainError('memory.disabled', 'Сохранение воспоминаний пока недоступно.');
    if (!DIARY_MEMORY_FIELDS[kind].includes(field))
      throw new DomainError('memory.invalid_source_field', 'Выберите ответ дневника.');
    const entry = await this.diary.findByPeriodKey(diaryPeriod(kind, anchor).periodKey);
    if (!entry || entry.version !== expectedVersion)
      throw new DomainError(
        'memory.source_conflict',
        'Ответ дневника изменился. Сохраните его и повторите перенос.',
      );
    const payload: object = entry.payload;
    const text: unknown = Reflect.get(payload, field);
    if (typeof text !== 'string' || !text.trim())
      throw new DomainError('memory.source_empty', 'Сначала сохраните ответ в дневнике.');
    if (text.trim().length > 10000)
      throw new DomainError(
        'memory.source_too_long',
        'В ответе больше 10 000 символов. Сократите его или создайте воспоминание вручную.',
      );
    const draft = this.commands.prepareCreate();
    return {
      ...draft,
      occurredOn:
        kind === 'day'
          ? entry.periodStart
          : entry.periodEnd.isAfter(draft.occurredOn)
            ? draft.occurredOn
            : entry.periodEnd,
      title: TITLES[field],
      body: text.trim(),
      kind:
        field === 'biggestAchievement'
          ? 'achievement'
          : field === 'learned' || field === 'learnedAboutSelf'
            ? 'insight'
            : 'moment',
      diarySource: {
        entryId: entry.id.toString(),
        kind,
        periodStart: entry.periodStart.toString(),
        field,
        version: entry.version,
      },
    };
  }

  public async sourceStatus(
    source: MemoryDiarySource,
  ): Promise<'available' | 'changed' | 'missing'> {
    const entry = await this.diary.findByPeriodKey(`${source.kind}:${source.periodStart}`);
    return !entry ? 'missing' : entry.version === source.version ? 'available' : 'changed';
  }
}
