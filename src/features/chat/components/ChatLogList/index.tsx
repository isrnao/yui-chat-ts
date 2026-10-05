import { Fragment, memo, useRef, useState } from 'react';
import type { Chat } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';
import type { IpFilter } from '@features/chat/hooks/useIpFilter';
import { filterByIp, namesForIp } from '@features/chat/utils/ipFilter';
import { addFilteredIp, isFilterableIp } from '@features/chat/utils/ipFilterStore';
import { tapHaptic } from '@features/chat/utils/haptics';
import { nameRowsInView, runFilterTransition } from '@features/chat/utils/filterTransition';
import ParticipantsList from '../ParticipantsList';
import ChatMessage from '../ChatMessage';
import FilterConfirmDialog from '../FilterConfirmDialog';
import Divider from '../shared/Divider';

/** これより多い行を出すときは、画面外の行の描画を省く */
const DEFER_OFFSCREEN_ROWS = 200;

/**
 * フィルタの起点にできる行か（chat-ip-mute Requirement 1.7）。送信中の発言と、IP が分からない発言（空文字・`*`）は
 * 起点にしない。管理人の入退室メッセージ（system）は入室した本人の IP を持つので起点にできる。
 * 機能要求の受付返信など、Edge Function が書いた管理人の発言は IP が空なので、ここで除かれる
 */
function isMutableRow(chat: Chat): boolean {
  return !chat.optimistic && isFilterableIp(chat.ip_masked);
}

type Props = {
  /** 新しい順に並んだログ（useRoomLog が返すもの）。ここでは並べ直さない */
  chatLog: Chat[];
  isLoading?: boolean;
  windowRows: number;
  showRoomName?: boolean;
  onRoomClick?: (roomId: RoomId) => void;
  hideParticipants?: boolean;
  /** 直近の取得が失敗したか。true のとき失敗の表示と再読み込みの導線を出す */
  loadError?: boolean;
  /** 失敗の表示から取り直す */
  onRetry?: () => void;
  /**
   * フィルタした伏せ字の IP（.kiro/specs/chat-ip-mute）。渡したページ（通常の部屋・全部屋まとめ）でだけ
   * 一致する発言を隠す。ちゃなりは渡さないので従来どおり
   */
  ipFilter?: IpFilter;
};

function ChatLogList({
  chatLog,
  isLoading = false,
  windowRows,
  showRoomName,
  onRoomClick,
  hideParticipants,
  loadError = false,
  onRetry,
  ipFilter,
}: Props) {
  // フィルタした発言を除いてから表示行数ぶんを切り出す（chat-ip-mute Requirement 5.1）。
  // 並び順は Room_Log_Store が保ち、楽観的な発言は先頭に重なる。発言が届くたびに
  // 全体を並べ直さないよう、ここでは取り除いて切り出すだけにする（Requirement 17）
  const { visible, hiddenTotal } = ipFilter
    ? filterByIp(chatLog, ipFilter.set)
    : { visible: chatLog, hiddenTotal: 0 };
  const chats = visible.slice(0, windowRows);
  const deferOffscreen = chats.length > DEFER_OFFSCREEN_ROWS;
  // ダブルタップでフィルタしたことを支援技術に伝える（画面には出さない。Requirement 4.11）
  const [announcement, setAnnouncement] = useState('');
  // 確認の窓を出している伏せ字の IP（Requirement 2）
  const [pendingIp, setPendingIp] = useState<string | null>(null);
  // 一覧の外枠。フィルタするときに、見えている行へ View Transition の名前を付けるために使う
  const listRef = useRef<HTMLDivElement>(null);
  const requestFilter = (ip: string) => setPendingIp(ip);
  const confirmFilter = () => {
    const ip = pendingIp;
    if (ip === null) return;
    // 「フィルタする」を押した瞬間に振動させる。iOS は確認の窓の switch が鳴らす（Requirement 3）
    tapHaptic();
    setAnnouncement(`${ip} の発言を非表示にしました。「フィルタ」から解除できます。`);
    // 同じ IP の行がすべてフェードアウトし、下の行が上へ詰まる。「フィルタ(N)」は脈打つ（Requirement 7.1）。
    // 確認の窓を閉じるのも同じ更新に入れる
    // フィルタした時点でその IP から発言している「おなまえ」も保存する（ログから流れても一覧に出せるように）
    const names = namesForIp(chatLog, ip);
    runFilterTransition(
      () => {
        setPendingIp(null);
        addFilteredIp(ip, names);
      },
      () => nameRowsInView(listRef.current)
    );
  };

  if (isLoading) {
    return <div className="text-gray-400 mt-8 animate-pulse">チャットログを読み込み中...</div>;
  }

  return (
    <div
      ref={listRef}
      className="overflow-y-auto rounded-none mt-2 pb-4 font-yui px-[var(--page-gap)]"
      data-testid="chat-log-list"
    >
      {!hideParticipants && <ParticipantsList chatLog={chatLog} />}
      {ipFilter && (
        <div role="status" className="sr-only">
          {announcement}
        </div>
      )}
      <Divider />
      {loadError && (
        // 非同期に現れるため role="alert" でスクリーンリーダーへ通知する
        <div role="alert" className="text-red-600 text-sm py-3">
          チャットログの読み込みに失敗しました。
          {onRetry && (
            <button type="button" className="ml-2 underline text-blue-700" onClick={onRetry}>
              再読み込み
            </button>
          )}
        </div>
      )}
      {chats.length === 0 && !loadError && (
        <div className="text-gray-400 py-3">
          {hiddenTotal > 0
            ? `表示できる発言はありません（${hiddenTotal} 件をフィルタ中）。`
            : 'まだ発言はありません。'}
        </div>
      )}
      {chats.map((c) => (
        <Fragment key={c.uuid}>
          <ChatMessage
            chat={c}
            showRoomName={showRoomName}
            onRoomClick={onRoomClick}
            deferOffscreen={deferOffscreen}
            onFilterIp={ipFilter && isMutableRow(c) ? requestFilter : undefined}
          />
          <Divider />
        </Fragment>
      ))}
      {pendingIp !== null && (
        <FilterConfirmDialog
          ip={pendingIp}
          onConfirm={confirmFilter}
          onCancel={() => setPendingIp(null)}
        />
      )}
    </div>
  );
}

export default memo(ChatLogList);
