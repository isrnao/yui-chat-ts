import { useDeferredValue } from "react";
import type { Chat } from "./types";

type Participant = { id: string; name: string; color: string };

type ChatLogListProps = {
  chatLog: Chat[];
  windowRows: number;
  participants: Participant[];
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
  participants,
}: ChatLogListProps) {
  // 最新 windowRows 件のみ表示（useDeferredValueで重い場合も追従性UP）
  const deferredLog = useDeferredValue(chatLog);
  const chats = [...deferredLog].sort((a, b) => b.time - a.time).slice(0, windowRows);

  return (
    <div className="border-yui-pink-light overflow-y-auto w-full max-w-2xl px-4">
      <div className="text-xs mb-2 flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 mr-2">[{formatTime(Date.now()).slice(0,5)}]</span>
        <span className="text-xs">参加者:</span>
        {participants.length === 0
          ? <b className="text-xs">（なし）</b>
          : participants.map((p) => (
            <span
              key={p.id}
              className="font-bold text-xs"
              style={{
                color: p.color,
                marginLeft: 6,
                marginRight: 3,
                textShadow: "0 1px 1px #fff"
              }}
            >
              {p.name}
            </span>
          ))}
      </div>
      <hr className="border-yui-pink-light mt-1 mb-1" />
      {chats.length === 0 && <div className="text-gray-400">まだ発言はありません。</div>}
      {chats.map((c) => (
        <div key={c.id} className="mb-1">
          <span className="font-bold" style={{ color: c.color, fontSize: "1.08em" }}>
            {c.name}
          </span>
          {c.email && (
            <a
              className="ml-1 text-xs underline text-blue-600"
              href={`mailto:${c.email}`}
              title={c.email}
              target="_blank"
              rel="noopener noreferrer"
            >
              |&gt;
            </a>
          )}
          <span className="font-bold text-gray-400">{" > "}</span>
          <span className="ml-1 text-gray-700">{c.message}</span>
          <span className="ml-2 text-gray-400 text-xs">({formatTime(c.time)})</span>
          <hr className="border-yui-pink-light mt-1 mb-1" />
        </div>
      ))}
    </div>
  );
}
