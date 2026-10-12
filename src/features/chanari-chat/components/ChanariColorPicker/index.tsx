import { normalizeColorCode } from '../../utils/colorCode';

export type ChanariColorPickerProps = {
  value: string;
  disabled?: boolean;
  onChange: (next: string) => void;
  ariaLabel?: string;
};

export default function ChanariColorPicker({
  value,
  disabled,
  onChange,
  ariaLabel = 'カラーピッカー',
}: ChanariColorPickerProps) {
  return (
    <label
      className="chanari-color-picker"
      style={{ cursor: 'pointer', display: 'inline-block', verticalAlign: 'middle' }}
    >
      <span aria-hidden="true">🌈</span>
      <input
        type="color"
        disabled={disabled}
        className="h-6 w-6 p-0"
        value={normalizeColorCode(value)}
        aria-label={ariaLabel}
        onChange={(e) => onChange(normalizeColorCode(e.target.value))}
      />
    </label>
  );
}
