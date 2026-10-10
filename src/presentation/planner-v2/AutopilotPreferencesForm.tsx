import type { FormEvent } from 'react';
import type { AutopilotSetup } from '../../application/planner/DayAutopilotService';
import type {
  AutopilotPreferences,
  AutopilotDayDraft,
  AutopilotReference,
} from '../../domain/planner/AutopilotPreferences';
import {
  autopilotReferenceTitle,
  isAutopilotOpenAction,
} from '../../domain/planner/AutopilotSelection';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import { clockTime } from './timePresentation';

export function AutopilotPreferencesForm({
  setup,
  preferences,
  draft,
  busy,
  rebuild,
  onPreferences,
  onDraft,
  onRebuild,
  onBuild,
}: {
  readonly setup: AutopilotSetup;
  readonly preferences: AutopilotPreferences;
  readonly draft: AutopilotDayDraft;
  readonly busy: boolean;
  readonly rebuild: boolean;
  readonly onPreferences: (value: AutopilotPreferences) => void;
  readonly onDraft: (value: AutopilotDayDraft) => void;
  readonly onRebuild: (value: boolean) => void;
  readonly onBuild: () => void;
}) {
  const focusValue = preferences.focus ? JSON.stringify(preferences.focus) : '';
  const directions = setup.catalog.directions.filter((item) => item.status === 'active');
  const goals = setup.catalog.goals.filter((item) => item.status === 'active' && !item.isDeleted());
  const allReferences: AutopilotReference[] = [
    ...directions.map((item) => ({ kind: 'direction' as const, id: item.id.toString() })),
    ...goals.map((item) => ({ kind: 'goal' as const, id: item.id.toString() })),
    ...setup.catalog.actions
      .filter(isAutopilotOpenAction)
      .map((item) => ({ kind: 'action' as const, id: item.id.toString() })),
  ];
  const changeTime = (key: 'startMinute' | 'endMinute' | 'activeWalkEndMinute', value: string) =>
    onDraft({ ...draft, [key]: parseTime(value) });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    onBuild();
  };
  return (
    <form className="autopilot-form" onSubmit={submit}>
      <div className="autopilot-form__focus">
        <label>
          Главный фокус
          <select
            disabled={busy}
            value={focusValue}
            onChange={(event) =>
              onPreferences({
                ...preferences,
                focus: event.target.value
                  ? (JSON.parse(event.target.value) as AutopilotPreferences['focus'])
                  : null,
              })
            }
          >
            <option value="">Не выбран — дела на этот день</option>
            {preferences.focus &&
            !(preferences.focus.kind === 'direction'
              ? directions.some((item) => item.id.toString() === preferences.focus?.id)
              : goals.some((item) => item.id.toString() === preferences.focus?.id)) ? (
              <option disabled value={focusValue}>
                Фокус недоступен — выберите новый
              </option>
            ) : null}
            <optgroup label="Направления">
              {directions.map((item) => (
                <option
                  key={item.id.toString()}
                  value={JSON.stringify({ kind: 'direction', id: item.id.toString() })}
                >
                  {item.name}
                </option>
              ))}
            </optgroup>
            <optgroup label="Цели">
              {goals.map((item) => (
                <option
                  key={item.id.toString()}
                  value={JSON.stringify({ kind: 'goal', id: item.id.toString() })}
                >
                  {item.title}
                  {item.directionId
                    ? ` · ${directions.find((direction) => direction.id.equals(item.directionId!))?.name ?? 'Направление'}`
                    : ''}
                </option>
              ))}
            </optgroup>
          </select>
        </label>
        <p className="planner-muted">
          Фокус сохраняется на этом устройстве. Автопилот подбирает дела из всего списка, включая
          импортированные планы.
        </p>
      </div>
      <VoiceField>
        <span>Пожелания на день</span>
        <VoiceTextArea
          rows={3}
          value={draft.wishes}
          disabled={busy}
          placeholder="Например: инвестиции; порядок дома"
          onValueChange={(wishes) => onDraft({ ...draft, wishes, wishReferences: [] })}
        />
      </VoiceField>
      {draft.wishes === setup.draft.value.wishes &&
        setup.wishResolution.unresolved.map((item) => (
          <div className="autopilot-form__resolve" key={item.text}>
            <label>
              Уточнить «{item.text}»
              <select
                disabled={busy}
                value=""
                onChange={(event) => {
                  if (!event.target.value) return;
                  const reference = JSON.parse(event.target.value) as AutopilotReference;
                  onDraft({
                    ...draft,
                    wishes: draft.wishes.replace(
                      item.text,
                      autopilotReferenceTitle(reference, setup.catalog),
                    ),
                    wishReferences: [
                      ...draft.wishReferences.filter(
                        (old) => old.kind !== reference.kind || old.id !== reference.id,
                      ),
                      reference,
                    ],
                  });
                }}
              >
                <option value="">Выберите направление, цель или действие</option>
                {(item.candidates.length ? item.candidates : allReferences).map((reference) => (
                  <option key={JSON.stringify(reference)} value={JSON.stringify(reference)}>
                    {autopilotReferenceTitle(reference, setup.catalog)} ·{' '}
                    {reference.kind === 'action'
                      ? 'Действие'
                      : reference.kind === 'goal'
                        ? 'Цель'
                        : 'Направление'}
                  </option>
                ))}
              </select>
            </label>
            <p className="planner-muted">
              Пожелание пока не распознано однозначно. Можно также изменить текст.
            </p>
          </div>
        ))}
      <div className="autopilot-form__range">
        <label>
          Начать с
          <input
            type="time"
            required
            step={300}
            disabled={busy}
            value={inputTime(draft.startMinute)}
            onChange={(event) => changeTime('startMinute', event.target.value)}
          />
        </label>
        <label>
          Закончить до
          <input
            type="time"
            required
            step={300}
            disabled={busy}
            value={inputTime(draft.endMinute)}
            onChange={(event) => changeTime('endMinute', event.target.value)}
          />
        </label>
      </div>
      {draft.endMinute === null &&
      setup.suggestedEndMinute !== null &&
      setup.suggestedEndMinute < 1440 ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => onDraft({ ...draft, endMinute: setup.suggestedEndMinute })}
        >
          Использовать доступное время: до {clockTime(setup.suggestedEndMinute)}
        </button>
      ) : null}
      <details className="autopilot-form__routine" open={!setup.sleepConfigured}>
        <summary>Распорядок и отдых</summary>
        <p className="planner-muted">
          {setup.sleepConfigured
            ? 'Подъём и отбой взяты из режима сна, даже если будильник выключен.'
            : 'Режим сна не настроен. Укажите подъём и отбой для этого устройства.'}{' '}
          Время: {setup.timeZone}.
        </p>
        {!setup.sleepConfigured && (
          <div className="autopilot-form__range">
            <label>
              Подъём
              <input
                type="time"
                required
                disabled={busy}
                value={inputTime(preferences.manualWakeMinute)}
                onChange={(event) =>
                  onPreferences({ ...preferences, manualWakeMinute: parseTime(event.target.value) })
                }
              />
            </label>
            <label>
              Отбой
              <input
                type="time"
                required
                disabled={busy}
                value={inputTime(preferences.manualBedtimeMinute)}
                onChange={(event) =>
                  onPreferences({
                    ...preferences,
                    manualBedtimeMinute: parseTime(event.target.value),
                  })
                }
              />
            </label>
          </div>
        )}
        <div className="autopilot-form__range">
          <label>
            Утренняя подготовка, мин
            <input
              type="number"
              min={1}
              max={1440}
              required
              disabled={busy}
              value={preferences.morningMinutes}
              onChange={(event) =>
                onPreferences({ ...preferences, morningMinutes: Number(event.target.value) })
              }
            />
          </label>
          <label>
            Вечерняя подготовка, мин
            <input
              type="number"
              min={1}
              max={1440}
              required
              disabled={busy}
              value={preferences.eveningMinutes}
              onChange={(event) =>
                onPreferences({ ...preferences, eveningMinutes: Number(event.target.value) })
              }
            />
          </label>
        </div>
        <label className="planner-day-autopilot__toggle">
          <input
            type="checkbox"
            disabled={busy}
            checked={preferences.walk.enabled}
            onChange={(event) =>
              onPreferences({
                ...preferences,
                walk: { ...preferences.walk, enabled: event.target.checked },
              })
            }
          />
          <span>Предусмотреть прогулку</span>
        </label>
        {preferences.walk.enabled && (
          <div className="autopilot-form__range">
            <label>
              Начало прогулки
              <input
                type="time"
                disabled={busy}
                value={inputTime(preferences.walk.startMinute)}
                onChange={(event) =>
                  onPreferences({
                    ...preferences,
                    walk: { ...preferences.walk, startMinute: parseTime(event.target.value) },
                  })
                }
              />
            </label>
            <label>
              Прогулка, мин
              <input
                type="number"
                min={1}
                max={1440}
                required
                disabled={busy}
                value={preferences.walk.minutes}
                onChange={(event) =>
                  onPreferences({
                    ...preferences,
                    walk: { ...preferences.walk, minutes: Number(event.target.value) },
                  })
                }
              />
            </label>
          </div>
        )}
        <label>
          Окончание текущей прогулки, если время неизвестно
          <input
            type="time"
            disabled={busy}
            value={inputTime(draft.activeWalkEndMinute)}
            onChange={(event) => changeTime('activeWalkEndMinute', event.target.value)}
          />
        </label>
        <label>
          Максимум дел
          <input
            type="number"
            min={1}
            max={12}
            required
            disabled={busy}
            value={preferences.maxActions}
            onChange={(event) =>
              onPreferences({ ...preferences, maxActions: Number(event.target.value) })
            }
          />
        </label>
        <p className="planner-muted">
          Перерывы берутся из настроек помодоро. Прогулка заменяет перерыв; сон и подготовка
          сохраняют свои окна.
        </p>
      </details>
      <label className="planner-day-autopilot__toggle">
        <input
          type="checkbox"
          checked={rebuild}
          disabled={busy}
          onChange={(event) => onRebuild(event.target.checked)}
        />
        <span>Пересобрать будущие блоки</span>
      </label>
      <div className="planner-day-autopilot__actions">
        <button className="planner-primary" disabled={busy} type="submit">
          {busy ? 'Собираю…' : 'Собрать мой день'}
        </button>
      </div>
    </form>
  );
}
function inputTime(value: number | null): string {
  return value === null ? '' : clockTime(value);
}
function parseTime(value: string): number | null {
  if (!value) return null;
  const [h, m] = value.split(':').map(Number);
  return h! * 60 + m!;
}
