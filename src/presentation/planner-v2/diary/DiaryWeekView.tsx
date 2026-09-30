import type { DiaryRatingSummary } from '../../../application';
import type { DiaryWeekPayload } from '../../../domain';
import { VoiceTextArea } from '../../voice-input/VoiceTextArea';
import type { DiarySaveStatus } from './DiaryDayView';
import { DiarySummaryCards } from './DiarySummaryCards';
import type { DiaryMemoryField } from '../../../domain/memory';
import { DiaryMemoryButton } from './DiaryMemoryButton';

export function DiaryWeekView({
  payload,
  summary,
  completedActions,
  goalsWithRecords,
  status,
  disabled = false,
  onChange,
  onComplete,
  onMemory,
}: {
  readonly payload: DiaryWeekPayload;
  readonly summary: DiaryRatingSummary;
  readonly completedActions: number;
  readonly goalsWithRecords: number;
  readonly status: DiarySaveStatus;
  readonly disabled?: boolean;
  readonly onChange: (payload: DiaryWeekPayload) => void;
  readonly onComplete: () => void;
  readonly onMemory?: ((field: DiaryMemoryField) => void) | undefined;
}) {
  const questions = [
    ['learned', 'Чему я научился за эту неделю?'],
    ['biggestAchievement', 'Какое моё самое большое достижение за неделю?'],
    ['memorableMoments', 'Какие моменты были самыми запоминающимися и почему?'],
    ['energyReflection', 'Что давало силы, а что забирало?'],
    ['nextWeek', 'Что хочу перенести в следующую неделю?'],
  ] as const;
  const canComplete = questions.some(([field]) => Boolean(payload[field]?.trim()));
  return (
    <div className="planner-diary-period-layout">
      <DiarySummaryCards
        title="Сводка недели"
        summary={summary}
        completedActions={completedActions}
        goalsWithRecords={goalsWithRecords}
      />
      <section
        className="planner-diary-card planner-diary-reflection"
        aria-labelledby="diary-week-heading"
      >
        <h2 id="diary-week-heading">Итоги недели</h2>
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
          label="Завершить неделю"
          onComplete={onComplete}
        />
      </section>
    </div>
  );
}

export function ReflectionActions({
  status,
  disabled,
  label,
  onComplete,
}: {
  readonly status: DiarySaveStatus;
  readonly disabled: boolean;
  readonly label: string;
  readonly onComplete: () => void;
}) {
  return (
    <div className="planner-diary-actions">
      <span role="status">
        {status === 'saving'
          ? 'Сохраняем…'
          : status === 'failed'
            ? 'Не удалось сохранить'
            : status === 'completed'
              ? 'Итоги завершены'
              : 'Все изменения сохранены'}
      </span>
      <button className="planner-primary" type="button" disabled={disabled} onClick={onComplete}>
        {label}
      </button>
    </div>
  );
}
