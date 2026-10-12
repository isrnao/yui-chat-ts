import { useEffect, useEffectEvent, useId, useRef, useState, type FormEvent } from 'react';
import { asyncResult } from '@shared/utils/asyncResult';
import { toUserMessage } from '@features/chat/utils/userFacingError';
import ChanariColorPicker from '../ChanariColorPicker';
import ChanariCharCounter from '../ChanariCharCounter';
import { EFFECT_OPTIONS, type EffectId } from '../../utils/effectOptions';
import { FONT_SIZE_OPTIONS, type LegacyFontSize } from '../../utils/fontSizeOptions';
import { RELOAD_SECONDS_OPTIONS } from '../../utils/draftStore';
import { countGraphemes, MESSAGE_MAX, MESSAGE_MAX_CODE_POINTS } from '@features/chat/inputRules';
import { CHANARI_TEXTS } from '../../chanariTexts';

export type ChanariChatRoomProps = {
  initialMessage?: string;
  onSaveDraft?: (message: string) => void;
  onSend: (msg: string) => void | Promise<void>;
  onReload: () => void;
  onExit: () => void | Promise<void>;
  onClearMyLogs: () => void | Promise<void>;
  nameColor: string;
  setNameColor: (v: string) => void;
  speechColor: string;
  setSpeechColor: (v: string) => void;
  reloadSeconds: number;
  setReloadSeconds: (v: number) => void;
  onRestoreDraft: () => string | void;
  isPending?: boolean;
  error?: string;
  sid: string;
};

