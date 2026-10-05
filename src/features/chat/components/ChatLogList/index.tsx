import { Fragment, memo, useRef, useState } from 'react';
import type { Chat } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';
import type { IpFilter } from '@features/chat/hooks/useIpFilter';
import { filterByIp } from '@features/chat/utils/ipFilter';
import { addFilteredIp, isFilterableIp } from '@features/chat/utils/ipFilterStore';
import { tapHaptic } from '@features/chat/utils/haptics';
import { collapseRowThen, runFilterTransition } from '@features/chat/utils/filterTransition';
import ParticipantsList from '../ParticipantsList';
import ChatMessage from '../ChatMessage';
import FilterConfirmDialog from '../FilterConfirmDialog';
import Divider from '../shared/Divider';

/** これより多い行を出すときは、画面外の行の描画を省く */
const DEFER_OFFSCREEN_ROWS = 200;

/**
 * フィルタの起点にできる行か（chat-ip-mute Requirement 1.7）。管理人の入退室メッセージ・システム・送信中の発言と、
 * IP が分からない発言（空文字・`*`）は起点にしない
 */
function isMutableRow(chat: Chat): boolean {
  return (
    chat.metadata?.kind !== 'admin' &&
    !chat.system &&
    !chat.optimistic &&
    isFilterableIp(chat.ip_masked)
  );
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
  // 確認の窓を出している伏せ字の IP（Requirement 2）。ダブルタップした行の要素は描画に使わないので ref に持つ
  // （縮めて消すアニメーションのためだけに使う。state に入れると書き換えられない）
  const [pendingIp, setPendingIp] = useState<string | null>(null);
  const pendingRowRef = useRef<HTMLElement | null>(null);
  const requestFilter = (ip: string, row: HTMLElement) => {
    pendingRowRef.current = row;
    setPendingIp(ip);
  };
  const cancelFilter = () => {
    pendingRowRef.current = null;
    setPendingIp(null);
  };
  const confirmFilter = () => {
    const ip = pendingIp;
    const row = pendingRowRef.current;
    if (ip === null) return;
    // 「フィルタする」を押した瞬間に振動させる。iOS は確認の窓の switch が鳴らす（Requirement 3）
    tapHaptic();
    setAnnouncement(`${ip} の発言を非表示にしました。「フィルタ」から解除できます。`);
    pendingRowRef.current = null;
    setPendingIp(null);
    // ダブルタップした行が上下に縮んで消え（下の行もせり上がる）、縮み終わってからフィルタを反映する。
    // 反映では「フィルタ(N)」が脈打つ（Requirement 7.1）。同じ IP のほかの行はこのとき消える
    collapseRowThen(row, () => runFilterTransition(() => addFilteredIp(ip)));
  };

  if (isLoading) {
    return <div className="text-gray-400 mt-8 animate-pulse">チャットログを読み込み中...</div>;
  }

  return (
    <div
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
        <FilterConfirmDialog ip={pendingIp} onConfirm={confirmFilter} onCancel={cancelFilter} />
      )}
    </div>
  );
}

export default memo(ChatLogList);
