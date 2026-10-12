import { countGraphemes, MESSAGE_MAX } from '@features/chat/inputRules';
import { CHANARI_TEXTS } from '../../chanariTexts';

export type ChanariCharCounterProps = {
  value: string;
  maxLength?: number;
};

export default function ChanariCharCounter({
  value,
  maxLength = MESSAGE_MAX,
}: ChanariCharCounterProps) {
  const count = countGraphemes(value);
  const isOver = count > maxLength;

  return (
    <>
      <span id="wdcnt">{count}</span>
      {CHANARI_TEXTS.charCount} <span id="wderr">{isOver ? CHANARI_TEXTS.overLimit : ''}</span>
    </>
  );
}