export default function ChanariChatRoom({
  initialMessage = '',
  onSaveDraft,
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
  error: externalError,
  sid,
}: ChanariChatRoomProps) {
  const [message, setMessage] = useState(initialMessage);
  // 2012 年版の雰囲気を残す飾りの操作。状態はこの部品の中だけで持ち、送信にもログの描画にも渡さない
  // （.kiro/specs/chanari-retro-chat-ui Requirement 10・16・17）
  const [effect, setEffect] = useState<EffectId>('none');
  const [fontSize, setFontSize] = useState<LegacyFontSize>('default');
  const [disableEffect, setDisableEffect] = useState(false);
  const [atField, setAtField] = useState(false);
  const [actionError, setActionError] = useState('');
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const latest = useRef({ message: initialMessage, lastNonempty: initialMessage });
  const alive = useRef(true);
  const inputRef = useRef<HTMLInputElement>(null);
  const countId = useId();
  const error = externalError || actionError;
  const charCount = countGraphemes(message);
  const invalid = charCount > MESSAGE_MAX || [...message].length > MESSAGE_MAX_CODE_POINTS;
  const isSendDisabled = invalid || pending || isPending;
  const saveLatest = useEffectEvent(() => {
    if (latest.current.lastNonempty.trim()) onSaveDraft?.(latest.current.lastNonempty);
  });
  useEffect(() => {
    if (!message.trim()) return;
    const timer = setTimeout(() => saveLatest(), 300);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => {
    alive.current = true;
    const visibility = () => {
      if (document.visibilityState === 'hidden') saveLatest();
    };
    document.addEventListener('visibilitychange', visibility);
    return () => {
      alive.current = false;
      document.removeEventListener('visibilitychange', visibility);
      saveLatest();
    };
  }, []);
  useEffect(() => {
    inputRef.current?.setCustomValidity(invalid ? '発言は120文字以内で入力してください。' : '');
  }, [invalid]);
  const edit = (text: string) => {
    latest.current.message = text;
    if (text.trim()) latest.current.lastNonempty = text;
    setMessage(text);
  };
  const run = async (operation: () => void | Promise<void>, fallback: string, body?: string) => {
    if (busy.current || isPending) return;
    busy.current = true;
    setPending(true);
    setActionError('');
    const result = await asyncResult(operation);
    if (!alive.current) return;
    busy.current = false;
    setPending(false);
    if (!result.ok) {
      setActionError(toUserMessage(result.error, fallback));
      // 失敗した本文は送信前に下書きへ保存してある。入力欄が空なら戻し、新しい編集があれば
      // そちらを残す（失敗した本文は「発言復元」で戻せる）
      if (body && latest.current.message === '') edit(body);
    }
  };
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy.current || isPending || invalid || message.trim() === '') return;
    const body = message;
    onSaveDraft?.(body);
    edit('');
    void run(
      () => onSend(body),
      '発言を送信できませんでした。時間をおいてもう一度お試しください。',
      body
    );
  };

  return (
    <form
      aria-busy={pending || isPending || undefined}
      name="f1"
      id="main"
      onSubmit={handleSubmit}
      autoComplete="off"
    >
      <input type="hidden" name="sid" value={sid} />
      {/* Reload seconds */}
      <label>
        {CHANARI_TEXTS.reloadSeconds}{' '}
        <select
          value={reloadSeconds}
          onChange={(e) => setReloadSeconds(Number(e.target.value))}
          aria-label={CHANARI_TEXTS.reloadSeconds}
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
        {CHANARI_TEXTS.nameColor}{' '}
        <input
          type="text"
          value={nameColor}
          onChange={(e) => setNameColor(e.target.value)}
          size={7}
          aria-label={CHANARI_TEXTS.nameColor}
        />
      </label>
      <ChanariColorPicker
        value={nameColor}
        onChange={setNameColor}
        ariaLabel={CHANARI_TEXTS.nameColorPicker}
      />{' '}
      {/* 発言色 */}
      <label>
        {CHANARI_TEXTS.speechColor}{' '}
        <input
          type="text"
          value={speechColor}
          onChange={(e) => setSpeechColor(e.target.value)}
          size={7}
          aria-label={CHANARI_TEXTS.speechColor}
        />
      </label>
      <ChanariColorPicker
        value={speechColor}
        onChange={setSpeechColor}
        ariaLabel={CHANARI_TEXTS.speechColorPicker}
      />
      <br />
      {/* エフェクト */}
      <label>
        {CHANARI_TEXTS.effect}{' '}
        <select
          value={effect}
          onChange={(e) => setEffect(e.target.value as EffectId)}
          aria-label={CHANARI_TEXTS.effect}
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
        {CHANARI_TEXTS.fontSize}{' '}
        <select
          value={fontSize}
          onChange={(e) => setFontSize(e.target.value as LegacyFontSize)}
          aria-label={CHANARI_TEXTS.fontSize}
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
          aria-label={CHANARI_TEXTS.disableEffect}
        />
        {CHANARI_TEXTS.disableEffect}
      </label>
      <br />
      {/* 発言 input + char counter */}
      <label>
        {CHANARI_TEXTS.message}{' '}
        <input
          type="text"
          ref={inputRef}
          maxLength={4000}
          aria-invalid={invalid || undefined}
          aria-describedby={countId}
          size={60}
          value={message}
          onChange={(e) => edit(e.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
            )
              event.preventDefault();
          }}
          aria-label={CHANARI_TEXTS.message}
        />
      </label>{' '}
      <ChanariCharCounter id={countId} value={message} />
      <br />
      {/* Buttons */}
      <button type="submit" disabled={!!isSendDisabled}>
        {CHANARI_TEXTS.send}
      </button>
      <button type="button" onClick={onReload} disabled={pending || isPending}>
        {CHANARI_TEXTS.reload}
      </button>
      <button
        type="button"
        onClick={() => {
          const draft = onRestoreDraft();
          if (typeof draft === 'string') edit(draft);
        }}
        disabled={pending || isPending}
      >
        {CHANARI_TEXTS.restore}
      </button>
      <button
        type="button"
        onClick={() => {
          edit('');
          void run(onClearMyLogs, CHANARI_TEXTS.clearFailed);
        }}
        disabled={pending || isPending}
      >
        {CHANARI_TEXTS.clearLogs}
      </button>
      <button
        type="button"
        onClick={() => setAtField((value) => !value)}
        disabled={pending || isPending}
        aria-pressed={atField}
      >
        {CHANARI_TEXTS.atField}
      </button>
      <button
        type="button"
        // 退室するとこの部品はアンマウントされるので、失敗は受け取るだけにする
        onClick={() => void Promise.resolve(onExit()).catch(() => {})}
        disabled={pending || isPending}
      >
        {CHANARI_TEXTS.exit}
      </button>
      {error && (
        <div role="alert" style={{ color: 'red' }}>
          {error}
        </div>
      )}
    </form>
  );
}
