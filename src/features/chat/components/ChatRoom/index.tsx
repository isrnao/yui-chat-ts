import {
  useId,
  useRef,
  useEffect,
  useState,
  useActionState,
  startTransition,
  type ChangeEvent,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { Chat, ChatMetadata, FontSize, FontColorName, AvatarId } from '@features/chat/types';
import { FONT_COLOR_NAMES, FONT_COLOR_CSS } from '@features/chat/types';
import Button from '@shared/components/Button';
import Input from '@shared/components/Input';

export type ChatRoomProps = {
  message: string;
  setMessage: Dispatch<SetStateAction<string>>;
  chatLog: Chat[];
  windowRows: number;
  setWindowRows: Dispatch<SetStateAction<number>>;
  onExit: () => void;
  onSend: (msg: string, metadata?: ChatMetadata) => Promise<void>;
  onReload: () => void;
  onShowRanking: () => void;
  /** アバター識別子（App.tsx から渡される） */
  avatar?: AvatarId;
  /** 音声通知の有効化状態と関数（useLookSound から） */
  isAudioEnabled?: boolean;
  enableAudio?: () => Promise<void>;
};

export default function ChatRoom({
  message,
  setMessage,
  chatLog,
  windowRows,
  setWindowRows,
  onExit,
  onSend,
  onReload,
  onShowRanking,
  avatar,
  isAudioEnabled = false,
  enableAudio,
}: ChatRoomProps) {
  const messageId = useId();
  const rowsId = useId();
  const fontStyleId = useId();
  const fontSizeId = useId();
  const fontColorId = useId();
  const boldId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // フォントスタイル状態
  const [fontStyleEnabled, setFontStyleEnabled] = useState(false);
  const [fontSize, setFontSize] = useState<FontSize>(2);
  const [fontColor, setFontColor] = useState<FontColorName>('black');
  const [bold, setBold] = useState(false);

  // メタデータを構築する
  function buildMetadata(): ChatMetadata | undefined {
    const hasFont = fontStyleEnabled;
    const hasAvatar = avatar && avatar !== 'none';
    if (!hasFont && !hasAvatar) return undefined;

    const meta: ChatMetadata = { version: 1 };

    if (hasFont) {
      meta.fontStyle = {};
      if (fontSize !== 2) meta.fontStyle.fontSize = fontSize;
      if (fontColor !== 'black') meta.fontStyle.fontColor = fontColor;
      if (bold) meta.fontStyle.bold = true;
      // fontStyle が空なら除去
      if (Object.keys(meta.fontStyle).length === 0) delete meta.fontStyle;
    }

    if (hasAvatar) {
      meta.avatar = avatar as Exclude<AvatarId, 'none'>;
    }

    return meta;
  }

  // useActionState for message sending
  const [error, dispatch, isPending] = useActionState(
    async (_prev: unknown, formData: FormData) => {
      const msg = formData.get('message')?.toString() ?? '';
      if (!msg.trim()) return;
      try {
        const metadata = buildMetadata();
        await onSend(msg, metadata);
        return '';
      } catch (err) {
        return (err as Error)?.message || '送信エラー';
      }
    },
    ''
  );

  // オートフォーカス
  useEffect(() => {
    if (!isPending && inputRef.current) inputRef.current.focus();
  }, [chatLog, isPending]);

  return (
    <div className="flex flex-col">
      <div className="mb-1 flex gap-2">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onExit();
          }}
          className="underline text-blue-700"
        >
          [退室]
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onShowRanking();
          }}
          className="underline text-blue-700"
        >
          [発言ランキング]
        </a>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          setMessage('');
          startTransition(() => {
            dispatch(formData);
          });
        }}
        className="flex gap-2 mt-2 mb-3 w-full max-w-2xl px-4 font-yui flex-wrap"
        autoComplete="off"
      >
        <div className="flex flex-nowrap gap-2">
          <Button type="submit" disabled={isPending}>
            {'発言'}
          </Button>
          <Button type="button" onClick={onReload} tabIndex={-1} disabled={isPending}>
            リロード
          </Button>
        </div>
        <div className="w-full">
          <Input
            type="text"
            placeholder="発言"
            id={messageId}
            name="message"
            value={message}
            maxLength={120}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)}
            disabled={isPending}
            ref={inputRef}
            autoFocus
            aria-label="発言"
            className="w-full flex-1"
          />
        </div>
        <label htmlFor={rowsId} className="ml-2">
          ログ行数
        </label>
        <select
          className="ml-2 border-2 border-ie-gray [border-style:inset] px-2 py-0.5 text-sm rounded-none shadow-none outline-none font-yui focus:border-2 focus:border-ie-blue focus:bg-[#f8fafd]"
          id={rowsId}
          value={windowRows}
          onChange={(e) => setWindowRows(Number(e.target.value))}
          aria-label="ログ行数"
          disabled={isPending}
        >
          {[30, 50, 40, 20, 10, 100].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {/* エラー表示 */}
        {error && <div className="w-full text-xs text-red-500 mt-1">{error}</div>}
      </form>

      {/* フォントスタイルコントロール */}
      <div className="px-4 mb-2 flex flex-wrap items-center gap-2 text-sm font-yui">
        <label className="flex items-center gap-1 cursor-pointer">
          <Input
            type="checkbox"
            id={fontStyleId}
            checked={fontStyleEnabled}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setFontStyleEnabled(e.target.checked)}
            aria-label="フォントスタイル"
            className="w-4 h-4"
          />
          <span>フォントスタイル</span>
        </label>

        {fontStyleEnabled && (
          <>
            {/* フォントサイズ */}
            <label htmlFor={fontSizeId} className="ml-2">
              サイズ:
            </label>
            <select
              id={fontSizeId}
              value={fontSize}
              onChange={(e) => setFontSize(Number(e.target.value) as FontSize)}
              aria-label="フォントサイズ"
              className="border-2 border-ie-gray [border-style:inset] bg-white px-1 py-0.5 text-sm rounded-none shadow-none outline-none font-yui"
            >
              {([1, 2, 3, 4, 5] as const).map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>

            {/* フォントカラー */}
            <label htmlFor={fontColorId} className="ml-2">
              色:
            </label>
            <select
              id={fontColorId}
              value={fontColor}
              onChange={(e) => setFontColor(e.target.value as FontColorName)}
              aria-label="フォントカラー"
              className="border-2 border-ie-gray [border-style:inset] bg-white px-1 py-0.5 text-sm rounded-none shadow-none outline-none font-yui"
            >
              {FONT_COLOR_NAMES.map((c) => (
                <option key={c} value={c} style={{ color: FONT_COLOR_CSS[c] }}>
                  {c}
                </option>
              ))}
            </select>

            {/* 太字 */}
            <label className="flex items-center gap-1 ml-2 cursor-pointer">
              <Input
                type="checkbox"
                id={boldId}
                checked={bold}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setBold(e.target.checked)}
                aria-label="太字"
                className="w-4 h-4"
              />
              <span>太字</span>
            </label>
          </>
        )}
      </div>

      {/* 音声通知有効化ボタン */}
      {enableAudio && !isAudioEnabled && (
        <div className="px-4 mb-2">
          <Button
            type="button"
            onClick={() => enableAudio()}
            className="text-xs"
            aria-label="通知音を有効にする"
          >
            🔔 通知音を有効にする
          </Button>
        </div>
      )}
    </div>
  );
}
