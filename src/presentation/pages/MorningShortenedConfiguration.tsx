import { useState, type FormEvent } from 'react';
import { MORNING_SHORTENED_ACTION, type MorningShortenedConfiguration } from '../../domain';

interface MorningShortenedConfigurationProps {
  readonly busy: boolean;
  readonly onApply: (configuration: MorningShortenedConfiguration) => void;
  readonly onCancel: () => void;
}

export function MorningShortenedConfigurationPanel(props: MorningShortenedConfigurationProps) {
  const [configuration, setConfiguration] = useState<MorningShortenedConfiguration>({
    coldShower: MORNING_SHORTENED_ACTION.skip,
    physical: MORNING_SHORTENED_ACTION.shorten,
    mirror: MORNING_SHORTENED_ACTION.keep,
  });

  function submit(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    props.onApply(configuration);
  }

  return (
    <form className="morning-shortened-config" onSubmit={submit} aria-busy={props.busy}>
      <header>
        <div>
          <p className="morning-center-eyebrow">Только для этого утра</p>
          <h3>Сократить оставшуюся часть</h3>
        </div>
        <p>Выполненное и текущий подход сохранятся.</p>
      </header>

      <ShortenedChoice
        legend="Холодный душ"
        name="morning-shortened-shower"
        value={configuration.coldShower}
        options={[
          [MORNING_SHORTENED_ACTION.keep, 'Оставить'],
          [MORNING_SHORTENED_ACTION.skip, 'Пропустить'],
        ]}
        onChange={(coldShower) => setConfiguration({ ...configuration, coldShower })}
      />
      <ShortenedChoice
        legend="Физическая активность"
        name="morning-shortened-physical"
        value={configuration.physical}
        options={[
          [MORNING_SHORTENED_ACTION.keep, 'Оставить'],
          [MORNING_SHORTENED_ACTION.shorten, 'Сократить'],
          [MORNING_SHORTENED_ACTION.skip, 'Пропустить'],
        ]}
        onChange={(physical) => setConfiguration({ ...configuration, physical })}
      />
      <ShortenedChoice
        legend="Настрой перед зеркалом"
        name="morning-shortened-mirror"
        value={configuration.mirror}
        options={[
          [MORNING_SHORTENED_ACTION.keep, 'Оставить'],
          [MORNING_SHORTENED_ACTION.skip, 'Пропустить'],
        ]}
        onChange={(mirror) => setConfiguration({ ...configuration, mirror })}
      />

      <p className="morning-shortened-fixed-note">
        Главное действие и переход в рабочий блок остаются без изменений.
      </p>
      <div className="morning-shortened-actions">
        <button className="primary-button" type="submit" disabled={props.busy}>
          {props.busy ? 'Применяем…' : 'Применить сокращение'}
        </button>
        <button
          className="secondary-button"
          type="button"
          disabled={props.busy}
          onClick={props.onCancel}
        >
          Отмена
        </button>
      </div>
    </form>
  );
}

function ShortenedChoice<T extends string>(props: {
  readonly legend: string;
  readonly name: string;
  readonly value: T;
  readonly options: readonly (readonly [T, string])[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <fieldset className="morning-shortened-choice">
      <legend>{props.legend}</legend>
      <div>
        {props.options.map(([value, label]) => (
          <label key={value}>
            <input
              type="radio"
              name={props.name}
              value={value}
              checked={props.value === value}
              onChange={() => props.onChange(value)}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
