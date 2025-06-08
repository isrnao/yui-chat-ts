import { useId, useRef, useEffect, useCallback } from "react";
import type { ChangeEvent, FormEvent } from "react";
import type { Chat } from "./types";

export type ChatRoomProps = {
  windowRows: number;
  chatLog: Chat[];
  message: string;
  setMessage: (v: string) => void;
  onExit: () => void;
  onSend: (e: FormEvent) => void;
  isPending: boolean;
  ranking: Map<string, number>;
  onReload: () => void;
};

export default function ChatRoom({
  windowRows,
  chatLog,
  message,
  setMessage,
  onExit,
  onSend,
  isPending,
  ranking,
  onReload,
}: ChatRoomProps) {
  const messageId = useId();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isPending && inputRef.current) inputRef.current.focus();
  }, [chatLog, isPending]);

  const handleMsgChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => setMessage(e.target.value),
    [setMessage]
  );

  return (
    <div className="flex flex-col items-center py-8">
      <div className="flex items-center justify-between w-full max-w-2xl px-4 pt-3 pb-2">
        <button
          className="ie-btn text-xs font-bold"
          onClick={onExit}
        >
          退室する
        </button>
      </div>
      <div className="text-xs text-gray-600 px-4 w-full max-w-2xl">
        <span>発言ランキング: </span>
        {[...ranking.entries()]
          .sort((a, b) => b[1] - a[1])
          .map(([n, c]) => (
            <span key={n} className="mr-2">
              <b>{n}</b>:{c}回
            </span>
          ))}
      </div>
      <form
        onSubmit={onSend}
        className="flex items-center gap-2 mt-2 mb-3 w-full max-w-2xl px-4"
        autoComplete="off"
        style={{ fontFamily: '"MS UI Gothic", "Yu Gothic UI", Arial, sans-serif' }}
      >
        <input
          type="text"
          className="flex-1 ie-input"
          placeholder="発言"
          id={messageId}
          value={message}
          maxLength={120}
          onChange={handleMsgChange}
          disabled={isPending}
          ref={inputRef}
          autoFocus
        />
        <button
          type="submit"
          className="ie-btn"
          disabled={isPending}
        >
          {isPending ? "送信" : "発言"}
        </button>
        <button
          type="button"
          className="ie-btn"
          onClick={onReload}
          tabIndex={-1}
        >
          リロード
        </button>
        <span className="text-xs text-gray-400 ml-2">
          <b>{windowRows}</b>行表示
        </span>
      </form>
    </div>
  );
}
