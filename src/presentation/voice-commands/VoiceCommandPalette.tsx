import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import type { VoiceCommandController } from '../../application/voice-commands/VoiceCommandController';
import type { CommandResult } from '../../application/voice-commands/CommandRegistry';
import { DayDate } from '../../domain';
import { AppIcon } from '../components/AppIcon';
import { formatSelectedDateTitle } from '../date/selectedDate';
import { VoiceInputButton } from '../voice-input/VoiceInputButton';
import { VoiceTextArea } from '../voice-input/VoiceTextArea';
import { useVoiceInput } from '../voice-input/useVoiceInput';
import { voiceFailureMessages } from '../voice-input/voiceFailureMessages';
import './voice-commands.css';
import { VoiceCommandDetails } from './VoiceCommandDetails';

interface Props {
  readonly controller: VoiceCommandController;
  readonly currentDate: DayDate;
  readonly onClose: () => void;
  readonly onOpenResult: (created: NonNullable<CommandResult['created']>) => void;
}

export function VoiceCommandPalette({ controller, currentDate, onClose, onOpenResult }: Props) {
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getSnapshot,
  );
  const [text, setText] = useState('');
  const [answer, setAnswer] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const respond = useCallback(
    async (response: string) => {
      const before = controller.getSnapshot();
      setAnswer(response);
      await controller.answer(response);
      const after = controller.getSnapshot();
      if (
        before.status === 'clarification' &&
        after.status === 'clarification' &&
        before.context.field !== after.context.field
      )
        setAnswer('');
    },
    [controller],
  );
  const receive = useCallback(
    (transcript: string) => {
      if (controller.getSnapshot().status === 'clarification') {
        void respond(transcript);
        return;
      }
      setText(transcript);
      void controller.submit(transcript);
    },
    [controller, respond],
  );
  const voice = useVoiceInput(receive);
  const executing = state.status === 'executing';
  const listening = voice.state.status === 'listening';
  const processing = voice.state.status === 'processing' || state.status === 'interpreting';
  const busy = executing || listening || processing;
  useEffect(() => {
    const element = dialog.current;
    const previousFocus = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element?.showModal();
    return () => {
      controller.cancel();
      element?.close();
      document.body.style.overflow = previousOverflow;
      if (
        previousFocus instanceof HTMLElement &&
        previousFocus.isConnected &&
        previousFocus.getClientRects().length
      )
        previousFocus.focus();
      else
        Array.from(document.querySelectorAll<HTMLButtonElement>('.voice-command-entry'))
          .find((button) => button.getClientRects().length)
          ?.focus();
    };
  }, [controller]);
  useEffect(() => {
    const element = dialog.current;
    if (element?.open && !element.contains(document.activeElement))
      element.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  }, [state.status]);

  function cancel() {
    if (executing) return;
    voice.cancel();
    controller.cancel();
    onClose();
  }
  const feedback = listening
    ? 'Слушаю… Произнесите одну команду.'
    : processing
      ? 'Обрабатываю команду…'
      : executing
        ? 'Выполняю команду…'
        : state.status === 'preview'
          ? 'Команда понятна. Проверьте данные перед подтверждением.'
          : state.status === 'clarification'
            ? 'Нужно уточнение'
            : state.status === 'selection'
              ? 'Нужно выбрать задачу'
              : state.status === 'success'
                ? state.result.message
                : 'Задачи, цели и переходы между разделами';
  const error =
    voice.state.status === 'error'
      ? voiceFailureMessages[voice.state.failure]
      : state.status === 'error'
        ? state.message
        : null;
  return (
    <dialog
      ref={dialog}
      className="voice-command-palette"
      aria-labelledby="voice-command-title"
      onKeyDown={(event) => {
        if (event.key !== 'Tab') return;
        const controls = Array.from(
          event.currentTarget.querySelectorAll<HTMLElement>(
            'button:not(:disabled), textarea:not(:disabled)',
          ),
        );
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }}
      onCancel={(event) => {
        event.preventDefault();
        cancel();
      }}
    >
      <header className="voice-command-heading">
        <AppIcon name="microphone" />
        <div>
          <p className="eyebrow">LifeOS · быстрые действия</p>
          <h2 id="voice-command-title">Голосовые команды</h2>
        </div>
      </header>
      <p
        className={`voice-command-feedback ${state.status === 'success' ? 'voice-command-success' : ''}`}
        role="status"
        aria-live="polite"
      >
        {state.status === 'success' ? <AppIcon name="completed" /> : null}
        {feedback}
      </p>
      {state.status !== 'success' ? (
        <>
          <div className="voice-command-record voice-text-control">
            <VoiceInputButton
              status={voice.state.status}
              disabled={executing || state.status === 'interpreting'}
              onClick={() => {
                if (listening) voice.stop();
                else {
                  if (state.status !== 'clarification') {
                    controller.cancel();
                    setText('');
                  }
                  setAnswer('');
                  voice.start();
                }
              }}
            />
            <span>
              {voice.state.status === 'unsupported'
                ? 'Голосовой ввод недоступен'
                : listening
                  ? 'Нажмите микрофон, когда закончите'
                  : state.status === 'preview'
                    ? 'Можно повторить команду голосом'
                    : 'Нажмите микрофон и произнесите команду'}
            </span>
          </div>
          {voice.state.status === 'unsupported' ? (
            <p className="voice-command-hint">
              Голосовой ввод недоступен в этом браузере. Введите команду вручную.
            </p>
          ) : null}
          {listening && voice.state.status === 'listening' && voice.state.interimTranscript ? (
            <p className="voice-command-interim" aria-live="polite">
              Слышу: {voice.state.interimTranscript}
            </p>
          ) : null}
        </>
      ) : null}
      <label className="voice-command-field" htmlFor="voice-command-text">
        Текст команды
      </label>
      <VoiceTextArea
        id="voice-command-text"
        value={text}
        voiceInput={false}
        rows={3}
        maxLength={4000}
        readOnly={busy || state.status === 'success'}
        onValueChange={(value) => {
          voice.cancel();
          controller.cancel();
          setText(value);
        }}
        aria-describedby="voice-command-help"
        placeholder="Добавь задачу купить продукты завтра"
      />
      {state.status === 'clarification' ? (
        <section className="voice-command-preview" aria-label="Уточнение команды">
          <h3>{state.context.message}</h3>
          <p className="voice-command-hint">
            {state.context.draft.title}
            {state.context.draft.date ? ` · ${state.context.draft.date}` : ''}
            {state.context.draft.time ? ` · ${state.context.draft.time}` : ''}
          </p>
          {state.context.field === 'omit_time' || state.context.field === 'omit_deadline' ? (
            <button
              type="button"
              className="primary-button"
              disabled={busy}
              onClick={() => {
                voice.cancel();
                const response = state.context.field === 'omit_time' ? 'без времени' : 'без срока';
                void respond(response);
              }}
            >
              {state.context.field === 'omit_time'
                ? 'Продолжить без времени'
                : 'Продолжить без срока'}
            </button>
          ) : (
            <>
              <label className="voice-command-field" htmlFor="voice-command-answer">
                Ответ на уточнение
              </label>
              <VoiceTextArea
                id="voice-command-answer"
                voiceInput={false}
                value={answer}
                onValueChange={setAnswer}
                rows={2}
                maxLength={4000}
                readOnly={busy}
              />
            </>
          )}
        </section>
      ) : answer ? (
        <p className="voice-command-hint">Уточнение: {answer}</p>
      ) : null}
      <VoiceCommandDetails state={state} controller={controller} />
      {state.status === 'preview' &&
      (state.command.type === 'create_task' || state.command.type === 'create_goal') ? (
        <section className="voice-command-preview" aria-label="Предпросмотр команды">
          <h3>{state.command.type === 'create_task' ? 'Создать задачу?' : 'Создать цель?'}</h3>
          <p className="voice-command-preview-title">{state.command.payload.title}</p>
          {state.command.type === 'create_task' ? (
            <>
              <p>
                Дата:{' '}
                {formatSelectedDateTitle(
                  DayDate.create(state.command.payload.date),
                  currentDate,
                ).toLocaleLowerCase('ru-RU')}{' '}
                · {state.command.payload.date}
              </p>
              <p className="voice-command-hint">Дополнительное решение · обычный приоритет</p>
            </>
          ) : (
            <p className="voice-command-hint">Будущая цель · идея · без направления</p>
          )}
        </section>
      ) : null}
      {error ? (
        <p className="voice-command-error" role="alert">
          {error}
        </p>
      ) : null}
      <p id="voice-command-help" className="voice-command-hint">
        {state.status === 'success'
          ? state.result.created
            ? 'Результат сохранён. Можно открыть его или закрыть окно.'
            : 'Команда выполнена. Закройте окно, чтобы продолжить.'
          : state.status === 'preview'
            ? 'Проверьте услышанный текст. Его можно исправить выше и разобрать заново.'
            : 'Например: «Создай цель выучить английский» или «Открой дневник». Изменения сохраняются только после подтверждения.'}
      </p>
      <footer className="voice-command-actions">
        <button type="button" className="secondary-button" disabled={executing} onClick={cancel}>
          {state.status === 'success' ? 'Закрыть' : 'Отмена'}
        </button>
        {state.status === 'preview' ? (
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              void controller.confirm(state.revision);
            }}
          >
            {state.command.type === 'reschedule_task'
              ? 'Изменить'
              : state.command.type === 'complete_task'
                ? 'Завершить'
                : 'Создать'}
          </button>
        ) : state.status === 'success' ? (
          state.result.created ? (
            <button
              type="button"
              className="primary-button"
              onClick={() => {
                if (state.result.created) onOpenResult(state.result.created);
                onClose();
              }}
            >
              Открыть {state.result.created.type === 'task' ? 'задачу' : 'цель'}
            </button>
          ) : null
        ) : state.status === 'selection' ||
          (state.status === 'clarification' &&
            (state.context.field === 'omit_time' ||
              state.context.field === 'omit_deadline')) ? null : (
          <button
            type="button"
            className="primary-button"
            disabled={busy || !(state.status === 'clarification' ? answer : text).trim()}
            onClick={() => {
              voice.cancel();
              if (state.status === 'clarification') void respond(answer);
              else void controller.submit(text);
            }}
          >
            {state.status === 'clarification' ? 'Продолжить' : 'Разобрать команду'}
          </button>
        )}
      </footer>
    </dialog>
  );
}
