import type { FC } from 'react';

interface SliderProps {
  value: number;
  onChange: (next: number) => void;
  presets: readonly number[];
  unitSuffix: string;
  label?: string;
  ariaLabel?: string;
}

const formatPreset = (n: number) =>
  n >= 1000 ? '$' + n.toLocaleString('en-US') : '$' + n;

export const Slider: FC<SliderProps> = ({
  value,
  onChange,
  presets,
  unitSuffix,
  label,
  ariaLabel,
}) => {
  return (
    <div className="w-full">
      {label && (
        <div className="mb-2 text-sm font-medium text-slate-700">{label}</div>
      )}
      <div
        role="radiogroup"
        aria-label={ariaLabel || label || 'Contribution amount'}
        className="grid grid-cols-5 gap-2"
      >
        {presets.map((amount) => {
          const active = amount === value;
          return (
            <button
              key={amount}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(amount)}
              className={`flex min-h-touch min-w-touch items-center justify-center gap-0.5 rounded-xl border-2 px-1 text-sm font-semibold transition active:scale-95 ${
                active
                  ? 'border-brand-green bg-brand-green text-white shadow-md'
                  : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
              }`}
            >
              {formatPreset(amount)}
              <span className="text-xs font-normal opacity-80">{unitSuffix}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};
