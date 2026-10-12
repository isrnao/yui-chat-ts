import { readLookCommand } from '@features/chat/utils/lookCommand';
import { useEffect, useRef, useState } from 'react';
import { generateOperationId } from '@shared/utils/uuid';
import { clearMyChats } from '@features/chat/api/chatQueries';
import { createOptimisticChat, SaveChatRejectedError } from '@features/chat/api/saveChat';
import type { RoomLogStore } from '@features/chat/api/roomLogStore';
import { validateName } from '@features/chat/utils/validation';
import { UserFacingError } from '@features/chat/utils/userFacingError';
import { trackEvent } from '@shared/utils/analytics';
import { playNotificationSound, stopNotificationSound } from '@features/chat/utils/webAudioPlayer';
import { isFortuneCommand } from '@features/chat/serverMessages';
import { isBlankMessage } from '@features/chat/utils/chatAllSend';
import { getSnapshot as getSettingsSnapshot } from '@features/chat/utils/settingsStore';
import { useChatSender } from '@features/chat/hooks/useChatSender';
import type { AvatarId, Chat, ChatMetadata } from '@features/chat/types';
import { getRoomMeta, type RoomId } from '@features/chat/rooms';
import type { ConversationMeasurement } from '@features/chat/utils/conversationMeasurement';
import { rememberOwnChat } from '@features/chat/utils/ownMessages';

/**
 * 送信先。部屋単位のビューはその部屋へ、全部屋まとめは返信先の部屋へ発言する。
 * 入退室の管理人メッセージは、部屋単位ならその部屋、全部屋まとめなら 'all' に出す。
 */
export type SessionTarget = { kind: 'room'; roomId: RoomId } | { kind: 'all'; replyTo: RoomId };

function metadataCopy(metadata: ChatMetadata | undefined): ChatMetadata | undefined {
  return metadata ? (JSON.parse(JSON.stringify(metadata)) as ChatMetadata) : undefined;
}

type TrackedCommand = 'look' | 'unlook' | 'fortune';
type Phase = 'idle' | 'entering' | 'entered' | 'exiting';
type Identity = {
  name: string;
  color: string;
  email: string;
  avatar?: AvatarId;
  fontStyle?: ChatMetadata['fontStyle'];
};
type FailedSend = { roomId: RoomId; chat: Chat; operationId: string; createdAt: number };
export class SupersededSessionError extends Error {
  constructor() {
    super('Session request superseded');
    this.name = 'SupersededSessionError';
  }
}

function getTrackedCommand(message: string): TrackedCommand | undefined {
  if (message === 'look' || message === 'unlook') return message;
  if (isFortuneCommand(message)) return 'fortune';
  return undefined;
}

/**
 * 入室・退室・送信とコマンド（cut / clear / look / unlook / おみくじ）をまとめた Chat_Session
 * （.kiro/specs/react-2026-refactoring Requirement 7）。
 *
 * 以前は部屋単位（useChatHandlers）と全部屋まとめ（useAllRoomsChatHandlers）に似たコードがあり、
 * 呼び出し元の setState を 5〜6 個受け取っていた。ここでは入室状態だけを自分で持ち、入力欄や
 * ランキングの表示など UI の状態は呼び出し元が自分で戻す（setState を受け取らない）。
 *
 * 部屋単位と全部屋まとめで意図して違う点（design.md §7 の表）:
 * - clear の対象がない場合: 部屋単位は何もしない、全部屋まとめは「削除対象の発言がありません」を投げる
 * - look / unlook: 部屋単位だけ通知音と Broadcast を行う
 * - metadata: 全部屋まとめはアバターと書式を足して合成する
 * - analytics の room_id: 部屋単位は部屋、全部屋まとめは返信先
 */
