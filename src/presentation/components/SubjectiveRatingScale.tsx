import { isSubjectiveRating, type SubjectiveRating } from '../../domain';

interface SubjectiveRatingScaleProps {
  readonly name: string;
  readonly label: string;
  readonly value: SubjectiveRating | null;
  readonly disabled?: boolean;
  readonly onChange: (value: SubjectiveRating) => void;
}

const RATINGS = [1, 2, 3, 4, 5] as const;

export function SubjectiveRatingScale({
  name,
  label,
  value,
  disabled = false,
  onChange,
}: SubjectiveRatingScaleProps) {
  return (
    <fieldset className="subjective-rating-scale" role="radiogroup" aria-label={label}>
      <legend>{label}</legend>
      <div className="subjective-rating-scale-options">
        {RATINGS.map((rating) => (
          <label
            className="subjective-rating-option"
            data-selected={value === rating ? 'true' : 'false'}
            key={rating}
          >
            <input
              type="radio"
              name={name}
              value={rating}
              checked={value === rating}
              disabled={disabled}
              onChange={(event) => {
                const next = Number(event.currentTarget.value);
                if (isSubjectiveRating(next)) onChange(next);
              }}
            />
            <span aria-hidden="true">{rating}</span>
            <span className="visually-hidden">
              {rating === 1
                ? '1 из 5, Очень низко'
                : rating === 5
                  ? '5 из 5, Очень высоко'
                  : `${rating} из 5`}
            </span>
          </label>
        ))}
      </div>
      <div className="subjective-rating-scale-anchors" aria-hidden="true">
        <span>Очень низко</span>
        <span>Очень высоко</span>
      </div>
    </fieldset>
  );
}
