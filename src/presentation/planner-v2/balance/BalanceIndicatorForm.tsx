import { useState } from 'react';
import type { Goal } from '../../../domain';
import type { BalanceServices } from '../../../application/balance/BalanceServices';
import type { IndicatorDraft } from '../../../application/balance/BalanceIndicators';
import type { DirectionIndicator, NumericTarget } from '../../../domain/balance/DirectionIndicator';
import type { BalanceImportance } from '../../../domain/balance/BalanceImportance';
import { VoiceField } from '../../voice-input/VoiceField';
import { VoiceTextInput } from '../../voice-input/VoiceTextInput';
import { BalanceForm, ImportanceField } from './BalanceFormParts';
export function BalanceIndicatorForm({
  indicator,
  directionId,
  goals,
  services,
  onSaved,
  onCancel,
}: {
  readonly indicator: DirectionIndicator | null;
  readonly directionId: string;
  readonly goals: readonly Goal[];
  readonly services: BalanceServices;
  readonly onSaved: () => Promise<void>;
  readonly onCancel: () => void;
}) {
  const [name, setName] = useState(indicator?.name ?? ''),
    [type, setType] = useState(indicator?.type ?? 'rating'),
    [value, setValue] = useState(indicator?.value?.toString() ?? ''),
    [importance, setImportance] = useState<BalanceImportance>(indicator?.importance ?? 'normal'),
    [source, setSource] = useState(indicator?.sourceType ?? 'manual'),
    [goalId, setGoalId] = useState(indicator?.sourceGoalId ?? ''),
    [condition, setCondition] = useState<NumericTarget['kind']>(
      indicator?.target?.kind ?? 'atLeast',
    ),
    [target, setTarget] = useState(
      indicator?.target && 'value' in indicator.target ? String(indicator.target.value) : '',
    ),
    [min, setMin] = useState(
      indicator?.target?.kind === 'range' ? String(indicator.target.min) : '',
    ),
    [max, setMax] = useState(
      indicator?.target?.kind === 'range' ? String(indicator.target.max) : '',
    );
  const compatible = goals.filter((g) => g.measurement);
  return (
    <BalanceForm
      title={indicator ? 'Изменить показатель' : 'Новый показатель'}
      onCancel={onCancel}
      onSave={async () => {
        const common = {
          name,
          importance,
          sourceType: source,
          sourceGoalId: source === 'manual' ? null : goalId,
        };
        const draft: IndicatorDraft =
          source === 'quantitativeGoal'
            ? { ...common, type: 'rating', value: null, target: null }
            : type === 'boolean'
              ? { ...common, type, value: value === '' ? null : value === 'true', target: null }
              : type === 'rating'
                ? { ...common, type, value: value === '' ? null : Number(value), target: null }
                : {
                    ...common,
                    type: 'numeric',
                    value: value === '' ? null : Number(value),
                    target:
                      condition === 'range'
                        ? { kind: 'range', min: Number(min), max: Number(max) }
                        : { kind: condition, value: Number(target) },
                  };
        await services.indicators.save(directionId, draft, indicator);
        await onSaved();
      }}
    >
      <VoiceField>
        <span>Название показателя</span>
        <VoiceTextInput
          id="balance-indicator-name"
          value={name}
          onValueChange={setName}
          required
          maxLength={160}
          autoFocus
        />
      </VoiceField>
      <label>
        <span>Источник</span>
        <select value={source} onChange={(e) => setSource(e.target.value as typeof source)}>
          <option value="manual">Вручную</option>
          <option value="quantitativeGoal">Количественная цель</option>
        </select>
      </label>
      {source === 'quantitativeGoal' ? (
        <label>
          <span>Количественная цель</span>
          <select required value={goalId} onChange={(e) => setGoalId(e.target.value)}>
            <option value="">Выберите цель</option>
            {goalId && !compatible.some((g) => g.id.toString() === goalId) && (
              <option value={goalId}>Источник недоступен</option>
            )}
            {compatible.map((g) => (
              <option key={g.id.toString()} value={g.id.toString()}>
                {g.title}
              </option>
            ))}
          </select>
          <small>Используется текущий прогресс цели, включая её цикл.</small>
        </label>
      ) : (
        <>
          <label>
            <span>Тип</span>
            <select
              value={type}
              onChange={(e) => {
                setType(e.target.value as typeof type);
                setValue('');
              }}
            >
              <option value="rating">Оценка 0–10</option>
              <option value="boolean">Да / Нет</option>
              <option value="numeric">Число</option>
            </select>
          </label>
          {type === 'boolean' ? (
            <label>
              <span>Значение</span>
              <select value={value} onChange={(e) => setValue(e.target.value)}>
                <option value="">Нет данных</option>
                <option value="true">Да</option>
                <option value="false">Нет</option>
              </select>
            </label>
          ) : (
            <label>
              <span>Значение</span>
              <input
                type="number"
                step="any"
                min={type === 'rating' ? 0 : undefined}
                max={type === 'rating' ? 10 : undefined}
                value={value}
                placeholder="Нет данных"
                onChange={(e) => setValue(e.target.value)}
              />
            </label>
          )}
          {type === 'numeric' && (
            <>
              <label>
                <span>Хорошее состояние</span>
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value as typeof condition)}
                >
                  <option value="atLeast">Не меньше</option>
                  <option value="atMost">Не больше</option>
                  <option value="range">В диапазоне</option>
                </select>
              </label>
              {condition === 'range' ? (
                <div className="planner-form-columns">
                  <label>
                    <span>От</span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={min}
                      onChange={(e) => setMin(e.target.value)}
                    />
                  </label>
                  <label>
                    <span>До</span>
                    <input
                      type="number"
                      required
                      min={min || 0}
                      step="any"
                      value={max}
                      onChange={(e) => setMax(e.target.value)}
                    />
                  </label>
                </div>
              ) : (
                <label>
                  <span>Порог</span>
                  <input
                    type="number"
                    required
                    min="0"
                    step="any"
                    value={target}
                    onChange={(e) => setTarget(e.target.value)}
                  />
                </label>
              )}
            </>
          )}
        </>
      )}
      <ImportanceField value={importance} onChange={setImportance} />
    </BalanceForm>
  );
}
