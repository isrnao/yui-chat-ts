import { Fragment, memo, useRef, useState } from 'react';
import type { Chat } from '@features/chat/types';
import type { RoomId } from '@features/chat/rooms';
import type { IpFilter } from '@features/chat/hooks/useIpFilter';
import { countWordMatches, filterByIp, namesForIp } from '@features/chat/utils/ipFilter';
import {
  addFilteredIp,
  addFilteredName,
  addFilteredWord,
  normalizeFilterWord,
} from '@features/chat/utils/ipFilterStore';
import type { FilterRequest } from '@features/chat/utils/filterRequest';
import { tapHaptic } from '@features/chat/utils/haptics';
import { nameRowsInView, runFilterTransition } from '@features/chat/utils/filterTransition';
import ParticipantsList from '../ParticipantsList';
import ChatMessage from '../ChatMessage';
import FilterConfirmDialog from '../FilterConfirmDialog';
import ReportDialog from '../ReportDialog';
import WordPicker from '../FilterConfirmDialog/WordPicker';
import Divider from '../shared/Divider';
import { UI_MESSAGES } from '@features/chat/uiMessages';
import { CHAT_TEXTS, fillText } from '@features/chat/chatTexts';

/** これより多い行を出すときは、画面外の行の描画を省く */
const DEFER_OFFSCREEN_ROWS = 200;

/**
 * フィルタの起点にできる行か（chat-ip-mute Requirement 1.7）。送信中の発言は起点にしない。
 * どのフィルタになるかは押した場所で決まり（filterRequest.ts）、IP が分からない行（空文字・`*`）でも名前と言葉は使える
 */
function isMutableRow(chat: Chat): boolean {
  return !chat.optimistic;
}

/** 確認の窓を出しているフィルタ。言葉は窓の中で選び直す */
type PendingFilter = (
  | { kind: 'ip'; ip: string }
  | { kind: 'name'; name: string }
  | { kind: 'word'; message: string; word: string }
) & { chatUuid: string };

/** 確認の窓の見出しと説明（Requirement 2.1・9） */
function confirmText(pending: PendingFilter): { title: string; description: string } {
  switch (pending.kind) {
    case 'ip':
      return {
        title: fillText(CHAT_TEXTS.filter.ipTitle, { ip: pending.ip }),
        description: CHAT_TEXTS.filter.ipDescription,
      };
    case 'name':
      return {
        title: fillText(CHAT_TEXTS.filter.nameTitle, { name: pending.name }),
        description: CHAT_TEXTS.filter.nameDescription,
      };
    case 'word':
      return {
        title: CHAT_TEXTS.filter.wordTitle,
        description: CHAT_TEXTS.filter.wordDescription,
      };
  }
}

/** 支援技術に伝える文言（Requirement 4.11） */
function announceText(pending: PendingFilter): string {
  switch (pending.kind) {
    case 'ip':
      return fillText(CHAT_TEXTS.filter.ipAnnounce, { ip: pending.ip });
    case 'name':
      return fillText(CHAT_TEXTS.filter.nameAnnounce, { name: pending.name });
    case 'word':
      return fillText(CHAT_TEXTS.filter.wordAnnounce, { word: normalizeFilterWord(pending.word) });
  }
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
    ? filterByIp(chatLog, ipFilter)
    : { visible: chatLog, hiddenTotal: 0 };
  const chats = visible.slice(0, windowRows);
  const deferOffscreen = chats.length > DEFER_OFFSCREEN_ROWS;
  // ダブルタップでフィルタしたことを支援技術に伝える（画面には出さない。Requirement 4.11）
  const [announcement, setAnnouncement] = useState('');
  // 確認の窓を出しているフィルタ（Requirement 2）
  const [pending, setPending] = useState<PendingFilter | null>(null);
  // 通報の窓を出している発言（確認の窓の「通報する」から開く。Task 0.6）
  const [reporting, setReporting] = useState<string | null>(null);
  // 一覧の外枠。フィルタするときに、見えている行へ View Transition の名前を付けるために使う
  const listRef = useRef<HTMLDivElement>(null);
  const requestFilter = (request: FilterRequest) => {
    const { chatUuid } = request;
    if (request.kind === 'ip') setPending({ kind: 'ip', ip: request.ip, chatUuid });
    else if (request.kind === 'name') setPending({ kind: 'name', name: request.name, chatUuid });
    else setPending({ kind: 'word', message: request.message, word: request.selected, chatUuid });
  };
  const changeWord = (word: string) =>
    setPending((current) => (current?.kind === 'word' ? { ...current, word } : current));
  const confirmFilter = () => {
    if (pending === null) return;
    if (pending.kind === 'word' && !normalizeFilterWord(pending.word)) return;
    // 「フィルタする」を押した瞬間に振動させる。iOS は確認の窓の switch が鳴らす（Requirement 3）
    tapHaptic();
    setAnnouncement(announceText(pending));
    // IP はフィルタした時点でその IP から発言している「おなまえ」も保存する（ログから流れても一覧に出せるように）
    const names = pending.kind === 'ip' ? namesForIp(chatLog, pending.ip) : [];
    // 当たる行がすべてフェードアウトし、下の行が上へ詰まる（Requirement 7.1）。
    // 確認の窓を閉じるのも同じ更新に入れる
    runFilterTransition(
      () => {
        setPending(null);
        if (pending.kind === 'ip') addFilteredIp(pending.ip, names);
        else if (pending.kind === 'name') addFilteredName(pending.name);
        else addFilteredWord(pending.word);
      },
      () => nameRowsInView(listRef.current)
    );
  };

  if (isLoading) {
    return <div className="text-gray-400 mt-8 animate-pulse">{CHAT_TEXTS.log.loading}</div>;
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
          {UI_MESSAGES.loadFailed}
          {onRetry && (
            <button type="button" className="ml-2 underline text-blue-700" onClick={onRetry}>
              {UI_MESSAGES.retry}
            </button>
          )}
        </div>
      )}
      {chats.length === 0 && !loadError && (
        <div className="text-gray-400 py-3">
          {hiddenTotal > 0
            ? fillText(CHAT_TEXTS.log.emptyFiltered, { count: hiddenTotal })
            : CHAT_TEXTS.log.empty}
        </div>
      )}
      {chats.map((c) => (
        <Fragment key={c.uuid}>
          <ChatMessage
            chat={c}
            showRoomName={showRoomName}
            onRoomClick={onRoomClick}
            deferOffscreen={deferOffscreen}
            onFilterRequest={ipFilter && isMutableRow(c) ? requestFilter : undefined}
          />
          <Divider />
        </Fragment>
      ))}
      {pending !== null && (
        <FilterConfirmDialog
          {...confirmText(pending)}
          confirmDisabled={pending.kind === 'word' && !normalizeFilterWord(pending.word)}
          onConfirm={confirmFilter}
          onCancel={() => setPending(null)}
          onReport={() => {
            setReporting(pending.chatUuid);
            setPending(null);
          }}
        >
          {pending.kind === 'word' && (
            <WordPicker
              message={pending.message}
              value={pending.word}
              onChange={changeWord}
              matchCount={countWordMatches(chatLog, pending.word)}
              onSubmit={confirmFilter}
            />
          )}
        </FilterConfirmDialog>
      )}
      {reporting !== null && (
        <ReportDialog chatUuid={reporting} onClose={() => setReporting(null)} />
      )}
    </div>
  );
}

export default memo(ChatLogList);
