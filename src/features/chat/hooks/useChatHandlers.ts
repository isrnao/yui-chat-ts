import { useCallback, useTransition } from 'react';
import {
  saveChatLogOptimistic,
  loadChatLogs,
  clearChatLogsByName,
  broadcastLookEvent,
  broadcastUnlookEvent,
  createOptimisticChat,
} from '@features/chat/api/chatApi';
import { validateName } from '@features/chat/utils/validation';
import { trackEvent } from '@shared/utils/analytics';
import { playNotificationSound, stopNotificationSound } from '@features/chat/utils/webAudioPlayer';
import { isFortuneCommand, generateFortune } from '@features/chat/utils/fortuneBot';
import { getSnapshot as getSettingsSnapshot } from '@features/chat/utils/settingsStore';
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
  const [, startTransition] = useTransition();
  const roomTitle = getRoomMeta(roomId).title;

  // 入室（silent: こっそり入室対応）
  const handleEnter = useCallback(
    async ({
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

        const optimistic = createOptimisticChat({
          room_id: roomId,
          name: '管理人',
          color: '#ffffff',
          message: `${entryName} さん、Welcome to お気楽チャット☆`,
          client_time: Date.now(),
          system: true,
          ip_masked: '',
          ua: '',
          metadata: {
            version: 1,
            avatar: 'hoshi1',
            kind: 'admin',
            userColor: entryColor,
            fontStyle: { bold: true },
            visitCount,
            lastLogin: previousLogin,
          },
        });

        startTransition(() => addOptimistic(optimistic));

        // ip / ua は save-chat Edge Function がリクエストヘッダから確定する
        const savedChat = await saveChatLogOptimistic(roomId, optimistic);

        startTransition(() => mergeChat(savedChat));
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
    },
    [roomId, roomTitle, setEntered, addOptimistic, mergeChat, measurement]
  );

  // 退室
  const handleExit = useCallback(async () => {
    trackEvent('chat_exit', { room_id: roomId, room_title: roomTitle });
    measurement.onExited();

    const optimistic = createOptimisticChat({
      room_id: roomId,
      name: '管理人',
      color: '#ffffff',
      message: `${name}さん、またきておくれやすぅ。`,
      client_time: Date.now(),
      system: true,
      ip_masked: '',
      ua: '',
      metadata: {
        version: 1,
        avatar: 'hoshi1',
        kind: 'admin',
        userColor: color,
        fontStyle: { bold: true },
      },
    });

    startTransition(() => addOptimistic(optimistic));

    setEntered(false);
    setShowRanking(false);
    setName('');
    setMessage('');

    // ip / ua は save-chat Edge Function がリクエストヘッダから確定する
    const savedChat = await saveChatLogOptimistic(roomId, optimistic);

    startTransition(() => mergeChat(savedChat));
  }, [
    roomId,
    name,
    color,
    setEntered,
    setShowRanking,
    setName,
    setMessage,
    addOptimistic,
    mergeChat,
    roomTitle,
    measurement,
  ]);

  // メッセージ送信（metadata: フォントスタイル + アバター対応）
  const handleSend = useCallback(
    async (msg: string, metadata?: ChatMetadata) => {
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

      startTransition(() => addOptimistic(optimistic));
      setMessage('');
      setShowRanking(false);

      // ip / ua は save-chat Edge Function がリクエストヘッダから確定する
      const savedChat = await saveChatLogOptimistic(roomId, optimistic);
      startTransition(() => mergeChat(savedChat));
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

      // おみくじロジック: ユーザー発言保存成功後に巫女メッセージを生成・保存
      if (isFortuneCommand(msg)) {
        try {
          const fortune = generateFortune(name);
          const fortuneOptimistic = createOptimisticChat({
            room_id: roomId,
            name: fortune.senderName,
            color: fortune.color,
            message: fortune.message,
            client_time: Date.now(),
            system: true,
            ip_masked: '',
            ua: '',
            metadata: {
              version: 1,
              kind: 'fortune',
              avatar: 'miko1',
              fontStyle: { bold: true },
            },
          });

          startTransition(() => addOptimistic(fortuneOptimistic));

          const savedFortune = await saveChatLogOptimistic(roomId, fortuneOptimistic);
          startTransition(() => mergeChat(savedFortune));
        } catch {
          // 巫女メッセージの保存失敗時はサイレントに失敗
        }
      }
    },
    [
      roomId,
      name,
      color,
      email,
      setMessage,
      setShowRanking,
      setChatLog,
      addOptimistic,
      mergeChat,
      measurement,
    ]
  );

  // チャット履歴再読み込み
  const handleReload = useCallback(() => {
    loadChatLogs(roomId).then((loaded) => setChatLog(() => loaded));
  }, [roomId, setChatLog]);

  return {
    handleEnter,
    handleExit,
    handleSend,
    handleReload,
  };
}
