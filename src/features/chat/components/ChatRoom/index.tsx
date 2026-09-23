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
import type { ChatMetadata, FontSize, FontColorName, AvatarId } from '@features/chat/types';
import { FONT_COLOR_NAMES, FONT_COLOR_CSS } from '@features/chat/types';
import Button from '@shared/components/Button';
import Input from '@shared/components/Input';
import { DEFAULT_WINDOW_ROW_OPTIONS } from '@features/chat/utils/windowRows';
import { toUserMessage } from '@features/chat/utils/userFacingError';

const SEND_FAILED_MESSAGE = '発言を送信できませんでした。時間をおいてもう一度お試しください。';

export type ChatRoomProps = {
  message: string;
  setMessage: Dispatch<SetStateAction<string>>;
  windowRows: number;
  setWindowRows: (rows: number) => void;
  /** 「ログ行数」の選択肢。部屋によって上限が違う（getWindowRowOptions） */
  windowRowOptions?: readonly number[];
  onExit: () => void | Promise<void>;
  onSend: (msg: string, metadata?: ChatMetadata) => Promise<void>;
  onReload: () => void;
  onShowRanking?: () => void;
  /**
   * ランキング表示などから通常のチャットログ表示へ戻すためのコールバック。
   * 更新・発言のどちらを押しても呼ぶ。発言は入力が空だと送信自体を行わないため、
   * onSend 側で戻すと「空のまま発言を押しても戻らない」状態になる。
   */
  onBackToChat?: () => void;
  /** アバター識別子（App.tsx から渡される） */
  avatar?: AvatarId;
  /** 表示用のユーザー名（レガシーの「おなまえ:」表示用） */
  userName?: string;
  /** 入室時に選んだ名前の色。「おなまえ:」の名前をこの色で表示する */
  userColor?: string;
  /** Chat-All での返信先部屋名（指定時に「〇〇に返信中」として入力欄付近に表示） */
  replyTargetTitle?: string;
  /** 「〇〇に返信中」をクリックしたときに呼ばれるコールバック（全部屋まとめにリセット用） */
  onResetReplyTarget?: () => void;
};

export default function ChatRoom({
  message,
  setMessage,
  windowRows,
  setWindowRows,
  windowRowOptions = DEFAULT_WINDOW_ROW_OPTIONS,
  onExit,
  onSend,
  onReload,
  onShowRanking,
  onBackToChat,
  avatar,
  userName,
  userColor,
  replyTargetTitle,
  onResetReplyTarget,
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
        return toUserMessage(err, SEND_FAILED_MESSAGE);
      }
    },
    ''
  );

  // 送信アクションが完了したときだけ入力欄へフォーカスを戻す。
  // 以前は依存に chatLog が入っていたため、他人の発言が Realtime で届くたびに
  // フォーカスが奪われていた (モバイルではキーボードが勝手に再表示される)。
  // DOM のフォーカスは React 外部との同期なので Effect が正当な置き場所であり、
  // onSend 内で直接 focus すると input がまだ disabled のことがあるため使わない。
  const wasPendingRef = useRef(false);
  useEffect(() => {
    if (isPending) {
      wasPendingRef.current = true;
      return;
    }
    if (!wasPendingRef.current) return;
    wasPendingRef.current = false;
    inputRef.current?.focus();
  }, [isPending]);

  const handleClear = () => {
    // レガシーの「消す」は自分の発言を消すコマンド → clear を送信
    void onSend('clear').catch(() => {});
  };

  return (
    <div className="flex flex-col font-yui">
      {/* 1行目: [退室] [ランキング] のリンク群 */}
      <div className="mb-1 flex gap-2 text-green-700 text-sm">
        <a
          href="#"
          onClick={(e) => {
            e.preventDefault();
            // 退室するとこの部品はアンマウントされる。退室メッセージの保存の失敗は受け取るだけにする
            void Promise.resolve(onExit()).catch(() => {});
          }}
          className="underline"
        >
          [退室]
        </a>
        {onShowRanking && (
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              onShowRanking();
            }}
            className="underline"
          >
            [ランキング]
          </a>
        )}
      </div>

      {/* 2行目: [更新] [発言] ボタン + [消す] + おなまえ表示 */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          // 送信可否に関わらずチャット表示へ戻す（空入力でも「戻る」操作として機能させる）
          onBackToChat?.();
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
          <Button
            type="button"
            onClick={() => {
              onBackToChat?.();
              onReload();
            }}
            tabIndex={-1}
            disabled={isPending}
          >
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
              おなまえ:
              <span
                className={`font-bold ml-1 ${userColor ? '' : 'text-green-700'}`}
                style={userColor ? { color: userColor } : undefined}
              >
                {userName}
              </span>
            </span>
          )}
          {replyTargetTitle && (
            <button
              type="button"
              className="text-sm ml-2 text-blue-700 underline cursor-pointer"
              onClick={onResetReplyTarget}
              title="クリックで全部屋まとめに戻す"
            >
              →<span className="font-bold ml-1">{replyTargetTitle}</span>に返信中
            </button>
          )}
        </div>
        {/* 3行目: 発言入力欄（独立行）。
            親はブロック要素なので、size=60 由来の固有幅 (Chromium 440px / 全角メトリクスの
            iOS Safari は 860px) はそのままだと親からはみ出す。親の main は overflow-hidden の
            ため横スクロールでも拾えず、SP では入力欄の右側が切れていた。max-w-full で
            親幅を上限にする。幅に余裕がある PC では固有幅のままなので表示は変わらない。 */}
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
            className="max-w-full"
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
          {windowRowOptions.map((v) => (
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
