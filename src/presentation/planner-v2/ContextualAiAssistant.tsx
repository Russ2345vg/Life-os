import { useEffect, useRef, useState } from 'react';
import { AiError, type AiAssistant } from '../../application/ai/AiAssistant';
import type { AiContext, AiScope, ReadAiContext } from '../../application/ai/AiContext';
import type { PlannerRoute } from './PlannerNavigation';
import { routeForSource } from './aiSourceRoute';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import { PlannerSheet } from './PlannerSheet';
import { WhatIfAssistant } from './WhatIfAssistant';
import './contextual-ai-assistant.css';
import { contextualAiExamples } from './contextualAiExamples';

const names: Record<AiScope['section'], string> = {
  today: 'Сегодня',
  spheres: 'Сферы',
  directions: 'Направления',
  needs: 'Потребности',
  goals: 'Цели',
  actions: 'Действия',
  inbox: 'Входящие',
  walks: 'Прогулки',
  diary: 'Дневник',
  memory: 'Память жизни',
  sleep: 'Подготовка ко сну',
  analytics: 'Аналитика',
  account: 'Аккаунт',
};
export function ContextualAiAssistant({
  service,
  reader,
  scope,
  scopeKey,
  onNavigate,
  onCapture,
}: {
  readonly service: AiAssistant;
  readonly reader: ReadAiContext;
  readonly scope: AiScope;
  readonly scopeKey: string;
  readonly onNavigate: (route: PlannerRoute) => Promise<boolean> | void;
  readonly onCapture?: (title: string, note: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<AiContext | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [saveTitle, setSaveTitle] = useState('');
  const [saveNote, setSaveNote] = useState('');
  const [saveBusy, setSaveBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState('');
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [],
  );
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
      setOpen(false);
    },
    [scopeKey],
  );
  useEffect(() => {
    if (!open || !service.available) return;
    let disposed = false;
    void reader
      .read(scope)
      .then((value) => {
        if (!disposed) setContext(value);
      })
      .catch(() => {
        if (!disposed)
          setError('Не удалось прочитать данные раздела. Закройте панель и повторите.');
      })
      .finally(() => {
        if (!disposed) setLoading(false);
      });
    return () => {
      disposed = true;
    };
  }, [open, reader, scope, service.available]);
  const close = () => {
    active.current?.abort();
    active.current = null;
    setOpen(false);
    setBusy(false);
    setQuestion('');
    setAnswer('');
    setSaveOpen(false);
    setSaveStatus('');
  };
  const submit = async () => {
    if (!context || active.current || !question.trim()) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setAnswer('');
    setSaveOpen(false);
    setSaveStatus('');
    try {
      const result = await service.askWithContext(question, context, controller.signal);
      if (active.current === controller) setAnswer(result);
    } catch (reason) {
      if (active.current === controller)
        setError(
          reason instanceof AiError ? reason.message : 'Не удалось получить ответ. Повторите.',
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  return (
    <div className="contextual-ai">
      {scope.section === 'today' && !scope.tomorrow && (
        <WhatIfAssistant key={scopeKey} service={service} reader={reader} date={scope.date} />
      )}
      <button
        type="button"
        className="contextual-ai__trigger"
        onClick={() => {
          setLoading(true);
          setContext(null);
          setError('');
          setOpen(true);
        }}
      >
        Спросить помощника о разделе
      </button>
      {open && (
        <PlannerSheet
          title={`Помощник · ${names[scope.section]}`}
          onClose={close}
          lockScroll
          initialFocus={() =>
            document.querySelector<HTMLTextAreaElement>('#contextual-ai-question') ??
            document.querySelector<HTMLButtonElement>('.planner-sheet-close')
          }
        >
          <div className="contextual-ai__sheet">
            <h2>Помощник · {names[scope.section]}</h2>
            <p>Помогу разобраться в данных этого раздела. Решения и изменения остаются за вами.</p>
            {!service.available ? (
              <p role="status">
                Помощник доступен после настройки OpenAI и входа в подтверждённый аккаунт.
              </p>
            ) : loading ? (
              <p role="status">Читаем данные раздела…</p>
            ) : context ? (
              <>
                <div className="contextual-ai__preview">
                  <strong>Что отправится с вопросом</strong>
                  <p>
                    {names[context.section]} ·{' '}
                    {context.period
                      ? `${context.period.start} — ${context.period.end}`
                      : context.date}{' '}
                    · записей: {context.sources.length}
                    {context.omittedCount
                      ? ` · ещё ${context.omittedCount} не вошли в выборку`
                      : ''}
                  </p>
                  <details>
                    <summary>
                      Посмотреть данные ({context.sources.length + context.facts.length})
                    </summary>
                    {context.facts.map((fact, index) => (
                      <p key={index}>{fact}</p>
                    ))}
                    <ol>
                      {context.sources.map((item) => (
                        <li key={`${item.kind}:${item.id}`}>
                          <strong>{item.title}</strong>
                          {item.detail ? ` · ${item.detail}` : ''}
                        </li>
                      ))}
                    </ol>
                  </details>
                </div>
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    void submit();
                  }}
                >
                  <label htmlFor="contextual-ai-question">Ваш вопрос</label>
                  <VoiceTextArea
                    id="contextual-ai-question"
                    value={question}
                    onValueChange={setQuestion}
                    maxLength={4000}
                    required
                    disabled={busy}
                  />
                  <button
                    type="button"
                    className="contextual-ai__example"
                    onClick={() => setQuestion(contextualAiExamples[scope.section])}
                    disabled={busy}
                  >
                    {contextualAiExamples[scope.section]}
                  </button>
                  <div className="contextual-ai__actions">
                    <button
                      type="submit"
                      className="planner-primary"
                      disabled={busy || !question.trim()}
                    >
                      {busy ? 'Готовим ответ…' : 'Спросить'}
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
                </form>
                {answer && (
                  <div className="contextual-ai__answer" aria-label="Ответ помощника">
                    <h3>Ответ</h3>
                    <p>{answer}</p>
                    {onCapture && !saveOpen && !saveStatus && (
                      <button
                        type="button"
                        onClick={() => {
                          setSaveTitle(question.trim().slice(0, 200));
                          setSaveNote(answer.slice(0, 4000));
                          setSaveOpen(true);
                        }}
                      >
                        Сохранить мысль во Входящие
                      </button>
                    )}
                    {saveOpen && (
                      <form
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!onCapture || !saveTitle.trim() || saveBusy) return;
                          setSaveBusy(true);
                          setSaveStatus('');
                          void onCapture(saveTitle.trim(), saveNote)
                            .then(() => {
                              setSaveStatus('Мысль сохранена во Входящих.');
                              setSaveOpen(false);
                            })
                            .catch(() => setSaveStatus('Не удалось сохранить. Повторите.'))
                            .finally(() => setSaveBusy(false));
                        }}
                      >
                        <label htmlFor="contextual-ai-save-title">Название записи</label>
                        <input
                          id="contextual-ai-save-title"
                          value={saveTitle}
                          maxLength={200}
                          required
                          onChange={(event) => setSaveTitle(event.target.value)}
                        />
                        <label htmlFor="contextual-ai-save-note">Заметка</label>
                        <VoiceTextArea
                          id="contextual-ai-save-note"
                          value={saveNote}
                          maxLength={4000}
                          onValueChange={setSaveNote}
                        />
                        <button
                          type="submit"
                          className="planner-primary"
                          disabled={saveBusy || !saveTitle.trim()}
                        >
                          {saveBusy ? 'Сохраняем…' : 'Сохранить во Входящие'}
                        </button>
                      </form>
                    )}
                    {saveStatus && <p role="status">{saveStatus}</p>}
                    {context.sources.length > 0 && (
                      <details>
                        <summary>Переданные источники</summary>
                        <ol>
                          {context.sources.map((item) => {
                            const target = routeForSource(item, scope);
                            return (
                              <li key={`${item.kind}:${item.id}`}>
                                {target ? (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      close();
                                      void onNavigate(target);
                                    }}
                                  >
                                    {item.title}
                                  </button>
                                ) : (
                                  item.title
                                )}
                              </li>
                            );
                          })}
                        </ol>
                      </details>
                    )}
                  </div>
                )}
              </>
            ) : null}
            {error && (
              <p role="alert" className="contextual-ai__error">
                {error}
              </p>
            )}
          </div>
        </PlannerSheet>
      )}
    </div>
  );
}
