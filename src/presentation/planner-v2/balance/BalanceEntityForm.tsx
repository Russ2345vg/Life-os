import { useState } from 'react';
import { useQuickAccessDraft } from '../QuickAccessContext';
import { EntityId, type Sphere, type Direction } from '../../../domain';
import type { BalanceServices } from '../../../application/balance/BalanceServices';
import type { BalanceImportance, DirectionMode } from '../../../domain/balance/BalanceImportance';
import type { DirectionStatus } from '../../../domain/direction/DirectionStatus';
import { VoiceField } from '../../voice-input/VoiceField';
import { VoiceTextInput } from '../../voice-input/VoiceTextInput';
import { VoiceTextArea } from '../../voice-input/VoiceTextArea';
import { scoreLabel } from './BalanceLabels';
import { BalanceForm, ImportanceField, ScoreField } from './BalanceFormParts';

export function BalanceEntityForm({
  kind,
  entity,
  sphereId,
  spheres,
  services,
  onSaved,
  onCancel,
  scoreContext = null,
}: {
  readonly kind: 'sphere' | 'direction';
  readonly scoreContext?: { readonly automaticScore: number | null } | null;
  readonly entity: Sphere | Direction | null;
  readonly sphereId: string | null;
  readonly spheres: readonly Sphere[];
  readonly services: BalanceServices;
  readonly onSaved: () => Promise<void>;
  readonly onCancel: () => void;
}) {
  const direction = entity && 'mode' in entity ? entity : null,
    sphere = entity && 'desiredLevel' in entity ? entity : null;
  const [expectedVersion] = useState(entity?.version ?? 0);
  const [name, setName] = useState(entity?.name ?? ''),
    [need, setNeed] = useState(direction?.need ?? ''),
    [description, setDescription] = useState(entity?.description ?? ''),
    [importance, setImportance] = useState<BalanceImportance>(entity?.importance ?? 'normal'),
    [manual, setManual] = useState(entity?.manualScore?.toString() ?? ''),
    [desired, setDesired] = useState(sphere?.desiredLevel?.toString() ?? ''),
    [include, setInclude] = useState(sphere?.includeInBalanceWheel ?? false),
    [owner, setOwner] = useState(direction?.sphereId?.toString() ?? sphereId ?? ''),
    [current, setCurrent] = useState(direction?.currentStateText ?? ''),
    [future, setFuture] = useState(direction?.desiredState ?? ''),
    [mode, setMode] = useState<DirectionMode>(direction?.mode ?? 'develop'),
    [status, setStatus] = useState<DirectionStatus>(direction?.status ?? 'active');
  useQuickAccessDraft(
    {
      name,
      description,
      ...(kind === 'direction' ? { need } : {}),
      importance,
      manual,
      desired,
      include,
      owner,
      current,
      future,
      mode,
      status,
    },
    false,
  );
  const save = async () => {
    const common = {
      name,
      description,
      ...(kind === 'direction' ? { need } : {}),
      importance,
      manualScore: manual === '' ? null : Number(manual),
    };
    const result =
      kind === 'sphere'
        ? sphere
          ? await services.updateSphere.execute({
              ...common,
              id: sphere.id,
              expectedVersion,
              desiredLevel: desired === '' ? null : Number(desired),
              includeInBalanceWheel: include,
            })
          : await services.createSphere.execute({
              ...common,
              desiredLevel: desired === '' ? null : Number(desired),
              includeInBalanceWheel: include,
            })
        : direction
          ? await services.updateDirection.execute({
              ...common,
              need,
              id: direction.id,
              expectedVersion,
              sphereId: owner ? EntityId.create(owner) : null,
              currentStateText: current,
              desiredState: future,
              mode,
              status,
            })
          : await services.createDirection.execute({
              ...common,
              need,
              sphereId: owner ? EntityId.create(owner) : null,
              currentStateText: current,
              desiredState: future,
              mode,
            });
    if (!result.ok) throw result.error;
    await onSaved();
  };
  const fields = (
    <>
      <VoiceField>
        <span>Название</span>
        <VoiceTextInput
          id="balance-entity-name"
          value={name}
          onValueChange={setName}
          required
          maxLength={120}
          autoFocus={!scoreContext}
        />
      </VoiceField>
      {kind === 'direction' && (
        <label>
          <span>Сфера</span>
          <select value={owner} onChange={(e) => setOwner(e.target.value)}>
            <option value="">Без сферы</option>
            {spheres.map((s) => (
              <option value={s.id.toString()} key={s.id.toString()}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      )}
      <VoiceField>
        <span>Описание</span>
        <VoiceTextArea
          id="balance-description"
          value={description}
          onValueChange={setDescription}
          maxLength={kind === 'sphere' ? 500 : 2000}
          placeholder={kind === 'sphere' ? 'Что входит в эту сферу?' : 'Что вы хотите развивать?'}
        />
      </VoiceField>
      {kind === 'sphere' && !scoreContext && (
        <ScoreField label="Желаемый уровень · 0–10" value={desired} onChange={setDesired} />
      )}
      <details open={entity !== null}>
        <summary>Дополнительные настройки</summary>
        <div className="balance-fields">
          {kind === 'direction' && (
            <>
              <VoiceField>
                <span>Потребность</span>
                <VoiceTextInput
                  id="balance-direction-need"
                  value={need}
                  onValueChange={setNeed}
                  maxLength={500}
                  placeholder="Какую потребность поддерживает направление"
                />
              </VoiceField>
              <VoiceField>
                <span>Текущее состояние</span>
                <VoiceTextArea
                  id="balance-current-state"
                  value={current}
                  onValueChange={setCurrent}
                  maxLength={2000}
                />
              </VoiceField>
              <VoiceField>
                <span>Желаемое состояние</span>
                <VoiceTextArea
                  id="balance-desired-state"
                  value={future}
                  onValueChange={setFuture}
                  maxLength={2000}
                />
              </VoiceField>
              <label>
                <span>Режим</span>
                <select value={mode} onChange={(e) => setMode(e.target.value as DirectionMode)}>
                  <option value="develop">Развиваю</option>
                  <option value="maintain">Поддерживаю</option>
                </select>
              </label>
              {direction && (
                <label>
                  <span>Статус</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as DirectionStatus)}
                  >
                    <option value="active">Активно</option>
                    <option value="paused">На паузе</option>
                    <option value="archived">В архиве</option>
                  </select>
                </label>
              )}
            </>
          )}
          <ImportanceField value={importance} onChange={setImportance} />
          {!scoreContext && (
            <>
              <ScoreField label="Ручная оценка · 0–10" value={manual} onChange={setManual} />
              <p className="planner-muted">Пустая ручная оценка включает автоматический расчёт.</p>
            </>
          )}
          {kind === 'sphere' && (
            <>
              <label className="balance-check">
                <input
                  type="checkbox"
                  checked={include}
                  onChange={(e) => setInclude(e.target.checked)}
                />
                Включить в колесо
              </label>
            </>
          )}
        </div>
      </details>
    </>
  );
  return (
    <BalanceForm
      title={
        sphere && scoreContext
          ? `Оценить «${sphere.name}»`
          : entity
            ? 'Редактирование'
            : kind === 'sphere'
              ? 'Новая сфера'
              : 'Новое направление'
      }
      onSave={save}
      onCancel={onCancel}
    >
      {sphere && scoreContext ? (
        <>
          <ScoreField label="Ручная оценка · 0–10" value={manual} onChange={setManual} />
          <p className="planner-muted">
            Введённая оценка заменит автоматический расчёт для этой сферы. Оставьте поле пустым,
            чтобы использовать автоматический расчёт.
          </p>
          <p className="planner-muted">Автоматически: {scoreLabel(scoreContext.automaticScore)}</p>
          <ScoreField label="Желаемый уровень · 0–10" value={desired} onChange={setDesired} />
          <p className="planner-muted">
            Желаемый уровень нужен для сравнения с текущим состоянием.
          </p>
          <details>
            <summary>Другие параметры сферы</summary>
            {fields}
          </details>
        </>
      ) : (
        fields
      )}
    </BalanceForm>
  );
}
