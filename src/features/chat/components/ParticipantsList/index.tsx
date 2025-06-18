import { formatTime } from '@shared/utils/format';
import type { Participant } from '@features/chat/types';

type Props = {
  participants: Participant[];
};

export default function ParticipantsList({ participants }: Props) {
  return (
    <div className="text-xs mb-2 flex flex-wrap gap-2 items-center">
      <span className="text-xs text-gray-500 mr-2">[{formatTime(Date.now()).slice(0, 5)}]</span>
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
              textShadow: '0 1px 1px #fff',
            }}
          >
            {p.name}
          </span>
        ))
      )}
    </div>
  );
}
