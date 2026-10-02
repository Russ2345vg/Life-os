import { createContext, useContext, useState, type ReactNode } from 'react';
import { VoiceField } from '../voice-input/VoiceField';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { needKey, STARTER_NEEDS, type NeedCatalogEntry } from './needCatalogModel';

const NeedChoices = createContext<readonly string[]>(STARTER_NEEDS);

export function NeedChoicesProvider({
  catalog,
  children,
}: {
  readonly catalog: readonly NeedCatalogEntry[];
  readonly children: ReactNode;
}) {
  return (
    <NeedChoices.Provider value={catalog.map((entry) => entry.title)}>
      {children}
    </NeedChoices.Provider>
  );
}

export function NeedPicker({
  id,
  label = 'Потребность',
  emptyLabel = 'Не выбирать · наследовать от родителя',
  value,
  onValueChange,
  help,
  disabled = false,
}: {
  readonly id: string;
  readonly label?: string;
  readonly emptyLabel?: string;
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly help?: string;
  readonly disabled?: boolean;
}) {
  const catalog = useContext(NeedChoices);
  const [custom, setCustom] = useState(false);
  const choices =
    value && !catalog.some((item) => needKey(item) === needKey(value))
      ? [...catalog, value]
      : catalog;
  const selectedChoice = choices.find((item) => needKey(item) === needKey(value)) ?? value;
  return (
    <div className="planner-need-picker">
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={custom ? '__custom__' : selectedChoice}
        disabled={disabled}
        onChange={(event) => {
          if (event.target.value === '__custom__') {
            setCustom(true);
            onValueChange('');
          } else {
            setCustom(false);
            onValueChange(event.target.value);
          }
        }}
      >
        <option value="">{emptyLabel}</option>
        {choices.map((choice) => (
          <option key={choice} value={choice}>
            {choice}
          </option>
        ))}
        <option value="__custom__">Добавить свою потребность…</option>
      </select>
      {custom && (
        <VoiceField>
          <span>Своя потребность</span>
          <VoiceTextInput
            id={`${id}-custom`}
            value={value}
            onValueChange={onValueChange}
            maxLength={500}
            disabled={disabled}
            placeholder="Как назовёте потребность?"
          />
        </VoiceField>
      )}
      {help && <small className="planner-muted">{help}</small>}
    </div>
  );
}
