import { useId, useRef, useEffect, useCallback } from "react";
import type { ChangeEvent, FormEvent } from "react";
import ChatLogList from "./ChatLogList";
import type { Chat, Participant } from "./types";

export type ChatRoomProps = {
  name: string;
  color: string;
  email: string;
  windowRows: number;
  chatLog: Chat[];
  setChatLog: (log: Chat[]) => void;
  message: string;
  setMessage: (v: string) => void;
  onExit: () => void;
  onSend: (e: FormEvent) => void;
  isPending: boolean;
  participants: Participant[];
  ranking: Map<string, number>;
  onReload: () => void;
};

export default function ChatRoom({
  name,
  color,
  email,
  windowRows,
  chatLog,
  setChatLog,
  message,
  setMessage,
  onExit,
  onSend,
  isPending,
  participants,
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
    <div
      className="min-h-screen flex flex-col items-center py-8"
      style={{
        background: "var(--tw-color-yui-green, #A1FE9F)",
        fontFamily: "var(--tw-font-yui, sans-serif)",
      }}
    >
      <div className="flex items-center justify-between w-full max-w-2xl px-4 pt-3 pb-2">
        <div className="text-2xl font-bold" style={{ color: "#ff69b4" }}>
          ゆいちゃっと
        </div>
        <button
          className="bg-blue-200 text-blue-700 px-2 py-1 rounded-lg text-xs font-bold shadow"
          onClick={onExit}
        >
          退室する
        </button>
      </div>
      <div className="text-sm mt-1 mb-1 w-full max-w-2xl px-4 flex flex-wrap gap-2">
        参加者:
        {participants.length === 0
          ? <b>（なし）</b>
          : participants.map((p) => (
            <span
              key={p.id}
              className="font-bold"
              style={{
                color: p.color,
                marginLeft: 6,
                marginRight: 3,
                textShadow: "0 1px 1px #fff",
              }}
            >
              {p.name}
            </span>
          ))}
        <span className="text-gray-500 ml-2">
          （同じブラウザで新タブを開けば複数人扱い！）
        </span>
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
      <hr className="border-yui-pink w-full max-w-2xl" />
      <form
        onSubmit={onSend}
        className="flex items-center gap-2 mt-2 mb-3 w-full max-w-2xl px-4"
        autoComplete="off"
      >
        <input
          type="text"
          className="flex-1 border border-yui-pink px-3 py-1 rounded-lg text-lg"
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
          className="bg-yui-pink hover:bg-pink-500 text-white px-5 py-2 rounded-2xl font-bold shadow"
          disabled={isPending}
        >
          {isPending ? "送信" : "発言"}
        </button>
        <button
          type="button"
          className="ml-1 px-3 py-2 rounded-xl border text-xs font-bold border-yui-pink text-yui-pink shadow bg-white hover:bg-pink-100"
          onClick={onReload}
          tabIndex={-1}
        >
          リロード
        </button>
        <span className="text-xs text-gray-400 ml-2">
          <b>{windowRows}</b>行表示
        </span>
      </form>
      <ChatLogList chatLog={chatLog} windowRows={windowRows} showHeader={false} />
      <a
        href="http://www.cup.com/yui/"
        target="_blank"
        rel="noreferrer"
        className="fixed right-0 bottom-0 m-4 z-50 text-yui-pink underline text-xs bg-white rounded-xl px-3 py-1 shadow border border-yui-pink-light"
      >
        ゆいちゃっと Pro(Free)
      </a>
    </div>
  );
}
