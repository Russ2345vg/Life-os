import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { VoiceTextControl, type VoiceTextValueProps } from './VoiceTextControl';

export type VoiceTextAreaProps = Omit<
  TextareaHTMLAttributes<HTMLTextAreaElement>,
  'value' | 'defaultValue' | 'onChange'
> &
  VoiceTextValueProps;

export const VoiceTextArea = forwardRef<HTMLTextAreaElement, VoiceTextAreaProps>(
  function VoiceTextArea({ voiceInput, voiceLanguage, endActions, onValueChange, ...native }, ref) {
    return (
      <VoiceTextControl
        {...native}
        voiceInput={voiceInput}
        voiceLanguage={voiceLanguage}
        endActions={endActions}
        onValueChange={onValueChange}
        forwardedRef={ref}
        nativeHandlers={native}
        multiline
        control={<textarea {...native} />}
      />
    );
  },
);
