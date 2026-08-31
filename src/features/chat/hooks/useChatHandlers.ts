import {
  broadcastLookEvent,
  broadcastUnlookEvent,
  clearChatLogsByName,
  createOptimisticChat,
} from '@features/chat/api/chatApi';
import { validateName } from '@features/chat/utils/validation';
import { trackEvent } from '@shared/utils/analytics';
import { playNotificationSound, stopNotificationSound } from '@features/chat/utils/webAudioPlayer';
import { isFortuneCommand } from '@features/chat/utils/fortuneBot';
import { getSnapshot as getSettingsSnapshot } from '@features/chat/utils/settingsStore';
import { createAdminChat, useChatSender } from '@features/chat/hooks/useChatSender';
import type { Chat, ChatMetadata } from '@features/chat/types';
import type { Dispatch, SetStateAction } from 'react';
import { getRoomMeta, type RoomId } from '@features/chat/rooms';
import type { ConversationMeasurement } from '@features/chat/utils/conversationMeasurement';

type TrackedCommand = 'look' | 'unlook' | 'fortune' | 'clear' | 'cut';

function getTrackedCommand(message: string): TrackedCommand | undefined {
  if (message === 'look' || message === 'unlook' || message === 'clear' || message === 'cut') {
    return message;
  }
  if (isFortuneCommand(message)) return 'fortune';
  return undefined;
}

// ハンドラのメモ化は React Compiler に任せる（手動の useCallback は使わない）。
// 楽観的更新つき送信・管理人メッセージ・おみくじは useChatSender に集約している。
export function useChatHandlers({
  roomId,
  name,
  color,
  email,
  setEntered,
  setChatLog,
  setShowRanking,
  setName,
  setMessage,
  addOptimistic,
  mergeChat,
  measurement,
}: {
  roomId: RoomId;
  name: string;
  color: string;
  email: string;
  setEntered: Dispatch<SetStateAction<boolean>>;
  setChatLog: Dispatch<SetStateAction<Chat[]>>;
  setShowRanking: Dispatch<SetStateAction<boolean>>;
  setName: Dispatch<SetStateAction<string>>;
  setMessage: Dispatch<SetStateAction<string>>;
  addOptimistic: (chat: Chat) => void;
  mergeChat: (chat: Chat) => void;
  measurement: ConversationMeasurement;
}) {
  const { showOptimistic, saveAndMerge, sendChat, sendFortuneIfCommand } = useChatSender({
    addOptimistic,
    mergeChat,
  });
  const roomTitle = getRoomMeta(roomId).title;

  // 入室（silent: こっそり入室対応）
  const handleEnter = async ({
    name: entryName,
    color: entryColor,
    silent = false,
  }: {
    name: string;
    color: string;
    silent?: boolean;
  }) => {
    measurement.onJoinStarted(roomId);
    const err = validateName(entryName);
    if (err) {
      measurement.onJoinFailed(roomId, 'validation');
      throw new Error(err);
    }
    setEntered(true);

    try {
      // こっそり入室の場合、入室システムメッセージをスキップ
      if (silent) {
        const entryContext = measurement.onEntered();
        trackEvent('chat_enter', {
          room_id: roomId,
          room_title: roomTitle,
          entry_context: entryContext,
        });
        return;
      }

      // レガシー互換の「{n}回目:LAST LOGIN:...」表示用に訪問情報を metadata へ載せる
      const { visitCount, previousLogin } = getSettingsSnapshot();

      await sendChat(
        roomId,
        createAdminChat({
          roomId,
          message: `${entryName} さん、Welcome to お気楽チャット☆`,
          userColor: entryColor,
          extraMetadata: { visitCount, lastLogin: previousLogin },
        })
      );

      const entryContext = measurement.onEntered();
      trackEvent('chat_enter', {
        room_id: roomId,
        room_title: roomTitle,
        entry_context: entryContext,
      });
    } catch (error) {
      setEntered(false);
      measurement.onJoinFailed(roomId, 'save_error');
      throw error;
    }
  };

  // 退室
  const handleExit = async () => {
    trackEvent('chat_exit', { room_id: roomId, room_title: roomTitle });
    measurement.onExited();

    const optimistic = createAdminChat({
      roomId,
      message: `${name}さん、またきておくれやすぅ。`,
      userColor: color,
    });

    // 保存を待つ前に入力欄と表示状態を戻す（退室操作は即座に反映させる）
    showOptimistic(optimistic);
    setEntered(false);
    setShowRanking(false);
    setName('');
    setMessage('');

    await saveAndMerge(roomId, optimistic);
  };

  // メッセージ送信（metadata: フォントスタイル + アバター対応）
  const handleSend = async (msg: string, metadata?: ChatMetadata) => {
    if (!msg.trim()) return;

    const trimmed = msg.trim();
    const trackedCommand = getTrackedCommand(trimmed);

    if (trimmed === 'cut') {
      trackEvent('command_used', { room_id: roomId, command: 'cut' });
      setMessage('');
      setShowRanking(false);
      return;
    }
    if (trimmed === 'clear') {
      await clearChatLogsByName(roomId, name);
      trackEvent('command_used', { room_id: roomId, command: 'clear' });
      setChatLog((prev) => prev.filter((c) => c.name !== name));
      setMessage('');
      setShowRanking(false);
      return;
    }

    const optimistic = createOptimisticChat({
      room_id: roomId,
      name,
      color,
      message: msg,
      client_time: Date.now(),
      email,
      ip_masked: '',
      ua: '',
      metadata: metadata ?? undefined,
    });

    if (!trackedCommand) measurement.onOwnMessagePending(optimistic);

    showOptimistic(optimistic);
    setMessage('');
    setShowRanking(false);

    const savedChat = await saveAndMerge(roomId, optimistic);
    if (trackedCommand) {
      trackEvent('command_used', { room_id: roomId, command: trackedCommand });
    } else {
      trackEvent('message_sent', { room_id: roomId, message_length: msg.length });
      measurement.onOwnMessageSaved(savedChat);
    }

    // look/unlook: 自分にも鳴らし、Broadcast で他の参加者にも送信
    if (trimmed === 'look') {
      playNotificationSound();
      broadcastLookEvent(roomId, savedChat.uuid);
    } else if (trimmed === 'unlook') {
      stopNotificationSound();
      broadcastUnlookEvent(roomId);
    }

    await sendFortuneIfCommand(roomId, msg, name);
  };

  // 再読み込みは useChatLog の reload が担う。
  // (TTL キャッシュの迂回と、取得中に届いた Realtime 発言のマージを一箇所に集約するため)

  return {
    handleEnter,
    handleExit,
    handleSend,
  };
}
