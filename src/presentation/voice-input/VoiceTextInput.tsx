import { forwardRef, type InputHTMLAttributes } from 'react';
import { VoiceTextControl, type VoiceTextValueProps } from './VoiceTextControl';

export type VoiceTextInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'value' | 'defaultValue' | 'onChange' | 'type'
> &
  VoiceTextValueProps & { readonly type?: 'text' | 'search' };

export const VoiceTextInput = forwardRef<HTMLInputElement, VoiceTextInputProps>(
  function VoiceTextInput(
    { voiceInput, voiceLanguage, endActions, onValueChange, ...native },
    ref,
  ) {
    return (
      <VoiceTextControl
        {...native}
        voiceInput={voiceInput}
        voiceLanguage={voiceLanguage}
        endActions={endActions}
        onValueChange={onValueChange}
        forwardedRef={ref}
        nativeHandlers={native}
        control={<input {...native} />}
      />
    );
  },
);
