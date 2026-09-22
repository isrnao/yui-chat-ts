import { formatTime } from '@shared/utils/format';
import { useNowMinute } from '@features/chat/hooks/useNowMinute';
import { useParticipants } from '@features/chat/hooks/useParticipants';
import type { Chat } from '@features/chat/types';

type Props = {
  /** 参加者を導出する元のログ。直近 5 分の発言と入退室メッセージから数える */
  chatLog: Chat[];
};

export default function ParticipantsList({ chatLog }: Props) {
  // 時計の表示と参加者の窓を同じ時刻で揃える。分の境界で再レンダーされるのはこの部品だけにし、
  // 長いログ一覧（ChatLogList）を巻き込まない
  const now = useNowMinute();
  const participants = useParticipants(chatLog, now);
  const formattedTime = formatTime(now).slice(0, 5);

  return (
    <div className="text-xs mb-2 flex flex-wrap gap-x-2 items-center">
      {/* 現在時刻は毎分変わるため、視覚回帰テスト（Chromatic）では比較対象から外す。
          表示は常に "HH:MM" の5文字で幅が変わらないので、周囲のレイアウト差分は従来どおり検出される。 */}
      <span data-chromatic="ignore" className="text-xs text-gray-500 mr-2">
        [{formattedTime}]
      </span>
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
        <span className="underline">ルール</span>｜<span className="underline">勧誘は禁止です</span>
        ｜<span className="underline">みんなっ【いいね】してね！</span>
      </span>
    </div>
  );
}
