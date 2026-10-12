import { useEffect, useEffectEvent, useId, useRef, useState, type FormEvent } from 'react';
import { asyncResult } from '@shared/utils/asyncResult';
import { toUserMessage } from '@features/chat/utils/userFacingError';
import ChanariColorPicker from '../ChanariColorPicker';
import ChanariCharCounter from '../ChanariCharCounter';
import { EFFECT_OPTIONS } from '../../utils/effectOptions';
import { FONT_SIZE_OPTIONS } from '../../utils/fontSizeOptions';
import { RELOAD_SECONDS_OPTIONS } from '../../utils/draftStore';
import { countGraphemes, MESSAGE_MAX, MESSAGE_MAX_CODE_POINTS } from '@features/chat/inputRules';
import { CHANARI_TEXTS } from '../../chanariTexts';

export type ChanariChatRoomProps = {
  initialMessage?: string;
  failedMessage?: string;
  onRetrySend?: () => Promise<void>;
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
  failedMessage,
  onRetrySend,
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
  const [actionError, setActionError] = useState('');
  const [pending, setPending] = useState(false);
  const [failedBody, setFailedBody] = useState('');
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
      if (body && latest.current.message === '') edit(body);
      else if (body) setFailedBody(body);
    } else setFailedBody('');
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
          disabled
          value={speechColor}
          onChange={(e) => setSpeechColor(e.target.value)}
          size={7}
          aria-label={CHANARI_TEXTS.speechColor}
        />
      </label>
      <ChanariColorPicker
        value={speechColor}
        onChange={setSpeechColor}
        disabled
        ariaLabel={CHANARI_TEXTS.speechColorPicker}
      />
      <br />
      <span className="chanari-display-only">
        発言色・文字サイズ・エフェクト・ATフィールドは表示のみです。
      </span>
      {/* エフェクト */}
      <label>
        {CHANARI_TEXTS.effect}{' '}
        <select defaultValue="none" disabled aria-label={CHANARI_TEXTS.effect}>
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
        <select defaultValue="default" disabled aria-label={CHANARI_TEXTS.fontSize}>
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
          defaultChecked={false}
          disabled
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
      <button type="button" disabled aria-pressed={false}>
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
      {failedMessage && onRetrySend && (
        <button
          type="button"
          disabled={pending || isPending}
          onClick={() => {
            if (busy.current || isPending) return;
            if (message === failedMessage) edit('');
            void run(onRetrySend, '同じ送信を再試行できませんでした。');
          }}
        >
          同じ送信を再試行
        </button>
      )}
      {failedBody && (
        <button
          type="button"
          onClick={() => {
            edit(failedBody);
            setFailedBody('');
          }}
        >
          送信できなかった本文を戻す
        </button>
      )}
      {error && (
        <div role="alert" style={{ color: 'red' }}>
          {error}
        </div>
      )}
    </form>
  );
}
