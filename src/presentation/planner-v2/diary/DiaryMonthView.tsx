import type { DiaryMonthWeekBucket, DiaryRatingSummary } from '../../../application';
import type { DiaryMonthPayload, DiaryWeekEntry } from '../../../domain';
import { VoiceTextArea } from '../../voice-input/VoiceTextArea';
import type { DiarySaveStatus } from './DiaryDayView';
import { DiarySummaryCards } from './DiarySummaryCards';
import { ReflectionActions } from './DiaryWeekView';
import type { DiaryMemoryField } from '../../../domain/memory';
import { DiaryMemoryButton } from './DiaryMemoryButton';

export function DiaryMonthView({
  payload,
  summary,
  weekBuckets,
  weeklyReflections,
  completedActions,
  goalsWithRecords,
  status,
  disabled = false,
  onChange,
  onComplete,
  onMemory,
}: {
  readonly payload: DiaryMonthPayload;
  readonly summary: DiaryRatingSummary;
  readonly weekBuckets: readonly DiaryMonthWeekBucket[];
  readonly weeklyReflections: readonly DiaryWeekEntry[];
  readonly completedActions: number;
  readonly goalsWithRecords: number;
  readonly status: DiarySaveStatus;
  readonly disabled?: boolean;
  readonly onChange: (payload: DiaryMonthPayload) => void;
  readonly onComplete: () => void;
  readonly onMemory?: ((field: DiaryMemoryField) => void) | undefined;
}) {
  const questions = [
    ['biggestAchievement', 'Какое самое важное достижение месяца?'],
    ['learnedAboutSelf', 'Чему я научился и что понял о себе?'],
    ['memorableMoments', 'Какие моменты хочется сохранить и почему?'],
    ['energyAndMood', 'Что влияло на энергию и настроение?'],
    ['nextMonth', 'Какое намерение беру в следующий месяц?'],
  ] as const;
  const canComplete = questions.some(([field]) => Boolean(payload[field]?.trim()));
  const excerpts = weeklyReflections.flatMap((entry) =>
    [
      entry.payload.learned,
      entry.payload.biggestAchievement,
      entry.payload.memorableMoments,
    ].filter((value): value is string => value !== null),
  );
  return (
    <div className="planner-diary-period-layout planner-diary-period-layout--month">
      <div className="planner-diary-month-context">
        <DiarySummaryCards
          title="Сводка месяца"
          summary={summary}
          completedActions={completedActions}
          goalsWithRecords={goalsWithRecords}
        />
        <section className="planner-diary-card planner-diary-weeks" aria-label="Недели месяца">
          <h2>По неделям</h2>
          <ul>
            {weekBuckets.map((bucket) => (
              <li key={bucket.startDate}>
                <span>{bucketLabel(bucket.startDate, bucket.endDate)}</span>
                <strong>
                  {bucket.summary.completedDays} из {bucket.summary.totalDays}
                </strong>
              </li>
            ))}
          </ul>
        </section>
        {excerpts.length > 0 ? (
          <section
            className="planner-diary-card planner-diary-excerpts"
            aria-label="Из недельных итогов"
          >
            <h2>Из недельных итогов</h2>
            {excerpts.map((excerpt, index) => (
              <blockquote key={`${index}:${excerpt}`}>{excerpt}</blockquote>
            ))}
          </section>
        ) : null}
      </div>
      <section
        className="planner-diary-card planner-diary-reflection"
        aria-labelledby="diary-month-heading"
      >
        <h2 id="diary-month-heading">Итоги месяца</h2>
        {questions.map(([field, label]) => (
          <div className="planner-diary-question" key={field}>
            <label>
              <span>{label}</span>
              <VoiceTextArea
                value={payload[field] ?? ''}
                disabled={disabled}
                onValueChange={(value) => onChange({ ...payload, [field]: value })}
                maxLength={4_000}
                rows={3}
              />
            </label>
            <DiaryMemoryButton
              field={field}
              label={label}
              text={payload[field]}
              disabled={disabled}
              onMemory={onMemory}
            />
          </div>
        ))}
        <ReflectionActions
          status={status}
          disabled={disabled || !canComplete || status === 'saving'}
          label="Завершить месяц"
          onComplete={onComplete}
        />
      </section>
    </div>
  );
}

function bucketLabel(start: string, end: string): string {
  const startDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric' }).format(
    new Date(`${start}T12:00:00Z`),
  );
  const endLabel = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(
    new Date(`${end}T12:00:00Z`),
  );
  return `${startDay}–${endLabel}`;
}
