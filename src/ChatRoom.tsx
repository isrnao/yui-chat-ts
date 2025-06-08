import { useId, useRef, useEffect, useCallback } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { Chat } from "./types";

export type ChatRoomProps = {
  message: string;
  setMessage: (v: string) => void;
  chatLog: Chat[];
  windowRows: number;
  setWindowRows: (v: number) => void;
  onExit: () => void;
  onSend: (e: FormEvent) => void;
  isPending: boolean;
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
  isPending,
  onReload,
  onShowRanking,
}: ChatRoomProps) {
  const messageId = useId();
  const rowsId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPending && inputRef.current) inputRef.current.focus();
  }, [chatLog, isPending]);

  const handleMsgChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setMessage(e.target.value),
    [setMessage]
  );

  return (
    <div className="flex flex-col">
      <div>
        <a href="#" onClick={e => { e.preventDefault(); onExit(); }}>[退室]</a>
        <a href="#" onClick={e => { e.preventDefault(); onShowRanking(); }}
          //className="ml-4 text-xs text-blue-700 underline cursor-pointer"
        >
          [発言ランキング]
        </a>
      </div>
      <form
        onSubmit={onSend}
        className="flex gap-2 mt-2 mb-3 w-full max-w-2xl px-4 [font-family:var(--font-yui)] flex-wrap"
        autoComplete="off"
      >
        <div className="flex flex-nowrap gap-2">
          <button
            type="submit"
            className="
              border-2 border-[var(--ie-gray)] [border-style:outset]
              bg-gradient-to-b from-[var(--ie-bg)] to-[#e4e4e4]
              text-[#222] px-3 py-0.5 text-sm cursor-pointer rounded-none shadow-none mr-2 transition
              [font-family:var(--font-yui)]
              active:[border-style:inset] active:border-[var(--ie-gray)]
              active:bg-gradient-to-b active:from-[#e1e1e1] active:to-[var(--ie-bg)]
              disabled:text-[#a9a9a9] disabled:border-[#e2e2e2]
              disabled:bg-[#f6f6f6] disabled:cursor-not-allowed
              whitespace-nowrap
              leading-[1.6] min-h-[28px]
            "
            disabled={isPending}
          >
            {isPending ? "送信" : "発言"}
          </button>
          <button
            type="button"
            className="
              border-2 border-[var(--ie-gray)] [border-style:outset]
              bg-gradient-to-b from-[var(--ie-bg)] to-[#e4e4e4]
              text-[#222] px-3 py-0.5 text-sm cursor-pointer rounded-none shadow-none mr-2 transition
              [font-family:var(--font-yui)]
              active:[border-style:inset] active:border-[var(--ie-gray)]
              active:bg-gradient-to-b active:from-[#e1e1e1] active:to-[var(--ie-bg)]
              disabled:text-[#a9a9a9] disabled:border-[#e2e2e2]
              disabled:bg-[#f6f6f6] disabled:cursor-not-allowed
              whitespace-nowrap
              leading-[1.6] min-h-[28px]
            "
            onClick={onReload}
            tabIndex={-1}
          >
            リロード
          </button>
        </div>
        <div className="w-full">
          <input
            type="text"
            className="
              w-full flex-1 border-2 border-[var(--ie-gray)] [border-style:inset]
              bg-white px-2 py-0.5 text-sm rounded-none
              shadow-none transition-colors outline-none
              [font-family:var(--font-yui)]
              focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]
              leading-[1.6] min-h-[28px]
            "
            placeholder="発言"
            id={messageId}
            value={message}
            maxLength={120}
            onChange={handleMsgChange}
            disabled={isPending}
            ref={inputRef}
            autoFocus
          />
        </div>
        <label htmlFor={rowsId}>ログ行数</label>
        <select
          className="
            ml-2 border-2 border-[var(--ie-gray)] [border-style:inset]
            bg-white px-2 py-0.5 text-sm rounded-none
            shadow-none outline-none
            [font-family:var(--font-yui)]
            focus:border-2 focus:border-[var(--ie-blue)] focus:bg-[#f8fafd]
          "
          id={rowsId}
          value={windowRows}
          onChange={e => setWindowRows(Number(e.target.value))}
        >
          {[30, 50, 40, 20, 10, 100, 1000].map(v => (
            <option key={v} value={v}>{v}</option>
          ))}
        </select>
      </form>
    </div>
  );
}
