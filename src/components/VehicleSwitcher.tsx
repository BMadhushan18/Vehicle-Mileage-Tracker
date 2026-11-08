import type { VehicleWithStats } from '../../shared/types';

export function VehicleSwitcher({
  vehicles,
  value,
  onChange,
  allowAll = true,
}: {
  vehicles: VehicleWithStats[];
  value: string;
  onChange: (id: string) => void;
  allowAll?: boolean;
}) {
  if (!vehicles.length) return null;
  const options = allowAll
    ? [{ id: 'all', name: 'All vehicles', color_tag: '' }, ...vehicles]
    : vehicles;
  return (
    <div className="chips" role="radiogroup" aria-label="Choose vehicle">
      {options.map((v) => {
        const active = v.id === value;
        return (
          <button
            key={v.id}
            type="button"
            role="radio"
            aria-checked={active}
            className={`chip${active ? ' active' : ''}`}
            onClick={() => onChange(v.id)}
          >
            {v.color_tag && (
              <span className="dot" style={{ background: v.color_tag }} aria-hidden="true" />
            )}
            {v.name}
          </button>
        );
      })}
    </div>
  );
}
