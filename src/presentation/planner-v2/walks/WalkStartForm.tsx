import { useState } from 'react';
import type { StartWalkInput } from '../../../application/walk/WalkCommands';
import { PlannerSheet } from '../PlannerSheet';
import { VoiceTextArea } from '../../voice-input/VoiceTextArea';
import type { WalkStateSnapshot } from '../../../domain/walk/WalkStateSnapshot';
import type { PlannerOption } from '../PlannerActionForm';

export const DEFAULT_WALK: Omit<StartWalkInput, 'requestId'> = {
  intent: 'free',
  type: 'restorative',
  mode: 'stopwatch',
  question: null,
  targetMinutes: null,
  sphereId: null,
  beforeState: null,
};
export function WalkStartForm({
  onStart,
  onClose,
  busy,
  error,
  spheres,
}: {
  onStart: (input: Omit<StartWalkInput, 'requestId'>) => void;
  onClose: () => void;
  busy: boolean;
  error: string;
  spheres: readonly PlannerOption[];
}) {
  const [draft, setDraft] = useState(DEFAULT_WALK);
  return (
    <PlannerSheet title="Настроить прогулку" onClose={onClose}>
      <form
        className="walk-form"
        onSubmit={(event) => {
          event.preventDefault();
          onStart(draft);
        }}
      >
        <label>
          Намерение
          <select
            value={draft.intent}
            onChange={(event) =>
              setDraft({
                ...draft,
                intent: event.target.value as StartWalkInput['intent'],
                reflectionTemplate: null,
              })
            }
          >
            <option value="free">Свободно</option>
            <option value="recovery">Восстановиться</option>
            <option value="reflection">Подумать</option>
          </select>
        </label>
        <label>
          Отсчёт времени
          <select
            value={draft.mode}
            onChange={(event) =>
              setDraft({
                ...draft,
                mode: event.target.value as StartWalkInput['mode'],
                targetMinutes: event.target.value === 'timer' ? 20 : null,
              })
            }
          >
            <option value="stopwatch">Без ограничения</option>
            <option value="timer">С ориентиром по времени</option>
          </select>
        </label>
        {draft.mode === 'timer' && (
          <label>
            Минуты
            <input
              type="number"
              min={1}
              max={1440}
              step={1}
              required
              value={draft.targetMinutes ?? ''}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  targetMinutes: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
          </label>
        )}
        <label htmlFor="walk-question">Вопрос — необязательно</label>
        <VoiceTextArea
          id="walk-question"
          value={draft.question ?? ''}
          maxLength={500}
          rows={3}
          onValueChange={(question) => setDraft({ ...draft, question })}
        />
        {draft.intent === 'reflection' && (
          <label>
            Подсказки
            <select
              value={draft.reflectionTemplate ?? 'freeThought'}
              onChange={(event) =>
                setDraft({
                  ...draft,
                  reflectionTemplate: event.target.value as NonNullable<
                    StartWalkInput['reflectionTemplate']
                  >,
                })
              }
            >
              <option value="freeThought">Свободная мысль</option>
              <option value="ownQuestion">Свой вопрос</option>
              <option value="decision">Принять решение</option>
              <option value="problem">Разобраться с проблемой</option>
              <option value="goal">Подумать о цели</option>
              <option value="strategy">Выбрать направление</option>
              <option value="self">Разобраться в себе</option>
              <option value="dailyReview">Итоги дня</option>
              <option value="priorities">Выбрать главное</option>
              <option value="relationships">Отношения</option>
              <option value="ideas">Найти новые идеи</option>
            </select>
          </label>
        )}
        {draft.intent === 'reflection' && draft.reflectionTemplate === 'ownQuestion' && (
          <p>Запишите свой вопрос выше. Во время прогулки появятся универсальные подсказки.</p>
        )}
        <details>
          <summary>Дополнительные параметры</summary>
          <label>
            Тип прогулки
            <select
              value={draft.type}
              onChange={(event) =>
                setDraft({ ...draft, type: event.target.value as StartWalkInput['type'] })
              }
            >
              <option value="restorative">Восстановительная</option>
              <option value="mindful">Внимательная</option>
              <option value="reflection">Размышление</option>
              <option value="physical">Активная</option>
              <option value="phoneFree">Без телефона</option>
            </select>
          </label>
          <label>
            Сфера — необязательно
            <select
              value={draft.sphereId ?? ''}
              onChange={(event) => setDraft({ ...draft, sphereId: event.target.value || null })}
            >
              <option value="">Без сферы</option>
              {spheres.map((sphere) => (
                <option key={sphere.id} value={sphere.id}>
                  {sphere.title}
                </option>
              ))}
            </select>
          </label>
          <WalkRating
            label="Состояние до прогулки"
            value={draft.beforeState}
            onChange={(beforeState) => setDraft({ ...draft, beforeState })}
          />
        </details>
        {error && <p role="alert">{error}</p>}
        <button className="planner-primary" disabled={busy}>
          Начать прогулку
        </button>
      </form>
    </PlannerSheet>
  );
}
export function WalkRating({
  label,
  value,
  onChange,
}: {
  label: string;
  value: WalkStateSnapshot | null;
  onChange: (value: WalkStateSnapshot | null) => void;
}) {
  const [fields, setFields] = useState({
    energy: value?.energy.toString() ?? '',
    tension: value?.tension.toString() ?? '',
    clarity: value?.clarity.toString() ?? '',
  });
  return (
    <fieldset className="walk-rating">
      <legend>{label} — необязательно</legend>
      <p>Для сравнения заполните три оценки. Пустые поля не считаются нулём.</p>
      {(
        [
          ['energy', 'Энергия'],
          ['tension', 'Напряжение'],
          ['clarity', 'Ясность'],
        ] as const
      ).map(([key, text]) => (
        <label key={key}>
          {text}
          <select
            value={fields[key]}
            onChange={(event) => {
              const next = { ...fields, [key]: event.target.value };
              setFields(next);
              onChange(
                Object.values(next).every((v) => v !== '')
                  ? {
                      energy: Number(next.energy),
                      tension: Number(next.tension),
                      clarity: Number(next.clarity),
                    }
                  : null,
              );
            }}
          >
            <option value="">Без оценки</option>
            {Array.from({ length: 11 }, (_, i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </select>
        </label>
      ))}
    </fieldset>
  );
}
