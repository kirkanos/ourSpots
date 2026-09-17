import { AMENITIES, AMENITY_LABELS, type Amenity } from '@womo/shared';

interface Props {
  selected: Amenity[];
  onChange: (next: Amenity[]) => void;
}

export function AmenityPicker({ selected, onChange }: Props) {
  const toggle = (amenity: Amenity) => {
    onChange(
      selected.includes(amenity)
        ? selected.filter((a) => a !== amenity)
        : [...selected, amenity],
    );
  };

  return (
    <div className="row" role="group" aria-label="Ausstattung">
      {AMENITIES.map((amenity) => (
        <button
          key={amenity}
          type="button"
          className="chip"
          aria-pressed={selected.includes(amenity)}
          onClick={() => toggle(amenity)}
        >
          {AMENITY_LABELS[amenity]}
        </button>
      ))}
    </div>
  );
}
