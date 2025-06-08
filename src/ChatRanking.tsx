import type { Chat } from "./types";

type Props = {
  chatLog: Chat[];
};

function formatCountTime(ts: number): string {
  const d = new Date(ts);
  const w = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getMonth() + 1}/${d.getDate()}(${w[d.getDay()]})${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}

export default function ChatRanking({ chatLog }: Props) {
  const ranking: { name: string; count: number; lastTime: number }[] = [];
  const map = new Map<string, { count: number; lastTime: number }>();
  chatLog.forEach((c) => {
    if (!c.system && c.name) {
      const rec = map.get(c.name) ?? { count: 0, lastTime: 0 };
      rec.count += 1;
      rec.lastTime = Math.max(rec.lastTime, c.time);
      map.set(c.name, rec);
    }
  });
  map.forEach((v, k) => ranking.push({ name: k, ...v }));
  ranking.sort((a, b) => b.count - a.count || b.lastTime - a.lastTime);

  return (
    <div className="mt-4 w-full mx-auto text-[#444]">
      <div className="mb-2 text-sm font-bold">発言らんきんぐ</div>
      <div className="overflow-x-auto">
        <table
          className="w-full text-sm"
          style={{ fontFamily: "var(--font-yui)" }}
        >
          <thead>
            <tr className="text-[#444]">
              <th className="py-1 px-2 font-bold whitespace-nowrap border-b border-[#d2b48c]">
                おなまえ
              </th>
              <th className="py-1 px-2 font-bold whitespace-nowrap border-b border-[#d2b48c]">
                発言回数
              </th>
              <th className="py-1 px-2 font-bold whitespace-nowrap border-b border-[#d2b48c]">
                最終発言時刻
              </th>
              <th className="py-1 px-2 font-bold whitespace-nowrap border-b border-[#d2b48c]">
                ホスト情報
              </th>
            </tr>
          </thead>
          <tbody>
            {ranking.length === 0 && (
              <tr>
                <td colSpan={4} className="text-center text-gray-400 py-2">
                  データなし
                </td>
              </tr>
            )}
            {ranking.map(({ name, count, lastTime }) => (
              <tr key={name}>
                <td className="py-1 px-2 border-b border-[#e9d7ba] text-center">
                  {name}
                </td>
                <td className="py-1 px-2 border-b border-[#e9d7ba] text-center">
                  {count}
                </td>
                <td className="py-1 px-2 border-b border-[#e9d7ba] text-center">
                  {formatCountTime(lastTime)}
                </td>
                <td className="py-1 px-2 border-b border-[#e9d7ba] text-xs text-gray-400 text-center">
                  -
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
