import { normalizeColorCode } from '../../utils/colorCode';

export type ChanariColorPickerProps = {
  value: string;
  onChange: (next: string) => void;
  ariaLabel?: string;
};

export default function ChanariColorPicker({
  value,
  onChange,
  ariaLabel = 'カラーピッカー',
}: ChanariColorPickerProps) {
  return (
    <label style={{ cursor: 'pointer', display: 'inline-block', verticalAlign: 'middle' }}>
      <span aria-hidden="true">🌈</span>
      <input
        type="color"
        className="sr-only"
        value={value}
        aria-label={ariaLabel}
        onChange={(e) => onChange(normalizeColorCode(e.target.value))}
      />
    </label>
  );
}
