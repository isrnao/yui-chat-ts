import { formatTime } from '@shared/utils/format';
import type { Participant } from '@features/chat/types';

type Props = {
  participants: Participant[];
  currentTime: number;
};

export default function ParticipantsList({ participants, currentTime }: Props) {
  const formattedTime = formatTime(currentTime).slice(0, 5);

  return (
    <div className="text-xs mb-2 flex flex-wrap gap-x-2 items-center">
      <span className="text-xs text-gray-500 mr-2">[{formattedTime}]</span>
      <span className="text-xs">参加者({participants.length}):</span>
      {participants.length === 0 ? (
        <b className="text-xs">（なし）</b>
      ) : (
        participants.map((p) => (
          <span
            key={p.uuid}
            className="font-bold text-xs"
            style={{
              color: p.color,
              marginLeft: 6,
              marginRight: 3,
              textShadow: '0 1px 1px #fff',
            }}
          >
            {p.name}
          </span>
        ))
      )}
      {/* レガシー風固定リンク群（テキストのみ再現） */}
      <span className="text-xs text-gray-600 ml-2">
        ｜<span className="underline">ランキング</span>｜<span className="underline">詩</span>｜
        <span className="underline">待</span>｜<span className="underline">フィルタ方法</span>｜
        <span className="underline">ルール</span>｜
        <span className="underline">勧誘は禁止です</span>｜
        <span className="underline">みんなっ【いいね】してね！</span>
      </span>
    </div>
  );
}
