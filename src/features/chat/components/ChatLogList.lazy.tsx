import { formatTime } from "@shared/utils/format";
import type { Chat, Participant } from "@features/chat/types";

type Props = {
  chatLog: Chat[];
  windowRows: number;
  participants: Participant[];
};

export default function ChatLogList({ chatLog, windowRows, participants }: Props) {
  const chats = [...chatLog].sort((a, b) => b.time - a.time).slice(0, windowRows);

  return (
    <div className="overflow-y-auto rounded-none mt-2 [font-family:var(--font-yui)]">
      <div className="text-xs mb-2 flex flex-wrap gap-2 items-center">
        <span className="text-xs text-gray-500 mr-2">
          [{formatTime(Date.now()).slice(0, 5)}]
        </span>
        <span className="text-xs">参加者:</span>
        {participants.length === 0 ? (
          <b className="text-xs">（なし）</b>
        ) : (
          participants.map((p) => (
            <span
              key={p.id}
              className="font-bold text-xs"
              style={{
                color: p.color,
                marginLeft: 6,
                marginRight: 3,
                textShadow: "0 1px 1px #fff",
              }}
            >
              {p.name}
            </span>
          ))
        )}
      </div>
      {/* IE風区切り線（上下二重線） */}
      <hr className="border-0 border-t-2 border-b border-t-[var(--ie-gray)] border-b-white h-0 my-2" />
      {chats.length === 0 && (
        <div className="text-gray-400 py-3">まだ発言はありません。</div>
      )}
      {chats.map((c) => (
        <div key={c.id} className="mb-1">
          <span
            className="font-bold"
            style={{ color: c.color, fontSize: "1.08em" }}
          >
            {c.name}
          </span>
          {c.email ? (
            <a
              className="font-bold text-gray-400 underline text-blue-600 px-1"
              href={`mailto:${c.email}`}
              title={c.email}
              target="_blank"
              rel="noopener noreferrer"
            >
              {">"}
            </a>
          ) : (
            <span className="font-bold text-gray-400 px-1">{">"}</span>
          )}
          <span className="ml-1 text-gray-700">{c.message}</span>
          <span className="ml-2 text-gray-400 text-xs">
            ({formatTime(c.time)})
          </span>
          <hr className="border-0 border-t-2 border-b border-t-[var(--ie-gray)] border-b-white h-0 my-2" />
        </div>
      ))}
    </div>
  );
}
