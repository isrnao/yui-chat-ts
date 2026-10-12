import type { FormEvent } from 'react';
import ChanariColorPicker from '../ChanariColorPicker';
import { CHANARI_TEXTS } from '../../chanariTexts';

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
    // 入室の失敗は呼び出し元が error prop で表示する（入室中はこのフォームがアンマウントされる）
    Promise.resolve(onEnter({ name, nameColor, speechColor })).catch(() => {});
  };

  return (
    <form name="f4" id="main2" onSubmit={handleSubmit}>
      <input type="hidden" name="sid" value={sid} />
      <div className="chanari-form-row">
        {CHANARI_TEXTS.name}
        <input
          type="text"
          size={10}
          maxLength={20}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />{' '}
        {CHANARI_TEXTS.nameColor}{' '}
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
        {CHANARI_TEXTS.speechColor}{' '}
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
        <input type="submit" value={CHANARI_TEXTS.enter} disabled={isPending} />
      </div>
      {error && (
        <div role="alert" className="chanari-error">
          {error}
        </div>
      )}
    </form>
  );
}
