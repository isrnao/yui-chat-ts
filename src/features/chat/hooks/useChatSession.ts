import { useState } from 'react';
import {
  broadcastLookEvent,
  broadcastUnlookEvent,
  clearChatLogsByName,
  createOptimisticChat,
} from '@features/chat/api/chatApi';
import type { RoomLogStore } from '@features/chat/api/roomLogStore';
import { validateName } from '@features/chat/utils/validation';
import { trackEvent } from '@shared/utils/analytics';
import { playNotificationSound, stopNotificationSound } from '@features/chat/utils/webAudioPlayer';
import { isFortuneCommand } from '@features/chat/utils/fortuneBot';
import { isBlankMessage, isClearTarget } from '@features/chat/utils/chatAllSend';
import { getSnapshot as getSettingsSnapshot } from '@features/chat/utils/settingsStore';
import { createAdminChat, useChatSender } from '@features/chat/hooks/useChatSender';
import type { AvatarId, Chat, ChatMetadata } from '@features/chat/types';
import { getRoomMeta, type RoomId } from '@features/chat/rooms';
import type { ConversationMeasurement } from '@features/chat/utils/conversationMeasurement';

/**
 * 送信先。部屋単位のビューはその部屋へ、全部屋まとめは返信先の部屋へ発言する。
 * 入退室の管理人メッセージは、部屋単位ならその部屋、全部屋まとめなら 'all' に出す。
 */
export type SessionTarget = { kind: 'room'; roomId: RoomId } | { kind: 'all'; replyTo: RoomId };

type TrackedCommand = 'look' | 'unlook' | 'fortune';

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
  const [entered, setEntered] = useState(false);
  const { send, sendUserMessage, sendFortuneIfCommand } = useChatSender({
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
  }: {
    name: string;
    color: string;
    silent?: boolean;
  }) => {
    measurement.onJoinStarted(sessionRoomId);
    const err = validateName(name);
    if (err) {
      measurement.onJoinFailed(sessionRoomId, 'validation');
      throw new Error(err);
    }
    // 保存を待たずにチャット画面へ切り替える
    setEntered(true);

    try {
      if (!silent) {
        // レガシー互換の「{n}回目:LAST LOGIN:...」表示用に訪問情報を metadata へ載せる
        const { visitCount, previousLogin } = getSettingsSnapshot();
        await send(
          sessionRoomId,
          createAdminChat({
            roomId: sessionRoomId,
            message: `${name} さん、Welcome to お気楽チャット☆`,
            userColor: color,
            extraMetadata: { visitCount, lastLogin: previousLogin },
          })
        );
      }

      const entryContext = measurement.onEntered();
      trackEvent('chat_enter', {
        room_id: sessionRoomId,
        room_title: sessionTitle,
        entry_context: entryContext,
      });
    } catch (error) {
      setEntered(false);
      measurement.onJoinFailed(sessionRoomId, 'save_error');
      throw error;
    }
  };

  /**
   * 退室。退室メッセージの表示と入室状態の解除は同期で行い、保存の完了を返す。
   * 入力欄やランキングの表示は呼び出し元が戻す。
   */
  const exit = (): Promise<void> => {
    trackEvent('chat_exit', { room_id: sessionRoomId, room_title: sessionTitle });
    measurement.onExited();

    const saving = send(
      sessionRoomId,
      createAdminChat({
        roomId: sessionRoomId,
        message: `${identity.name}さん、またきておくれやすぅ。`,
        userColor: identity.color,
      })
    );
    setEntered(false);
    return saving.then(() => {});
  };

  /** 送信するメッセージの metadata。全部屋まとめはアイデンティティのアバターと書式を足す */
  const resolveMetadata = (metadata?: ChatMetadata): ChatMetadata | undefined => {
    if (target.kind === 'room') return metadata;
    const base: ChatMetadata = { version: 1 };
    if (identity.fontStyle) base.fontStyle = identity.fontStyle;
    if (identity.avatar && identity.avatar !== 'none') base.avatar = identity.avatar;
    return metadata ? { ...base, ...metadata } : base;
  };

  /**
   * 発言とコマンド。空の発言は何もしない。入力欄を空にする・ランキングを閉じるといった
   * UI の更新は、呼び出し元が送信の操作に合わせて行う。
   */
  const sendMessage = async (message: string, metadata?: ChatMetadata): Promise<void> => {
    if (isBlankMessage(message)) return;
    const trimmed = message.trim();

    if (trimmed === 'cut') {
      trackEvent('command_used', { room_id: sendTo, command: 'cut' });
      return;
    }

    if (trimmed === 'clear') {
      if (target.kind === 'all') {
        // 表示中のログから削除対象を判定する（全部屋まとめは返信先の部屋の自分の発言だけ）
        const hasTargets = store
          .getSnapshot()
          .chats.some((c) => isClearTarget(c, sendTo, identity.name));
        if (!hasTargets) throw new Error('削除対象の発言がありません');
      }
      await clearChatLogsByName(sendTo, identity.name);
      trackEvent('command_used', { room_id: sendTo, command: 'clear' });
      // 部屋単位のログはその部屋の発言だけなので名前で消す（room_id を持たない旧データも消すため）
      store.update((chats) =>
        chats.filter((c) =>
          target.kind === 'room'
            ? c.name !== identity.name
            : !isClearTarget(c, sendTo, identity.name)
        )
      );
      return;
    }

    const trackedCommand = getTrackedCommand(trimmed);
    const optimistic = createOptimisticChat({
      room_id: sendTo,
      name: identity.name,
      color: identity.color,
      message,
      client_time: Date.now(),
      email: identity.email,
      ip_masked: '',
      ua: '',
      metadata: resolveMetadata(metadata),
    });

    if (!trackedCommand) measurement.onOwnMessagePending(optimistic);

    const savedChat = await sendUserMessage(sendTo, optimistic);
    if (trackedCommand) {
      trackEvent('command_used', { room_id: sendTo, command: trackedCommand });
    } else {
      trackEvent('message_sent', { room_id: sendTo, message_length: message.length });
      measurement.onOwnMessageSaved(savedChat);
    }

    // look/unlook: 自分にも鳴らし、Broadcast で他の参加者にも送信（部屋単位のビューだけ）
    if (target.kind === 'room') {
      if (trimmed === 'look') {
        // 再生できなくても（音声が許可されていないなど）発言は成立しているので無視する
        void playNotificationSound().catch(() => {});
        broadcastLookEvent(sendTo, savedChat.uuid);
      } else if (trimmed === 'unlook') {
        stopNotificationSound();
        broadcastUnlookEvent(sendTo);
      }
    }

    await sendFortuneIfCommand(sendTo, message, identity.name);
  };

  return { entered, enter, exit, send: sendMessage };
}
