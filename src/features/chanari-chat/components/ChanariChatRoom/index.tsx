import { useState, type FormEvent } from 'react';
import ChanariColorPicker from '../ChanariColorPicker';
import ChanariCharCounter from '../ChanariCharCounter';
import { countChars } from '../../utils/countChars';
import { EFFECT_OPTIONS, type EffectId } from '../../utils/effectOptions';
import { FONT_SIZE_OPTIONS, type LegacyFontSize } from '../../utils/fontSizeOptions';
import { RELOAD_SECONDS_OPTIONS } from '../../utils/draftStore';

export type ChanariChatRoomProps = {
  message: string;
  setMessage: (v: string) => void;
  onSend: (msg: string) => void | Promise<void>;
  onReload: () => void;
  onExit: () => void;
  onClearMyLogs: () => void;
  nameColor: string;
  setNameColor: (v: string) => void;
  speechColor: string;
  setSpeechColor: (v: string) => void;
  reloadSeconds: number;
  setReloadSeconds: (v: number) => void;
  onRestoreDraft: () => void;
  isPending?: boolean;
  error?: string;
  sid: string;
};

export default function ChanariChatRoom({
  message,
  setMessage,
  onSend,
  onReload,
  onExit,
  onClearMyLogs,
  nameColor,
  setNameColor,
  speechColor,
  setSpeechColor,
  reloadSeconds,
  setReloadSeconds,
  onRestoreDraft,
  isPending,
  error,
  sid,
}: ChanariChatRoomProps) {
  // Local-only UI state
  const [effect, setEffect] = useState<EffectId>('none');
  const [disableEffect, setDisableEffect] = useState(false);
  const [fontSize, setFontSize] = useState<LegacyFontSize>('default');
  const [atField, setAtField] = useState(false);

  const charCount = countChars(message);
  const isSendDisabled = charCount > 120 || isPending;

  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (message.trim() === '' || countChars(message) > 120) return;
    onSend(message);
  };

  return (
    <form name="f1" id="main" onSubmit={handleSubmit} autoComplete="off">
      <input type="hidden" name="sid" value={sid} />
      {/* Reload seconds */}
      <label>
        リロード秒{' '}
        <select
          value={reloadSeconds}
          onChange={(e) => setReloadSeconds(Number(e.target.value))}
          aria-label="リロード秒"
        >
          {RELOAD_SECONDS_OPTIONS.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <br />
      {/* 名前色 */}
      <label>
        名前色{' '}
        <input
          type="text"
          value={nameColor}
          onChange={(e) => setNameColor(e.target.value)}
          size={7}
          aria-label="名前色"
        />
      </label>
      <ChanariColorPicker value={nameColor} onChange={setNameColor} ariaLabel="名前色ピッカー" />{' '}
      {/* 発言色 */}
      <label>
        発言色{' '}
        <input
          type="text"
          value={speechColor}
          onChange={(e) => setSpeechColor(e.target.value)}
          size={7}
          aria-label="発言色"
        />
      </label>
      <ChanariColorPicker
        value={speechColor}
        onChange={setSpeechColor}
        ariaLabel="発言色ピッカー"
      />
      <br />
      {/* エフェクト */}
      <label>
        エフェクト{' '}
        <select
          value={effect}
          onChange={(e) => setEffect(e.target.value as EffectId)}
          aria-label="エフェクト"
        >
          {EFFECT_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>{' '}
      {/* 文字サイズ */}
      <label>
        文字サイズ{' '}
        <select
          value={fontSize}
          onChange={(e) => setFontSize(e.target.value as LegacyFontSize)}
          aria-label="文字サイズ"
        >
          {FONT_SIZE_OPTIONS.map((opt) => (
            <option key={opt.id} value={opt.id}>
              {opt.label}
            </option>
          ))}
        </select>
      </label>{' '}
      {/* エフェクト無効 */}
      <label>
        <input
          type="checkbox"
          checked={disableEffect}
          onChange={(e) => setDisableEffect(e.target.checked)}
          aria-label="エフェクト無効"
        />
        エフェクト無効
      </label>
      <br />
      {/* 発言 input + char counter */}
      <label>
        発言{' '}
        <input
          type="text"
          size={60}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          aria-label="発言"
        />
      </label>{' '}
      <ChanariCharCounter value={message} />
      <br />
      {/* Buttons */}
      <button type="submit" disabled={!!isSendDisabled}>
        チャットで発言する
      </button>
      <button type="button" onClick={onReload} disabled={isPending}>
        更新
      </button>
      <button type="button" onClick={onRestoreDraft} disabled={isPending}>
        発言復元
      </button>
      <button type="button" onClick={onClearMyLogs} disabled={isPending}>
        ログ消去
      </button>
      <button
        type="button"
        onClick={() => setAtField((prev) => !prev)}
        disabled={isPending}
        aria-pressed={atField}
      >
        AT フィールド
      </button>
      <button type="button" onClick={onExit} disabled={isPending}>
        チャットから退室する
      </button>
      {error && <div style={{ color: 'red' }}>{error}</div>}
    </form>
  );
}
