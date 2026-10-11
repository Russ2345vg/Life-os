import { useState } from 'react';
import type { AutopilotSetup } from '../../application/planner/DayAutopilotService';
import type {
  AutopilotPreferences,
  AutopilotDayDraft,
} from '../../domain/planner/AutopilotPreferences';
import {
  applyAutopilotTemplate,
  captureAutopilotTemplate,
  type AutopilotActionRule,
} from '../../domain/planner/AutopilotOrganization';

export function AutopilotOrganizationForm({
  setup,
  preferences,
  draft,
  busy,
  onPreferences,
  onDraft,
  onPersist,
}: {
  readonly setup: AutopilotSetup;
  readonly preferences: AutopilotPreferences;
  readonly draft: AutopilotDayDraft;
  readonly busy: boolean;
  readonly onPreferences: (value: AutopilotPreferences) => void;
  readonly onDraft: (value: AutopilotDayDraft) => void;
  readonly onPersist: (value: AutopilotPreferences) => Promise<boolean>;
}) {
  const [templateId, setTemplateId] = useState('');
  const [name, setName] = useState('');
  const [actionId, setActionId] = useState('');
  const [message, setMessage] = useState('');
  const directions = setup.catalog.directions.filter((item) => item.status === 'active');
  const actions = setup.catalog.actions.filter((item) => !item.isDeleted() && !item.isArchived());
  const balance = preferences.balance ?? [];
  const templates = preferences.templates ?? [];
  const rules = preferences.actionRules ?? [];
  const rule: AutopilotActionRule = rules.find((item) => item.actionId === actionId) ?? {
    actionId,
    context: null,
    prerequisiteIds: [],
  };
  const updateRule = (next: AutopilotActionRule) =>
    onPreferences({
      ...preferences,
      actionRules: [...rules.filter((item) => item.actionId !== next.actionId), next],
    });
  const persist = async (next: AutopilotPreferences, success: string) => {
    setMessage('');
    onPreferences(next);
    if (await onPersist(next)) setMessage(success);
  };
  return (
    <details className="autopilot-form__organization">
      <summary>Баланс, шаблоны и порядок дел</summary>
      <div className="autopilot-organization">
        <fieldset disabled={busy}>
          <legend>Шаблоны дня</legend>
          <label>
            Шаблон дня
            <select
              value={templateId}
              onChange={(event) => {
                setTemplateId(event.target.value);
                setMessage('');
                const template = templates.find((item) => item.id === event.target.value);
                if (!template) {
                  setName('');
                  return;
                }
                const next = applyAutopilotTemplate(template, preferences, draft);
                onPreferences(next.preferences);
                onDraft(next.draft);
                setName(template.name);
              }}
            >
              <option value="">Текущие настройки</option>
              {templates.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Название шаблона
            <input
              maxLength={80}
              value={name}
              placeholder="Например: День инвестиций"
              onChange={(event) => setName(event.target.value)}
            />
          </label>
          <div className="autopilot-organization__buttons">
            <button
              type="button"
              disabled={!name.trim()}
              onClick={() => {
                const template = captureAutopilotTemplate(
                  crypto.randomUUID(),
                  name,
                  preferences,
                  draft,
                );
                void persist(
                  { ...preferences, templates: [...templates, template] },
                  'Шаблон сохранён.',
                );
              }}
            >
              Сохранить новый шаблон
            </button>
            {templateId && (
              <>
                <button
                  type="button"
                  disabled={!name.trim()}
                  onClick={() => {
                    const template = captureAutopilotTemplate(templateId, name, preferences, draft);
                    void persist(
                      {
                        ...preferences,
                        templates: templates.map((item) =>
                          item.id === templateId ? template : item,
                        ),
                      },
                      'Шаблон обновлён.',
                    );
                  }}
                >
                  Обновить шаблон
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void persist(
                      {
                        ...preferences,
                        templates: templates.filter((item) => item.id !== templateId),
                      },
                      'Шаблон удалён.',
                    );
                    setTemplateId('');
                  }}
                >
                  Удалить шаблон
                </button>
              </>
            )}
          </div>
          <p className="planner-muted">
            Шаблон заполняет настройки и пожелания. Проверьте их перед сборкой плана. Сохраняется на
            этом устройстве.
          </p>
          {message && (
            <p role="status" className="planner-success">
              {message}
            </p>
          )}
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Баланс направлений</legend>
          <p className="planner-muted">
            Доли времени для дел. Подготовка, сон, прогулка и отдых учитываются отдельно. Действия
            неделимы, поэтому итог может отличаться.
          </p>
          {balance.map((item, index) => {
            const title =
              directions.find((direction) => direction.id.toString() === item.directionId)?.name ??
              'Недоступное направление';
            return (
              <div className="autopilot-organization__balance" key={item.directionId}>
                <label>
                  Направление {index + 1}
                  <select
                    value={item.directionId}
                    onChange={(event) =>
                      onPreferences({
                        ...preferences,
                        balance: balance.map((old, i) =>
                          i === index ? { ...old, directionId: event.target.value } : old,
                        ),
                      })
                    }
                  >
                    {!directions.some(
                      (direction) => direction.id.toString() === item.directionId,
                    ) && <option value={item.directionId}>Недоступное направление</option>}
                    {directions.map((direction) => (
                      <option
                        key={direction.id.toString()}
                        value={direction.id.toString()}
                        disabled={balance.some(
                          (old, i) => i !== index && old.directionId === direction.id.toString(),
                        )}
                      >
                        {direction.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Доля: {title}
                  <input
                    type="number"
                    min={1}
                    max={100}
                    value={item.percent}
                    onChange={(event) =>
                      onPreferences({
                        ...preferences,
                        balance: balance.map((old, i) =>
                          i === index ? { ...old, percent: Number(event.target.value) } : old,
                        ),
                      })
                    }
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Убрать направление: ${title}`}
                  onClick={() =>
                    onPreferences({
                      ...preferences,
                      balance: balance.filter((_, i) => i !== index),
                    })
                  }
                >
                  Убрать
                </button>
              </div>
            );
          })}
          <p role="status">
            {balance.length
              ? `Сумма долей: ${balance.reduce((sum, item) => sum + item.percent, 0)}% — нужно 100%.`
              : 'Баланс выключен — используется главный фокус и пожелания.'}
          </p>
          <button
            type="button"
            disabled={
              balance.length >= 12 ||
              !directions.some(
                (direction) =>
                  !balance.some((item) => item.directionId === direction.id.toString()),
              )
            }
            onClick={() => {
              const direction = directions.find(
                (direction) =>
                  !balance.some((item) => item.directionId === direction.id.toString()),
              );
              if (direction)
                onPreferences({
                  ...preferences,
                  balance: [
                    ...balance,
                    { directionId: direction.id.toString(), percent: balance.length ? 20 : 100 },
                  ],
                });
            }}
          >
            Добавить направление
          </button>
        </fieldset>
        <fieldset disabled={busy}>
          <legend>Группировка и зависимости</legend>
          <label className="planner-day-autopilot__toggle">
            <input
              type="checkbox"
              checked={preferences.groupSimilar ?? false}
              onChange={(event) =>
                onPreferences({ ...preferences, groupSimilar: event.target.checked })
              }
            />
            Группировать похожие дела
          </label>
          <p className="planner-muted">
            Общий контекст или направление объединяет дела. Зависимости, баланс, закреплённое время
            и отдых имеют приоритет.
          </p>
          <label>
            Настроить действие
            <select value={actionId} onChange={(event) => setActionId(event.target.value)}>
              <option value="">Выберите действие</option>
              {actions.map((action) => (
                <option key={action.id.toString()} value={action.id.toString()}>
                  {action.title.toString()}
                </option>
              ))}
            </select>
          </label>
          {actionId && (
            <>
              <label>
                Контекст действия
                <input
                  maxLength={80}
                  value={rule.context ?? ''}
                  placeholder="Компьютер, Дом, Поручения или свой"
                  onChange={(event) => updateRule({ ...rule, context: event.target.value || null })}
                />
              </label>
              <label>
                Добавить предшественника
                <select
                  value=""
                  onChange={(event) => {
                    if (event.target.value)
                      updateRule({
                        ...rule,
                        prerequisiteIds: [...rule.prerequisiteIds, event.target.value],
                      });
                  }}
                >
                  <option value="">Выполнить это действие после…</option>
                  {actions
                    .filter(
                      (action) =>
                        action.id.toString() !== actionId &&
                        !rule.prerequisiteIds.includes(action.id.toString()),
                    )
                    .map((action) => (
                      <option key={action.id.toString()} value={action.id.toString()}>
                        {action.title.toString()}
                      </option>
                    ))}
                </select>
              </label>
              <ul className="autopilot-organization__dependencies">
                {rule.prerequisiteIds.map((id) => (
                  <li key={id}>
                    <span>
                      {actions.find((action) => action.id.toString() === id)?.title.toString() ??
                        'Недоступное действие'}
                    </span>
                    <button
                      type="button"
                      aria-label={`Убрать зависимость: ${id}`}
                      onClick={() =>
                        updateRule({
                          ...rule,
                          prerequisiteIds: rule.prerequisiteIds.filter((value) => value !== id),
                        })
                      }
                    >
                      Убрать
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          {rules.length > 0 && (
            <ul className="autopilot-organization__dependencies">
              {rules.map((item) => (
                <li key={item.actionId}>
                  <span>
                    {actions
                      .find((action) => action.id.toString() === item.actionId)
                      ?.title.toString() ?? 'Недоступное действие'}{' '}
                    · {item.context ?? 'Без контекста'} · зависимостей:{' '}
                    {item.prerequisiteIds.length}
                  </span>
                  <button
                    type="button"
                    aria-label={`Сбросить правила: ${item.actionId}`}
                    onClick={() =>
                      onPreferences({
                        ...preferences,
                        actionRules: rules.filter((rule) => rule.actionId !== item.actionId),
                      })
                    }
                  >
                    Сбросить
                  </button>
                </li>
              ))}
            </ul>
          )}
        </fieldset>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            void persist(preferences, 'Настройки организации сохранены.');
          }}
        >
          Сохранить настройки организации
        </button>
      </div>
    </details>
  );
}
