import { useChatRanking } from '@features/chat/hooks/useChatRanking';
import { formatCountTime } from '@shared/utils/format';
import type { Chat } from '@features/chat/types';

type Props = {
  chatLog: Chat[];
};

export default function ChatRanking({ chatLog }: Props) {
  const ranking = useChatRanking(chatLog);

  return (
    <div className="mt-4 w-full mx-auto text-[#444]">
      <div className="mb-2 text-sm font-bold">発言らんきんぐ</div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm font-yui">
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
                <td className="py-1 px-2 border-b border-[#e9d7ba] text-center">{name}</td>
                <td className="py-1 px-2 border-b border-[#e9d7ba] text-center">{count}</td>
                <td className="py-1 px-2 border-b border-[#e9d7ba] text-center">
                  {formatCountTime(lastTime)}
                </td>
                <td className="py-1 px-2 border-b border-[#e9d7ba] text-center">
                  {/* ホスト情報は必要に応じて追加 */}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
