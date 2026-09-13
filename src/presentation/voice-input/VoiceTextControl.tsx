import {
  cloneElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type ChangeEventHandler,
  type ForwardedRef,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react';
import { voiceFailureMessages } from './voiceFailureMessages';
import { VoiceInputButton } from './VoiceInputButton';
import { insertVoiceTranscript } from './insertVoiceTranscript';
import { useVoiceInput } from './useVoiceInput';
import { VoiceFieldLabelContext } from './VoiceInputContext';
import './voice-input.css';

export interface VoiceTextValueProps {
  readonly value: string;
  readonly onValueChange: (value: string) => void;
  readonly voiceInput?: boolean | undefined;
  readonly voiceLanguage?: string | undefined;
  readonly endActions?: ReactNode;
}

interface ControlBindings<
  T extends HTMLInputElement | HTMLTextAreaElement,
> extends HTMLAttributes<T> {
  readonly ref: RefObject<T | null>;
  readonly id: string;
  readonly value: string;
  readonly onChange: ChangeEventHandler<T>;
}

interface VoiceTextControlProps<
  T extends HTMLInputElement | HTMLTextAreaElement,
> extends VoiceTextValueProps {
  readonly id?: string | undefined;
  readonly disabled?: boolean | undefined;
  readonly readOnly?: boolean | undefined;
  readonly maxLength?: number | undefined;
  readonly multiline?: boolean | undefined;
  readonly forwardedRef: ForwardedRef<T>;
  readonly nativeHandlers: HTMLAttributes<T>;
  readonly control: ReactElement<Partial<ControlBindings<T>>>;
}

export function VoiceTextControl<T extends HTMLInputElement | HTMLTextAreaElement>(
  props: VoiceTextControlProps<T>,
) {
  const { value, onValueChange, nativeHandlers, forwardedRef, voiceInput = true } = props;
  const generatedId = useId();
  const captionId = useContext(VoiceFieldLabelContext);
  const id = props.id ?? `voice-field-${generatedId}`;
  const messageId = `${id}-voice-message`;
  const element = useRef<T | null>(null);
  useImperativeHandle(forwardedRef, () => element.current as T);
  const selection = useRef<{ start: number | null; end: number | null }>({
    start: null,
    end: null,
  });
  const pendingCaret = useRef<number | null>(null);
  const [limited, setLimited] = useState(false);
  const commit = useCallback(
    (transcript: string) => {
      if (!voiceInput || props.disabled || props.readOnly) return;
      const result = insertVoiceTranscript(
        value,
        transcript,
        selection.current.start,
        selection.current.end,
        props.maxLength,
      );
      setLimited(result.limited);
      pendingCaret.current = result.caret;
      if (result.value !== value) onValueChange(result.value);
      else if (element.current) {
        pendingCaret.current = null;
        element.current.focus({ preventScroll: true });
        try {
          element.current.setSelectionRange(result.caret, result.caret);
        } catch {
          /* Search fallback. */
        }
        selection.current = { start: result.caret, end: result.caret };
      }
    },
    [value, onValueChange, voiceInput, props.disabled, props.readOnly, props.maxLength],
  );
  const voice = useVoiceInput(commit, props.voiceLanguage);
  const { cancel } = voice;
  useEffect(() => {
    if (!voiceInput || props.disabled || props.readOnly) cancel();
  }, [voiceInput, props.disabled, props.readOnly, cancel]);
  useLayoutEffect(() => {
    const caret = pendingCaret.current;
    if (caret === null || !element.current) return;
    pendingCaret.current = null;
    element.current.focus({ preventScroll: true });
    // Search inputs do not expose setSelectionRange in some browsers.
    try {
      element.current.setSelectionRange(caret, caret);
    } catch {
      /* Keep normal focus. */
    }
    selection.current = { start: caret, end: caret };
  });

  const capture = (): void => {
    if (element.current)
      selection.current = {
        start: element.current.selectionStart,
        end: element.current.selectionEnd,
      };
  };
  const error =
    voice.state.status === 'error'
      ? voiceFailureMessages[voice.state.failure]
      : limited
        ? 'Достигнут лимит поля. Сократите текст, чтобы продолжить.'
        : '';
  const status =
    voice.state.status === 'listening'
      ? 'Слушаю…'
      : voice.state.status === 'processing'
        ? 'Распознаю речь…'
        : voice.state.status === 'success' && !limited
          ? 'Текст добавлен'
          : '';
  const cancelOnEscape = (key: string): void => {
    if (
      key === 'Escape' &&
      (voice.state.status === 'listening' || voice.state.status === 'processing')
    )
      cancel();
  };
  const hasActions = voiceInput || Boolean(props.endActions);
  const bindings: ControlBindings<T> = {
    ref: element,
    id,
    value,
    'aria-labelledby':
      nativeHandlers['aria-labelledby'] ?? (nativeHandlers['aria-label'] ? undefined : captionId),
    'aria-describedby':
      [nativeHandlers['aria-describedby'], error ? messageId : undefined]
        .filter(Boolean)
        .join(' ') || undefined,
    onChange: (event) => {
      voice.reset();
      setLimited(false);
      capture();
      onValueChange(event.currentTarget.value);
    },
    onSelect: (event) => {
      capture();
      nativeHandlers.onSelect?.(event);
    },
    onClick: (event) => {
      capture();
      nativeHandlers.onClick?.(event);
    },
    onKeyUp: (event) => {
      capture();
      nativeHandlers.onKeyUp?.(event);
    },
    onBlur: (event) => {
      capture();
      nativeHandlers.onBlur?.(event);
    },
    onKeyDown: (event) => {
      cancelOnEscape(event.key);
      nativeHandlers.onKeyDown?.(event);
    },
  };
  return (
    <span
      className="voice-text-control"
      data-multiline={Boolean(props.multiline)}
      data-has-actions={hasActions}
    >
      <span className="voice-text-control-row">
        {cloneElement(props.control, bindings)}
        {hasActions ? (
          <span className="voice-text-actions">
            {props.endActions}
            {voiceInput ? (
              <VoiceInputButton
                status={voice.state.status}
                disabled={props.disabled || props.readOnly}
                aria-controls={id}
                onPointerDown={() => capture()}
                onKeyDown={(event) => cancelOnEscape(event.key)}
                onClick={() => {
                  if (voice.state.status === 'listening') voice.stop();
                  else {
                    setLimited(false);
                    capture();
                    voice.start();
                  }
                }}
              />
            ) : null}
          </span>
        ) : null}
      </span>
      <span
        className="voice-text-feedback"
        aria-live="polite"
        role={error ? 'alert' : 'status'}
        id={messageId}
      >
        {error || status}
      </span>
    </span>
  );
}
