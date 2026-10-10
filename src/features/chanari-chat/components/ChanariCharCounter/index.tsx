import { countGraphemes, MESSAGE_MAX } from '@features/chat/inputRules';

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
      <span id="wdcnt">{count}</span>文字 <span id="wderr">{isOver ? '文字数オーバー' : ''}</span>
    </>
  );
}
