import { countChars } from '../../utils/countChars';

export type ChanariCharCounterProps = {
  value: string;
  maxLength?: number;
};

export default function ChanariCharCounter({ value, maxLength = 120 }: ChanariCharCounterProps) {
  const count = countChars(value);
  const isOver = count > maxLength;

  return (
    <>
      <span id="wdcnt">{count}</span>文字 <span id="wderr">{isOver ? '文字数オーバー' : ''}</span>
    </>
  );
}
