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
  /** 表示用のユーザー名（レガシーの「おなまえ:」表示用） */
  userName?: string;
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
  userName,
}: ChatRoomProps) {
  const messageId = useId();
  const rowsId = useId();
  const fontSizeId = useId();
  const fontColorId = useId();
  const boldId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // フォントスタイル状態（デフォルト太字 = bold が常に true なので metadata は常に付与される）
  const [fontSize, setFontSize] = useState<FontSize>(2);
  const [fontColor, setFontColor] = useState<FontColorName>('black');
  const [bold, setBold] = useState(true);

  // メタデータを構築する
  // デフォルト値（size=2, color=black）はペイロード削減のため省略し、bold はレガシー準拠で常に保存する。
  function buildMetadata(): ChatMetadata {
    const meta: ChatMetadata = { version: 1 };

    const fontStyle: NonNullable<ChatMetadata['fontStyle']> = {};
    if (fontSize !== 2) fontStyle.fontSize = fontSize;
    if (fontColor !== 'black') fontStyle.fontColor = fontColor;
    if (bold) fontStyle.bold = true;
    if (Object.keys(fontStyle).length > 0) meta.fontStyle = fontStyle;

    if (avatar && avatar !== 'none') {
      meta.avatar = avatar as Exclude<AvatarId, 'none'>;
    }

    return meta;
  }

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

  useEffect(() => {
    if (!isPending && inputRef.current) inputRef.current.focus();
  }, [chatLog, isPending]);

  const handleClear = () => {
    // レガシーの「消す」は自分の発言を消すコマンド → clear を送信
    void onSend('clear').catch(() => {});
  };

  return (
    <div className="flex flex-col font-yui">
      {/* 1行目: [発言ランキング] [退室] などのリンク群 */}
      <div className="mb-1 flex gap-2 text-green-700 text-sm">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onShowRanking();
          }}
          className="underline"
        >
          [発言ランキング]
        </a>
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            onExit();
          }}
          className="underline"
        >
          [退室]
        </a>
      </div>

      {/* 2行目: [更新] [発言] ボタン + [消す] + おなまえ表示 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const formData = new FormData(e.currentTarget);
          setMessage('');
          startTransition(() => {
            dispatch(formData);
          });
        }}
        className="mb-1 font-yui"
        autoComplete="off"
      >
        <div className="flex items-center gap-1 flex-wrap mb-1">
          <Button type="button" onClick={onReload} tabIndex={-1} disabled={isPending}>
            更新
          </Button>
          <Button type="submit" disabled={isPending}>
            発言
          </Button>
          <Button type="button" onClick={handleClear} disabled={isPending}>
            消す
          </Button>
          {userName && (
            <span className="text-sm ml-2">
              おなまえ:<span className="font-bold text-green-700 ml-1">{userName}</span>
            </span>
          )}
        </div>
        {/* 3行目: 発言入力欄（独立行） */}
        <div className="mb-1">
          <Input
            type="text"
            placeholder="発言"
            id={messageId}
            name="message"
            value={message}
            maxLength={120}
            size={60}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setMessage(e.target.value)}
            disabled={isPending}
            ref={inputRef}
            autoFocus
            aria-label="発言"
          />
        </div>
        {error && <div className="w-full text-xs text-red-500 mt-1">{error}</div>}
      </form>

      {/* 4行目: ログ行数 + Size + 色 + 細字 */}
      <div className="mb-1 flex items-center flex-wrap gap-x-2 gap-y-1 text-sm">
        <label htmlFor={rowsId}>ログ行数:</label>
        <select
          className="border-2 border-ie-gray [border-style:inset] bg-white px-1 py-0.5 text-sm rounded-none"
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

        <label htmlFor={fontSizeId} className="ml-2">
          Size:
        </label>
        <select
          id={fontSizeId}
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value) as FontSize)}
          aria-label="フォントサイズ"
          className="border-2 border-ie-gray [border-style:inset] bg-white px-1 py-0.5 text-sm rounded-none"
        >
          {([1, 2, 3, 4, 5] as const).map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>

        <label htmlFor={fontColorId} className="ml-2">
          色:
        </label>
        <select
          id={fontColorId}
          value={fontColor}
          onChange={(e) => setFontColor(e.target.value as FontColorName)}
          aria-label="フォントカラー"
          className="border-2 border-ie-gray [border-style:inset] bg-white px-1 py-0.5 text-sm rounded-none"
        >
          {FONT_COLOR_NAMES.map((c) => (
            <option key={c} value={c} style={{ color: FONT_COLOR_CSS[c] }}>
              {c}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1 ml-2 cursor-pointer">
          <input
            type="checkbox"
            id={boldId}
            checked={!bold}
            onChange={(e: ChangeEvent<HTMLInputElement>) => setBold(!e.target.checked)}
            aria-label="細字"
            className="w-3.5 h-3.5"
          />
          <span>細字</span>
        </label>
      </div>
    </div>
  );
}
