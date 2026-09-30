import type { DiaryMemoryField } from '../../../domain/memory';

export function DiaryMemoryButton({
  field,
  label,
  text,
  disabled,
  onMemory,
}: {
  readonly field: DiaryMemoryField;
  readonly label: string;
  readonly text: string | null;
  readonly disabled: boolean;
  readonly onMemory?: ((field: DiaryMemoryField) => void) | undefined;
}) {
  return onMemory && text?.trim() ? (
    <button
      type="button"
      className="planner-diary-memory-button"
      aria-label={`Сохранить в память: ${label}`}
      disabled={disabled}
      onClick={() => onMemory(field)}
    >
      Сохранить в память
    </button>
  ) : null;
}
