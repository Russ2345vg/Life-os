export interface TemporalExtraction {
  readonly title: string;
  readonly value?: string;
  readonly issue?: string;
}
export function removeSpan(text: string, index: number, length: number): string {
  return `${text.slice(0, index)} ${text.slice(index + length)}`.replace(/\s+/gu, ' ').trim();
}
