import { IconStar } from './Icons';

interface Props {
  value: number | null;
  onChange?: (value: number | null) => void;
  label?: string;
}

export function StarRating({ value, onChange, label = 'Bewertung' }: Props) {
  if (!onChange) {
    if (!value) return <span className="muted small">Nicht bewertet</span>;
    return (
      <span className="stars" aria-label={`${label}: ${value} von 5`}>
        {[1, 2, 3, 4, 5].map((n) => (
          <IconStar key={n} filled={n <= value} className={n <= value ? 'star--on' : 'star--off'} />
        ))}
      </span>
    );
  }

  return (
    <div className="stars stars--input" role="group" aria-label={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          aria-pressed={value !== null && n <= value}
          aria-label={`${n} von 5 Sternen`}
          // Erneuter Klick auf denselben Stern hebt die Bewertung wieder auf.
          onClick={() => onChange(value === n ? null : n)}
        >
          <IconStar filled={value !== null && n <= value} />
        </button>
      ))}
    </div>
  );
}
