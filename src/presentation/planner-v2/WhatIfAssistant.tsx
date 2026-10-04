import { useEffect, useRef, useState } from 'react';
import { AiError, type AiAssistant } from '../../application/ai/AiAssistant';
import type { ReadAiContext } from '../../application/ai/AiContext';
import type { WhatIfComparison } from '../../application/ai/WhatIfComparison';
import { VoiceTextInput } from '../voice-input/VoiceTextInput';
import { PlannerSheet } from './PlannerSheet';

const question =
  'Сравни варианты А и Б по переданным фактам: влияние на оставшийся план, пересечения по времени и плановый сон. Назови ограничения расчёта. Не выбирай вариант за пользователя и не утверждай, что план изменён.';
const formatTime = (iso: string, timeZone?: string | null) =>
  new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  }).format(new Date(iso));

export function WhatIfAssistant({
  service,
  reader,
  date,
}: {
  readonly service: AiAssistant;
  readonly reader: ReadAiContext;
  readonly date: string;
}) {
  const [open, setOpen] = useState(false);
  const [titleA, setTitleA] = useState('');
  const [titleB, setTitleB] = useState('');
  const [minutesA, setMinutesA] = useState('');
  const [minutesB, setMinutesB] = useState('');
  const [comparison, setComparison] = useState<WhatIfComparison | null>(null);
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [calculating, setCalculating] = useState(false);
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  const calculationVersion = useRef(0);
  useEffect(() => () => active.current?.abort(), []);

  const invalidate = () => {
    calculationVersion.current += 1;
    active.current?.abort();
    active.current = null;
    setCalculating(false);
    setBusy(false);
    setComparison(null);
    setAnswer('');
    setError('');
  };
  const close = () => {
    invalidate();
    setOpen(false);
  };
  const compare = async () => {
    if (calculating) return;
    invalidate();
    const version = calculationVersion.current;
    setCalculating(true);
    try {
      const result = await reader.compareWhatIf({
        date,
        now: new Date(),
        options: [
          { title: titleA, durationMinutes: Number(minutesA) },
          { title: titleB, durationMinutes: Number(minutesB) },
        ],
      });
      if (calculationVersion.current === version) setComparison(result);
    } catch (reason) {
      if (calculationVersion.current === version)
        setError(reason instanceof Error ? reason.message : 'Не удалось сравнить варианты.');
    } finally {
      if (calculationVersion.current === version) setCalculating(false);
    }
  };
  const ask = async () => {
    if (!comparison || active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setAnswer('');
    try {
      const result = await service.askWithContext(question, comparison.context, controller.signal);
      if (active.current === controller) setAnswer(result);
    } catch (reason) {
      if (active.current === controller)
        setError(
          reason instanceof AiError ? reason.message : 'Не удалось получить пояснение. Повторите.',
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <>
      <button type="button" className="contextual-ai__trigger" onClick={() => setOpen(true)}>
        Что будет, если?
      </button>
      {open && (
        <PlannerSheet
          title="Что будет, если?"
          onClose={close}
          lockScroll
          initialFocus={() => document.querySelector<HTMLInputElement>('#what-if-title-a')}
        >
          <div className="contextual-ai__sheet what-if">
            <h2>Что будет, если?</h2>
            <p>
              Введите два своих варианта. Сравним их с планом дня и плановым сном, не меняя ничего в
              LifeOS.
            </p>
            <p>
              Предположение: каждый вариант начинается сейчас. Перерывы и фактический результат
              неизвестны.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void compare();
              }}
            >
              <fieldset className="what-if__fields">
                <legend>Вариант А</legend>
                <label htmlFor="what-if-title-a">Что сделать</label>
                <VoiceTextInput
                  id="what-if-title-a"
                  value={titleA}
                  onValueChange={(value) => {
                    invalidate();
                    setTitleA(value);
                  }}
                  maxLength={120}
                  required
                />
                <label htmlFor="what-if-minutes-a">Длительность, минут</label>
                <input
                  id="what-if-minutes-a"
                  type="number"
                  min="5"
                  max="720"
                  step="1"
                  value={minutesA}
                  onChange={(event) => {
                    invalidate();
                    setMinutesA(event.target.value);
                  }}
                  required
                />
              </fieldset>
              <fieldset className="what-if__fields">
                <legend>Вариант Б</legend>
                <label htmlFor="what-if-title-b">Что сделать</label>
                <VoiceTextInput
                  id="what-if-title-b"
                  value={titleB}
                  onValueChange={(value) => {
                    invalidate();
                    setTitleB(value);
                  }}
                  maxLength={120}
                  required
                />
                <label htmlFor="what-if-minutes-b">Длительность, минут</label>
                <input
                  id="what-if-minutes-b"
                  type="number"
                  min="5"
                  max="720"
                  step="1"
                  value={minutesB}
                  onChange={(event) => {
                    invalidate();
                    setMinutesB(event.target.value);
                  }}
                  required
                />
              </fieldset>
              <button type="submit" className="planner-primary" disabled={calculating || busy}>
                {calculating ? 'Считаем…' : 'Сравнить варианты'}
              </button>
            </form>
            {comparison && (
              <div className="what-if__results" aria-label="Сравнение вариантов">
                <div className="contextual-ai__preview">
                  <strong>Оставшийся план на сегодня</strong>
                  <p>
                    Действий: {comparison.plan.actionCount} · известная нагрузка:{' '}
                    {comparison.plan.knownMinutes} мин · без оценки:{' '}
                    {comparison.plan.unknownEstimateCount}
                  </p>
                  <p>
                    {comparison.nextSleepAt
                      ? `Следующий плановый сон: ${formatTime(comparison.nextSleepAt, comparison.sleepTimeZone)}`
                      : 'Сон не настроен — влияние на него неизвестно.'}
                  </p>
                </div>
                <div className="what-if__options">
                  {comparison.options.map((option, index) => (
                    <section
                      key={index}
                      className="contextual-ai__preview"
                      aria-label={`Вариант ${index === 0 ? 'А' : 'Б'}`}
                    >
                      <h3>
                        Вариант {index === 0 ? 'А' : 'Б'} · {option.title}
                      </h3>
                      <p>
                        {option.durationMinutes} мин · завершение около{' '}
                        {formatTime(option.finishAt)}
                      </p>
                      <p>Пересечений с действиями по времени: {option.overlappingActionCount}</p>
                      {option.overlappingActionCount > 0 && (
                        <p>Например: {option.overlappingActionTitles.join(', ')}</p>
                      )}
                      <p>
                        {option.sleepOverrunMinutes === null
                          ? 'Влияние на сон неизвестно'
                          : option.sleepOverrunMinutes > 0
                            ? `После планового отхода ко сну: ${option.sleepOverrunMinutes} мин`
                            : 'Завершится до планового отхода ко сну'}
                      </p>
                    </section>
                  ))}
                </div>
                <div className="contextual-ai__preview">
                  <strong>Что отправится ИИ по отдельному нажатию</strong>
                  <p>
                    Два варианта, расчёт и {comparison.context.sources.length} действий из плана
                    {comparison.context.omittedCount
                      ? `; ещё ${comparison.context.omittedCount} не вошли в выборку`
                      : ''}
                    .
                  </p>
                  <details>
                    <summary>Посмотреть данные</summary>
                    {comparison.context.facts.map((fact, index) => (
                      <p key={index}>{fact}</p>
                    ))}
                    <ol>
                      {comparison.context.sources.map((item) => (
                        <li key={item.id}>
                          {item.title} · {item.detail}
                        </li>
                      ))}
                    </ol>
                  </details>
                </div>
                {service.available ? (
                  <div className="contextual-ai__actions">
                    <button
                      type="button"
                      className="planner-primary"
                      disabled={busy}
                      onClick={() => void ask()}
                    >
                      {busy ? 'Готовим пояснение…' : 'Получить пояснение ИИ'}
                    </button>
                    {busy && (
                      <button
                        type="button"
                        onClick={() => {
                          active.current?.abort();
                          active.current = null;
                          setBusy(false);
                        }}
                      >
                        Отменить
                      </button>
                    )}
                  </div>
                ) : (
                  <p role="status">
                    Пояснение ИИ доступно после настройки OpenAI и входа в подтверждённый аккаунт.
                  </p>
                )}
                {answer && (
                  <div className="contextual-ai__answer" aria-label="Пояснение ИИ">
                    <h3>Пояснение ИИ</h3>
                    <p>{answer}</p>
                  </div>
                )}
              </div>
            )}
            {error && (
              <p role="alert" className="contextual-ai__error">
                {error}
              </p>
            )}
          </div>
        </PlannerSheet>
      )}
    </>
  );
}
