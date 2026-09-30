import type { DiaryDayPayload } from '../../../domain';
import { VoiceTextArea } from '../../voice-input/VoiceTextArea';
import { DiaryRatingScale } from './DiaryRatingScale';
import type { DiaryMemoryField } from '../../../domain/memory';
import { DiaryMemoryButton } from './DiaryMemoryButton';

export type DiarySaveStatus = 'saved' | 'saving' | 'failed' | 'completed';

export function DiaryDayView({
  payload,
  status,
  disabled = false,
  onChange,
  onComplete,
  onMemory,
}: {
  readonly payload: DiaryDayPayload;
  readonly status: DiarySaveStatus;
  readonly disabled?: boolean;
  readonly onChange: (payload: DiaryDayPayload) => void;
  readonly onComplete: () => void;
  readonly onMemory?: ((field: DiaryMemoryField) => void) | undefined;
}) {
  const rating = (field: 'productivity' | 'energy' | 'mood' | 'overall', label: string) => (
    <DiaryRatingScale
      label={label}
      value={payload[field]}
      disabled={disabled}
      onChange={(value) => onChange({ ...payload, [field]: value })}
    />
  );
  const text = (
    field: 'worldBetter' | 'energyReflection' | 'tomorrowReflection' | 'note',
    label: string,
    rows = 3,
  ) => (
    <div className="planner-diary-question">
      <label>
        <span>{label}</span>
        <VoiceTextArea
          value={payload[field] ?? ''}
          disabled={disabled}
          onValueChange={(value) => onChange({ ...payload, [field]: value })}
          maxLength={field === 'note' ? 12_000 : 4_000}
          rows={rows}
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
  );
  const canComplete = [payload.productivity, payload.energy, payload.mood, payload.overall].every(
    (value) => value !== null,
  );
  return (
    <section className="planner-diary-entry" aria-labelledby="diary-day-heading">
      <div className="planner-diary-card">
        <h2 id="diary-day-heading">Как прошёл день?</h2>
        <div className="planner-diary-ratings">
          {rating('productivity', 'Продуктивность')}
          {rating('energy', 'Энергия')}
          {rating('mood', 'Настроение')}
          {rating('overall', 'Общая оценка дня')}
        </div>
      </div>
      <div className="planner-diary-card planner-diary-questions">
        <h2>Короткая рефлексия</h2>
        {text('worldBetter', 'Что я сделал сегодня, чтобы мир стал лучше?')}
        {text('energyReflection', 'Что давало силы, а что забирало?')}
        {text('tomorrowReflection', 'Что хочу повторить или сделать иначе завтра?')}
        {text('note', 'Свободная заметка', 5)}
      </div>
      <div className="planner-diary-actions">
        <span role="status">
          {status === 'saving'
            ? 'Сохраняем…'
            : status === 'failed'
              ? 'Не удалось сохранить'
              : status === 'completed'
                ? 'День завершён'
                : 'Все изменения сохранены'}
        </span>
        <button
          className="planner-primary"
          type="button"
          disabled={disabled || !canComplete || status === 'saving'}
          onClick={onComplete}
        >
          Завершить день
        </button>
      </div>
    </section>
  );
}
