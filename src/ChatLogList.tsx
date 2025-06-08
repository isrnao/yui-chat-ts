import { useDeferredValue, useMemo } from "react";
import type { Chat } from "./YuiChat";

export type ChatLogListProps = {
  chatLog: Chat[];
  windowRows: number;
  showHeader?: boolean;
};

const formatTime = (time: number) => {
  const d = new Date(time);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
};

export default function ChatLogList({
  chatLog,
  windowRows,
  showHeader = true,
}: ChatLogListProps) {
  // 最新 windowRows 件のみソートして表示
  const deferredLog = useDeferredValue(chatLog);
  const chats = useMemo(
    () =>
      [...deferredLog]
        .sort((a, b) => b.time - a.time)
        .slice(0, windowRows),
    [deferredLog, windowRows]
  );

  return (
    <div className="bg-white mt-6 p-2 rounded-xl border border-yui-pink-light overflow-y-auto w-full max-w-2xl px-4">
      {showHeader && (
        <div className="font-bold text-yui-pink mb-2">【最近のチャットログ】</div>
      )}
      {chats.length === 0 && <div className="text-gray-400">まだ発言はありません。</div>}
      {chats.map((c) => (
        <div key={c.id} className="mb-1">
          <span className="font-bold" style={{ color: c.color, fontSize: "1.08em" }}>
            {c.name}
          </span>
          <span className="font-bold text-gray-400">{" > "}</span>
          <span className="ml-1 text-gray-700">{c.message}</span>
          <span className="ml-2 text-gray-400 text-xs">({formatTime(c.time)})</span>
          <hr className="border-yui-pink-light mt-1 mb-1" />
        </div>
      ))}
    </div>
  );
}
