import { useEffect, useRef, useState } from 'react';
import type { WalkServices } from '../../../application/walk/WalkServices';
import type { SunsetWalkSettingsValue } from '../../../application/walk/SunsetWalkSettings';
import type { WalkReminderReceipt } from '../../../application/ports/WalkReminderGateway';
import type { WalkCity } from '../../../domain/walk/SunsetWalkSchedule';
import { sunsetWalkLabel, useSunsetWalkDay } from './SunsetWalkContext';
import { walkError } from './useWalkState';

const cityLabel = (city: WalkCity) =>
  [city.name, city.region, city.country].filter(Boolean).join(' · ');
const stateLabels = {
  scheduled: 'Напоминание поставлено',
  disabled: 'Напоминания выключены',
  'permission-required': 'Нужны разрешения',
  unsupported: 'В браузере напоминания недоступны',
  expired: 'Календарь закончился',
  error: 'Напоминание не подтверждено',
};
export function SunsetWalkSettings({ services, date }: { services: WalkServices; date: string }) {
  const [value, setValue] = useState<SunsetWalkSettingsValue | null>(null);
  const [city, setCity] = useState<WalkCity | null>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<readonly WalkCity[] | null>(null);
  const [selected, setSelected] = useState(true);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [receipt, setReceipt] = useState<WalkReminderReceipt | null>(null);
  const request = useRef<AbortController | null>(null);
  const generation = useRef(0);
  const receiptGeneration = useRef(0);
  const { day, timeZone, error: timeError } = useSunsetWalkDay(date);
  useEffect(() => {
    let alive = true;
    const searchGeneration = generation;
    const receiptVersion = receiptGeneration.current;
    void services.sunset.settings
      .get()
      .then((saved) => {
        if (alive) {
          setValue(saved);
          setCity(saved.city);
        }
      })
      .catch((reason: unknown) => {
        if (alive) setError(walkError(reason));
      });
    void services.sunset.reminders
      .status()
      .then((next) => {
        if (alive && receiptGeneration.current === receiptVersion) setReceipt(next);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
      searchGeneration.current++;
      request.current?.abort();
    };
  }, [services]);
  const search = async () => {
    request.current?.abort();
    const current = ++generation.current;
    const controller = new AbortController();
    request.current = controller;
    setSearching(true);
    setError('');
    setResults(null);
    setSelected(false);
    try {
      const found = await services.sunset.cities.search(query, controller.signal);
      if (generation.current === current) setResults(found);
    } catch (reason: unknown) {
      if (generation.current === current && !controller.signal.aborted) setError(walkError(reason));
    } finally {
      if (generation.current === current) setSearching(false);
    }
  };
  const refresh = async () => {
    receiptGeneration.current++;
    setBusy(true);
    setError('');
    try {
      setReceipt(await services.sunset.reminders.reconcile());
    } catch (reason: unknown) {
      setError(walkError(reason));
      setReceipt(null);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!value || !city || !selected || busy) return;
    receiptGeneration.current++;
    setBusy(true);
    setError('');
    setMessage('');
    setReceipt(null);
    try {
      const saved = await services.sunset.settings.save({
        city,
        enabled: value.enabled,
        remindersEnabled: value.remindersEnabled,
      });
      setValue(saved);
      setCity(saved.city);
      setResults(null);
      setQuery('');
      setMessage('Настройки сохранены на этом устройстве.');
      setReceipt(await services.sunset.reminders.reconcile());
    } catch (reason: unknown) {
      setError(walkError(reason));
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="walk-panel" aria-labelledby="sunset-walk-title">
      <span className="walk-label">Время прогулки</span>
      <h2 id="sunset-walk-title">Прогулка перед закатом</h2>
      {day && <p className="sunset-walk-time">{sunsetWalkLabel(day, timeZone)}</p>}
      {day && (
        <p>
          {cityLabel(day.city)} · {day.city.timeZone}
          {day.city.timeZone !== timeZone ? ` · На экране: ${timeZone}` : ''}
        </p>
      )}
      <p>
        Начало и уведомление — за 15 минут до заката. Город выбирается отдельно на телефоне и
        компьютере.
      </p>
      {!value ? (
        <p role="status">Загружаем настройки…</p>
      ) : (
        <>
          <form
            className="walk-form"
            onSubmit={(event) => {
              event.preventDefault();
              void search();
            }}
          >
            <label>
              Найти город
              <input
                type="search"
                minLength={3}
                maxLength={200}
                value={query}
                disabled={busy}
                onChange={(event) => {
                  request.current?.abort();
                  generation.current++;
                  setSearching(false);
                  setResults(null);
                  setError('');
                  setQuery(event.target.value);
                  setSelected(event.target.value.trim() === '');
                  setCity(value.city);
                }}
              />
            </label>
            <button type="submit" disabled={busy || searching || query.trim().length < 3}>
              {searching ? 'Ищем…' : 'Найти'}
            </button>
          </form>
          {results &&
            (results.length === 0 ? (
              <p role="status">Города не найдены. Уточните название.</p>
            ) : (
              <fieldset className="walk-form">
                <legend>Выберите город и регион</legend>
                {results.map((result) => (
                  <label key={result.id} className="sunset-walk-check">
                    <input
                      type="radio"
                      name="walk-city"
                      checked={selected && city?.id === result.id}
                      onChange={() => {
                        setCity(result);
                        setSelected(true);
                      }}
                    />
                    {cityLabel(result)}
                  </label>
                ))}
              </fieldset>
            ))}
          <div className="walk-form">
            <label className="sunset-walk-check">
              <input
                type="checkbox"
                disabled={busy}
                checked={value.enabled}
                onChange={(event) => setValue({ ...value, enabled: event.target.checked })}
              />
              Автоматически за 15 минут до заката
            </label>
            <label className="sunset-walk-check">
              <input
                type="checkbox"
                disabled={busy || !value.enabled}
                checked={value.remindersEnabled}
                onChange={(event) => setValue({ ...value, remindersEnabled: event.target.checked })}
              />
              Напоминать о прогулке на этом устройстве
            </label>
            <button
              type="button"
              className="planner-primary"
              disabled={busy || searching || !selected}
              onClick={() => void save()}
            >
              Сохранить город и время
            </button>
          </div>
          <small>
            Поиск:{' '}
            <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">
              Open-Meteo
            </a>{' '}
            /{' '}
            <a href="https://www.geonames.org/" target="_blank" rel="noreferrer">
              GeoNames
            </a>
            . Сохранённое время рассчитывается без интернета.
          </small>
          {receipt && (
            <div className="sunset-walk-status">
              <strong>{stateLabels[receipt.state]}</strong>
              {receipt.message && <p>{receipt.message}</p>}
              {receipt.state === 'scheduled' && receipt.nextTriggerAt !== null && (
                <p>
                  Ближайшее:{' '}
                  {new Intl.DateTimeFormat('ru-RU', {
                    timeZone,
                    dateStyle: 'short',
                    timeStyle: 'short',
                  }).format(new Date(receipt.nextTriggerAt))}
                </p>
              )}
              {receipt.throughCityDate && (
                <p>Календарь до {receipt.throughCityDate}. Продлевается при открытии LifeOS.</p>
              )}
              <small>Проверено: {new Date(receipt.checkedAt).toLocaleString('ru-RU')}</small>
            </div>
          )}
          <button type="button" disabled={busy} onClick={() => void refresh()}>
            Проверить напоминания
          </button>
          {receipt?.state === 'permission-required' && (
            <div className="walk-plan-actions">
              {receipt.message?.includes('EXACT_ALARM') && (
                <button
                  type="button"
                  onClick={() =>
                    void services.sunset.reminders
                      .openSettings('EXACT_ALARM')
                      .catch((reason: unknown) => setError(walkError(reason)))
                  }
                >
                  Разрешить точные напоминания
                </button>
              )}
              <button
                type="button"
                onClick={() =>
                  void services.sunset.reminders
                    .openSettings('NOTIFICATIONS')
                    .catch((reason: unknown) => setError(walkError(reason)))
                }
              >
                Настройки уведомлений
              </button>
            </div>
          )}
          <small>
            Windows — при входе в учётную запись. Android — после закрытия окна и перезагрузки;
            принудительная остановка в настройках ОС требует повторного открытия LifeOS.
          </small>
        </>
      )}
      {(error || timeError) && <p role="alert">{error || timeError}</p>}
      {message && <p role="status">{message}</p>}
    </section>
  );
}
