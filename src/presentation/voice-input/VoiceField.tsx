import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type LabelHTMLAttributes,
  type ReactElement,
} from 'react';
import { VoiceFieldLabelContext } from './VoiceInputContext';

/** Keeps action names/status messages out of an enclosing label's accessible field name. */
export function VoiceField({ children, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  const generatedId = useId();
  const items = Children.toArray(children);
  const captionIndex = items.findIndex((child) => isValidElement(child) && child.type === 'span');
  const caption = items[captionIndex] as ReactElement<{ id?: string }> | undefined;
  const captionId = caption?.props.id ?? `voice-caption-${generatedId}`;
  if (caption) items[captionIndex] = cloneElement(caption, { id: captionId });
  return (
    <VoiceFieldLabelContext.Provider value={caption ? captionId : undefined}>
      <label {...props}>{items}</label>
    </VoiceFieldLabelContext.Provider>
  );
}
