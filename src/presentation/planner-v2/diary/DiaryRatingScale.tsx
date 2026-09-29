import type { DiaryRating } from '../../../domain';

export function DiaryRatingScale({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: DiaryRating | null;
  readonly onChange: (value: DiaryRating) => void;
}) {
  return (
    <fieldset className="planner-diary-rating" role="radiogroup" aria-label={label}>
      <legend>{label}</legend>
      <div>
        {([1, 2, 3, 4, 5] as const).map((rating) => (
          <label key={rating}>
            <input
              type="radio"
              name={`diary-${label}`}
              value={rating}
              checked={value === rating}
              onChange={() => onChange(rating)}
            />
            <span>{rating}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
