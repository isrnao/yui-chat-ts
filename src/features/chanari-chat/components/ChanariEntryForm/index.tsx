import type { FormEvent } from 'react';
import ChanariColorPicker from '../ChanariColorPicker';

export type ChanariEntryFormProps = {
  name: string;
  setName: (v: string) => void;
  nameColor: string;
  setNameColor: (v: string) => void;
  speechColor: string;
  setSpeechColor: (v: string) => void;
  sid: string;
  onEnter: (args: { name: string; nameColor: string; speechColor: string }) => void | Promise<void>;
  isPending?: boolean;
  error?: string;
};

export default function ChanariEntryForm({
  name,
  setName,
  nameColor,
  setNameColor,
  speechColor,
  setSpeechColor,
  sid,
  onEnter,
  isPending = false,
  error,
}: ChanariEntryFormProps) {
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') return;
    onEnter({ name, nameColor, speechColor });
  };

  return (
    <form name="f4" id="main2" onSubmit={handleSubmit}>
      <input type="hidden" name="sid" value={sid} />
      <div className="chanari-form-row">
        おなまえ
        <input
          type="text"
          size={10}
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />{' '}
        名前色{' '}
        <input
          type="text"
          size={7}
          value={nameColor}
          onChange={(e) => setNameColor(e.target.value)}
        />
        <ChanariColorPicker
          value={nameColor}
          onChange={setNameColor}
          ariaLabel="名前色カラーピッカー"
        />{' '}
        発言色{' '}
        <input
          type="text"
          size={7}
          value={speechColor}
          onChange={(e) => setSpeechColor(e.target.value)}
        />
        <ChanariColorPicker
          value={speechColor}
          onChange={setSpeechColor}
          ariaLabel="発言色カラーピッカー"
        />
      </div>
      <div>
        <input type="submit" value="チャットに参加する" disabled={isPending} />
      </div>
      {error && <div className="chanari-error">{error}</div>}
    </form>
  );
}