export function useChatSession({
  target,
  identity,
  store,
  addOptimistic,
  measurement,
}: {
  target: SessionTarget;
  identity: {
    name: string;
    color: string;
    email: string;
    avatar?: AvatarId;
    fontStyle?: ChatMetadata['fontStyle'];
  };
  store: RoomLogStore;
  addOptimistic: (chat: Chat) => void;
  measurement: ConversationMeasurement;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [sessionIdentity, setSessionIdentity] = useState<Identity | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [failedSend, setFailedSend] = useState<FailedSend | null>(null);
  const lifetime = useRef<{
    epoch: number;
    active: boolean;
    phase: Phase;
    identity: Identity | null;
    busy: boolean;
  }>({ epoch: 0, active: true, phase: 'idle', identity: null, busy: false });
  useEffect(() => {
    const current = lifetime.current;
    current.active = true;
    return () => {
      current.active = false;
      current.epoch++;
    };
  }, []);
  const isCurrent = (epoch: number) => lifetime.current.active && lifetime.current.epoch === epoch;
  const { sendUserMessage, sendAdminEvent } = useChatSender({
    addOptimistic,
    mergeChat: store.applySaved,
  });

  // 入退室の管理人メッセージを出す部屋と、その題名
  const sessionRoomId: RoomId = target.kind === 'room' ? target.roomId : 'all';
  const sessionTitle = getRoomMeta(sessionRoomId).title;
  // 発言を保存する部屋
  const sendTo: RoomId = target.kind === 'room' ? target.roomId : target.replyTo;

  /** 入室（silent: こっそり入室。入室メッセージを出さない） */
  const enter = async ({
    name,
    color,
    silent = false,
    email,
    avatar,
  }: {
    name: string;
    color: string;
    silent?: boolean;
    email?: string;
    avatar?: AvatarId;
  }) => {
    if (lifetime.current.phase !== 'idle') throw new SupersededSessionError();
    measurement.onJoinStarted(sessionRoomId);
    const err = validateName(name);
    if (err) {
      measurement.onJoinFailed(sessionRoomId, 'validation');
      throw new UserFacingError(err);
    }
    // 保存を待たずにチャット画面へ切り替える
    const epoch = ++lifetime.current.epoch;
    const enteredIdentity = {
      ...identity,
      name: name.trim(),
      color,
      email: email ?? identity.email,
      avatar: avatar ?? identity.avatar,
    };
    lifetime.current.identity = enteredIdentity;
    lifetime.current.phase = 'entering';
    setSessionIdentity(enteredIdentity);
    setPhase('entering');

    const complete = () => {
      if (!isCurrent(epoch)) throw new SupersededSessionError();
      lifetime.current.phase = 'entered';
      setPhase('entered');
      const entryContext = measurement.onEntered();
      trackEvent('chat_enter', {
        room_id: sessionRoomId,
        room_title: sessionTitle,
        entry_context: entryContext,
      });
    };
    if (silent) {
      complete();
      return;
    }
    const { visitCount, previousLogin } = getSettingsSnapshot();
    await sendAdminEvent(sessionRoomId, {
      event: 'enter',
      name: enteredIdentity.name,
      color,
      visitCount,
      lastLogin: previousLogin,
    }).then(complete, (error: unknown) => {
      if (!isCurrent(epoch)) throw new SupersededSessionError();
      lifetime.current.phase = 'idle';
      lifetime.current.identity = null;
      setPhase('idle');
      setSessionIdentity(null);
      measurement.onJoinFailed(sessionRoomId, 'save_error');
      throw error;
    });
  };

  /**
   * 退室。入室状態を同期で戻してから退室メッセージを送り、保存の完了を返す。
   * 入力欄やランキングの表示は、呼び出し元が exit を呼ぶ前に戻す。
   */
  const exit = async (): Promise<void> => {
    if (lifetime.current.phase === 'idle' || lifetime.current.phase === 'exiting') return;
    const epoch = ++lifetime.current.epoch;
    const me = lifetime.current.identity ?? identity;
    trackEvent('chat_exit', { room_id: sessionRoomId, room_title: sessionTitle });
    measurement.onExited();

    // 退室の名前と色は、呼び出し元が入力欄を戻す前の値を使う
    const farewell = { event: 'exit', name: me.name, color: me.color } as const;
    lifetime.current.phase = 'exiting';
    setPhase('exiting');
    setFailedSend(null);
    await sendAdminEvent(sessionRoomId, farewell)
      .catch((error: unknown) => {
        if (isCurrent(epoch)) throw error;
      })
      .finally(() => {
        if (isCurrent(epoch)) {
          lifetime.current.phase = 'idle';
          lifetime.current.identity = null;
          lifetime.current.busy = false;
          setPhase('idle');
          setSessionIdentity(null);
          setIsSending(false);
        }
      });
  };

  /** 送信するメッセージの metadata。全部屋まとめはアイデンティティのアバターと書式を足す */
  const resolveMetadata = (me: Identity, metadata?: ChatMetadata): ChatMetadata | undefined => {
    if (target.kind === 'room') return metadata;
    const base: ChatMetadata = { version: 1 };
    if (me.fontStyle) base.fontStyle = me.fontStyle;
    if (me.avatar && me.avatar !== 'none') base.avatar = me.avatar;
    return metadata ? { ...base, ...metadata } : base;
  };

  /**
   * 発言とコマンド。空の発言は何もしない。入力欄を空にする・ランキングを閉じるといった
   * UI の更新は、呼び出し元が送信の操作に合わせて行う。
   */
  const afterSaved = (roomId: RoomId, original: string, saved: Chat) => {
    const trackedCommand = getTrackedCommand(original.trim());
    if (trackedCommand) {
      trackEvent('command_used', { room_id: roomId, command: trackedCommand });
    } else {
      trackEvent('message_sent', { room_id: roomId, message_length: original.length });
      measurement.onOwnMessageSaved(saved);
    }

    // look/unlook: 自分の音は保存の完了で鳴らす（部屋単位のビューだけ）。ほかの参加者には、保存された発言の
    // INSERT が Realtime で届いて鳴る（useLookSound）。自分の echo では鳴らないよう、送る前に nonce を覚えている
    if (target.kind === 'room') {
      if (readLookCommand(original) === 'look') {
        // 再生できなくても（音声が許可されていないなど）発言は成立しているので無視する
        void playNotificationSound().catch(() => {});
      } else if (readLookCommand(original) === 'unlook') {
        stopNotificationSound();
      }
    }
  };

  const sendMessage = async (message: string, metadata?: ChatMetadata): Promise<void> => {
    if (isBlankMessage(message)) return;
    if (lifetime.current.phase !== 'entered')
      throw new UserFacingError('入室の完了をお待ちください。');
    if (lifetime.current.busy) throw new UserFacingError('送信の完了をお待ちください。');
    const me = lifetime.current.identity ?? identity;
    const epoch = lifetime.current.epoch;
    const trimmed = message.trim();

    if (trimmed === 'cut') {
      setFailedSend(null);
      trackEvent('command_used', { room_id: sendTo, command: 'cut' });
      return;
    }

    if (trimmed === 'clear') {
      setFailedSend(null);
      // この端末で書いた、送り先の部屋の自分の発言だけをサーバーが消す（clear_my_chats）。
      // 消す対象は手元のログで決めない（手元に無い古い発言もあり、同じ名前の他人の発言は消せないため）
      lifetime.current.busy = true;
      setIsSending(true);
      const cleared = await clearMyChats(sendTo, me.name).finally(() => {
        if (isCurrent(epoch)) {
          lifetime.current.busy = false;
          setIsSending(false);
        }
      });
      // 何も消えなかった clear は使用として数えない
      if (cleared.length === 0) throw new UserFacingError('削除対象の発言がありません');
      trackEvent('command_used', { room_id: sendTo, command: 'clear' });
      const removed = new Set(cleared);
      store.update((chats) => chats.filter((c) => !removed.has(c.uuid)));
      return;
    }

    const trackedCommand = getTrackedCommand(trimmed);
    const optimistic = createOptimisticChat({
      room_id: sendTo,
      name: me.name,
      color: me.color,
      message,
      client_time: Date.now(),
      email: me.email,
      ip_masked: '',
      ua: '',
      metadata: metadataCopy(resolveMetadata(me, metadata)),
    });

    if (!trackedCommand) measurement.onOwnMessagePending(optimistic);
    // Realtime の echo（保存の応答より先に届くことがある）を自分の発言と見分けるため、送る前に覚える
    rememberOwnChat(optimistic);

    const operationId = generateOperationId();
    const createdAt = Date.now();
    lifetime.current.busy = true;
    setIsSending(true);
    setFailedSend(null);
    const savedChat = await sendUserMessage(sendTo, optimistic, operationId)
      .catch((error: unknown) => {
        // 再試行できるのは結果が分からない失敗だけ。入力検証の拒否（400）は同じ要求を送り直しても変わらない
        if (isCurrent(epoch) && !(error instanceof SaveChatRejectedError))
          setFailedSend({ roomId: sendTo, chat: optimistic, operationId, createdAt });
        throw error;
      })
      .finally(() => {
        if (isCurrent(epoch)) {
          lifetime.current.busy = false;
          setIsSending(false);
        }
      });
    if (!isCurrent(epoch)) return;
    afterSaved(sendTo, message, savedChat);
  };

  const retry = async () => {
    if (!failedSend || lifetime.current.busy || lifetime.current.phase !== 'entered') return;
    if (Date.now() - failedSend.createdAt >= 24 * 60 * 60 * 1000)
      throw new UserFacingError('再試行の期限が終了しました。送信結果をご確認ください。');
    const epoch = lifetime.current.epoch;
    lifetime.current.busy = true;
    setIsSending(true);
    await sendUserMessage(failedSend.roomId, failedSend.chat, failedSend.operationId)
      .then((saved) => {
        if (isCurrent(epoch)) {
          setFailedSend(null);
          afterSaved(failedSend.roomId, failedSend.chat.message, saved);
        }
      })
      .catch((error: unknown) => {
        if (isCurrent(epoch) && error instanceof SaveChatRejectedError) setFailedSend(null);
        throw error;
      })
      .finally(() => {
        if (isCurrent(epoch)) {
          lifetime.current.busy = false;
          setIsSending(false);
        }
      });
  };
  const updateIdentity = (patch: Pick<Identity, 'color'>) => {
    const current = lifetime.current.identity;
    if (!current) return;
    const next = { ...current, ...patch };
    lifetime.current.identity = next;
    setSessionIdentity(next);
  };
  return {
    entered: phase === 'entering' || phase === 'entered',
    phase,
    sessionIdentity,
    isSending,
    failedSend,
    retry,
    updateIdentity,
    enter,
    exit,
    send: sendMessage,
  };
}
