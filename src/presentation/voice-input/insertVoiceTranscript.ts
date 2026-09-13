export interface VoiceInsertion {
  readonly value: string;
  readonly caret: number;
  readonly limited: boolean;
}

/** Pure insertion; never truncates the user's existing text to meet a field limit. */
export function insertVoiceTranscript(
  value: string,
  transcript: string,
  selectionStart: number | null,
  selectionEnd: number | null,
  maxLength?: number,
): VoiceInsertion {
  const clamp = (position: number | null): number =>
    Math.max(0, Math.min(value.length, position ?? value.length));
  const start = Math.min(clamp(selectionStart), clamp(selectionEnd));
  const end = Math.max(clamp(selectionStart), clamp(selectionEnd));
  const text = transcript.trim().replace(/\s+/gu, ' ');
  if (!text) return { value, caret: start, limited: false };
  const prefix = value.slice(0, start);
  const suffix = value.slice(end);
  const opening = /[([{«“„]$/u;
  const closing = /^[.,!?;:…)\]}»”]/u;
  const left =
    prefix && !/\s$/u.test(prefix) && !opening.test(prefix) && !closing.test(text) ? ' ' : '';
  const budget =
    maxLength === undefined || maxLength < 0 ? Infinity : maxLength - prefix.length - suffix.length;
  const points = Array.from(text);
  let inserted = text;
  let right = '';
  while (points.length > 0) {
    inserted = points.join('').trimEnd();
    right =
      suffix && !/^\s/u.test(suffix) && !closing.test(suffix) && !opening.test(inserted) ? ' ' : '';
    if (left.length + inserted.length + right.length <= budget) break;
    points.pop();
  }
  if (points.length === 0) return { value, caret: start, limited: true };
  return {
    value: prefix + left + inserted + right + suffix,
    caret: prefix.length + left.length + inserted.length + right.length,
    limited: inserted !== text,
  };
}
