import { useId } from 'react';
import { countGraphemes, MESSAGE_MAX } from '@features/chat/inputRules';
import { CHANARI_TEXTS } from '../../chanariTexts';

export type ChanariCharCounterProps = {
  value: string;
  id?: string;
  maxLength?: number;
};

export default function ChanariCharCounter({
  value,
  id,
  maxLength = MESSAGE_MAX,
}: ChanariCharCounterProps) {
  const generatedId = useId();
  const count = countGraphemes(value);
  const isOver = count > maxLength;

  return (
    <span id={id ?? generatedId} data-over-limit={isOver || undefined}>
      <span className="chanari-count">{count}</span>
      {CHANARI_TEXTS.charCount}{' '}
      <span className="chanari-count-error" role={isOver ? 'status' : undefined}>
        {isOver ? CHANARI_TEXTS.overLimit : ''}
      </span>
    </span>
  );
}
