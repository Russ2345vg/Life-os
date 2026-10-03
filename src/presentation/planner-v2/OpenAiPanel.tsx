import { useEffect, useRef, useState } from 'react';
import { AiError, type AiAssistant } from '../../application/ai/AiAssistant';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import './openai-panel.css';

export function OpenAiPanel({ service }: { readonly service: AiAssistant }) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const active = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      active.current?.abort();
      active.current = null;
    },
    [service],
  );

  const submit = async () => {
    if (active.current) return;
    const controller = new AbortController();
    active.current = controller;
    setBusy(true);
    setError('');
    setAnswer('');
    try {
      const result = await service.ask(question, controller.signal);
      if (active.current === controller) setAnswer(result);
    } catch (reason) {
      if (active.current === controller)
        setError(
          reason instanceof AiError
            ? reason.message
            : 'Не удалось получить ответ. Попробуйте ещё раз.',
        );
    } finally {
      if (active.current === controller) {
        active.current = null;
        setBusy(false);
      }
    }
  };
  const cancel = () => {
    active.current?.abort();
    active.current = null;
    setBusy(false);
    setError('Запрос отменён. Вопрос сохранён в поле.');
  };

  return (
    <section className="account-sync-page openai-panel" aria-labelledby="openai-title">
      <div className="account-panel">
        <h2 id="openai-title">Помощник OpenAI</h2>
        <p id="openai-privacy">
          Только текст этого вопроса будет передан OpenAI через сервер LifeOS. Задачи и дневник не
          передаются. История вопросов не сохраняется в LifeOS.
        </p>
        {!service.available ? (
          <p role="status">
            Подключение OpenAI ещё не настроено для этой сборки. Помощник доступен в приложении
            LifeOS после настройки сервера и входа в аккаунт.
          </p>
        ) : (
          <form
            className="account-form"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <fieldset disabled={busy}>
              <label htmlFor="openai-question">Вопрос для OpenAI</label>
              <VoiceTextArea
                id="openai-question"
                value={question}
                onValueChange={setQuestion}
                maxLength={4000}
                required
                aria-describedby="openai-privacy"
                disabled={busy}
              />
              <button
                type="submit"
                className="account-button account-button--primary"
                disabled={!question.trim() || busy}
              >
                Получить ответ
              </button>
            </fieldset>
            <div className="openai-panel__status" role="status" aria-live="polite">
              {busy ? 'OpenAI готовит ответ…' : answer ? 'Ответ получен' : ''}
            </div>
            {busy ? (
              <button type="button" onClick={cancel}>
                Отменить запрос
              </button>
            ) : null}
            {error ? (
              <p className="account-feedback account-feedback--error" role="alert">
                {error}
              </p>
            ) : null}
            {answer ? (
              <div className="openai-panel__answer" aria-label="Ответ OpenAI">
                {answer}
              </div>
            ) : null}
          </form>
        )}
      </div>
    </section>
  );
}
