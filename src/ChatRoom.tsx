import { useId, useRef, useEffect, useActionState } from "react";
import type { Chat } from "./types";

export type ChatRoomProps = {
  message: string;
  setMessage: (v: string) => void;
  chatLog: Chat[];
  windowRows: number;
  setWindowRows: (v: number) => void;
  onExit: () => void;
  onSend: (msg: string) => Promise<void>;
  onReload: () => void;
  onShowRanking: () => void;
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
}: ChatRoomProps) {
  const messageId = useId();
  const rowsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  // useActionState for message sending
  const [error, dispatch, isPending] = useActionState(
    async (_prev, formData: FormData) => {
      const msg = formData.get("message")?.toString() ?? "";
      if (!msg.trim()) return;
      try {
        await onSend(msg);
        setMessage("");
        return "";
      } catch (err) {
        return (err as Error)?.message || "送信エラー";
      }
    },
    "",
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
        action={dispatch}
        className="flex gap-2 mt-2 mb-3 w-full max-w-2xl px-4 [font-family:var(--font-yui)] flex-wrap"
        autoComplete="off"
      >
        <div className="flex flex-nowrap gap-2">
          <button
            type="submit"
            className="border-2 border-[var(--ie-gray)] [border-style:outset] bg-gradient-to-b from-[var(--ie-bg)] to-[#e4e4e4] text-[#222] px-3 py-0.5 text-sm cursor-pointer rounded-none shadow-none mr-2 transition [font-family:var(--font-yui)] active:[border-style:inset] active:border-[var(--ie-gray)] active:bg-gradient-to-b active:from-[#e1e1e1] active:to-[var(--ie-bg)] disabled:text-[#a9a9a9] disabled:border-[#e2e2e2] disabled:bg-[#f6f6f6] disabled:cursor-not-allowed whitespace-nowrap leading-[1.6] min-h-[28px]"
            disabled={isPending}
          >
            {"発言"}
          </button>
          <button
            type="button"
            className="border-2 border-[var(--ie-gray)] [border-style:outset] bg-gradient-to-b from-[var(--ie-bg)] to-[#e4e4e4] text-[#222] px-3 py-0.5 text-sm cursor-pointer rounded-none shadow-none mr-2 transition [font-family:var(--font-yui)] active:[border-style:inset] active:border-[var(--ie-gray)] active:bg-gradient-to-b active:from-[#e1e1e1] active:to-[var(--ie-bg)] disabled:text-[#a9a9a9] disabled:border-[#e2e2e2] disabled:bg-[#f6f6f6] disabled:cursor-not-allowed whitespace-nowrap leading-[1.6] min-h-[28px]"
            onClick={onReload}
            tabIndex={-1}
            disabled={isPending}
          >
            リロード
          </button>
        </div>
        <div className="w-full">
          <input
            type="text"
            className="w-full flex-1 border-2 border-[var(--ie-gray)] [border-style:inset] bg-white px-2 py-0.5 text-sm rounded-none shadow-none transition-colors outline-none [font-family:var(--font-yui)] focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd] leading-[1.6] min-h-[28px]"
            placeholder="発言"
            id={messageId}
            name="message"
            value={message}
            maxLength={120}
            onChange={(e) => setMessage(e.target.value)}
            disabled={isPending}
            ref={inputRef}
            autoFocus
            aria-label="発言"
          />
        </div>
        <label htmlFor={rowsId} className="ml-2">
          ログ行数
        </label>
        <select
          className="ml-2 border-2 border-[var(--ie-gray)] [border-style:inset] bg-white px-2 py-0.5 text-sm rounded-none shadow-none outline-none [font-family:var(--font-yui)] focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]"
          id={rowsId}
          value={windowRows}
          onChange={(e) => setWindowRows(Number(e.target.value))}
          aria-label="ログ行数"
          disabled={isPending}
        >
          {[30, 50, 40, 20, 10, 100, 1000].map((v) => (
            <option key={v} value={v}>
              {v}
            </option>
          ))}
        </select>
        {/* エラー表示 */}
        {error && (
          <div className="w-full text-xs text-red-500 mt-1">{error}</div>
        )}
      </form>
    </div>
  );
}
