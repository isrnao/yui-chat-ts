import { useId, type FormEvent } from 'react';
import { normalizeColorCode } from '../../utils/colorCode';
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
  const errorId = useId();
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (name.trim() === '') return;
    // 入室の失敗は呼び出し元が error prop で表示する（入室中はこのフォームがアンマウントされる）
    Promise.resolve(
      onEnter({
        name,
        nameColor: normalizeColorCode(nameColor, '#ff69b4'),
        speechColor: normalizeColorCode(speechColor),
      })
    ).catch(() => {});
  };

  return (
    <form name="f4" id="main2" onSubmit={handleSubmit} aria-busy={isPending || undefined}>
      <input type="hidden" name="sid" value={sid} />
      <div className="chanari-form-row">
        <label>
          {CHANARI_TEXTS.name}
          <input
            type="text"
            size={10}
            maxLength={20}
            aria-label={CHANARI_TEXTS.name}
            aria-describedby={error ? errorId : undefined}
            required
            pattern=".*\S.*"
            disabled={isPending}
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label>
          {CHANARI_TEXTS.nameColor}
          <input
            type="text"
            size={7}
            aria-label={CHANARI_TEXTS.nameColor}
            disabled={isPending}
            value={nameColor}
            onChange={(event) => setNameColor(event.target.value)}
          />
        </label>
        <ChanariColorPicker
          disabled={isPending}
          value={nameColor}
          onChange={setNameColor}
          ariaLabel="名前色カラーピッカー"
        />
        <label>
          {CHANARI_TEXTS.speechColor}（表示のみ）
          <input
            type="text"
            size={7}
            aria-label={CHANARI_TEXTS.speechColor}
            disabled
            value={speechColor}
            onChange={(event) => setSpeechColor(event.target.value)}
          />
        </label>
        <ChanariColorPicker
          disabled
          value={speechColor}
          onChange={setSpeechColor}
          ariaLabel="発言色カラーピッカー"
        />
      </div>
      <input type="submit" value={CHANARI_TEXTS.enter} disabled={isPending} />
      {error && (
        <div id={errorId} role="alert" className="chanari-error">
          {error}
        </div>
      )}
    </form>
  );
}
