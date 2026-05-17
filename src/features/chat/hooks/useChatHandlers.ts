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
import { getClientIP, getUserAgent } from '@shared/utils/clientInfo';
import { trackEvent } from '@shared/utils/analytics';
import { playNotificationSound, stopNotificationSound } from '@features/chat/utils/webAudioPlayer';
import { isFortuneCommand, generateFortune } from '@features/chat/utils/fortuneBot';
import type { Chat, ChatMetadata } from '@features/chat/types';
import type { Dispatch, SetStateAction } from 'react';
import { getRoomMeta, type RoomId } from '@features/chat/rooms';

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
  myId: _myId,
  entered: _entered,
  setEntered,
  setChatLog,
  setShowRanking,
  setName,
  setMessage,
  addOptimistic,
  mergeChat,
}: {
  roomId: RoomId;
  name: string;
  color: string;
  email: string;
  myId: string;
  entered: boolean;
  setEntered: Dispatch<SetStateAction<boolean>>;
  setChatLog: Dispatch<SetStateAction<Chat[]>>;
  setShowRanking: Dispatch<SetStateAction<boolean>>;
  setName: Dispatch<SetStateAction<string>>;
  setMessage: Dispatch<SetStateAction<string>>;
  addOptimistic: (chat: Chat) => void;
  mergeChat: (chat: Chat) => void;
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
      email?: string;
      silent?: boolean;
    }) => {
      const err = validateName(entryName);
      if (err) throw new Error(err);
      setEntered(true);

      // こっそり入室の場合、入室システムメッセージをスキップ
      if (silent) {
        trackEvent('chat_enter', { room_id: roomId, room_title: roomTitle });
        return;
      }

      const optimistic = createOptimisticChat({
        room_id: roomId,
        name: '管理人',
        color: '#ffffff',
        message: `${entryName} さん、Welcome to お気楽チャット☆`,
        client_time: Date.now(),
        system: true,
        ip: '',
        ua: '',
        metadata: {
          version: 1,
          avatar: 'hoshi1',
          kind: 'admin',
          userColor: entryColor,
          fontStyle: { bold: true },
        },
      });

      startTransition(() => addOptimistic(optimistic));

      const [clientIP, userAgent] = await Promise.all([
        getClientIP(),
        Promise.resolve(getUserAgent()),
      ]);
      const chatToSave = { ...optimistic, ip: clientIP, ua: userAgent };

      const savedChat = await saveChatLogOptimistic(roomId, chatToSave);

      startTransition(() => mergeChat(savedChat));
      trackEvent('chat_enter', { room_id: roomId, room_title: roomTitle });
    },
    [roomId, roomTitle, setEntered, addOptimistic, mergeChat]
  );

  // 退室
  const handleExit = useCallback(async () => {
    trackEvent('chat_exit', { room_id: roomId, room_title: roomTitle });

    const optimistic = createOptimisticChat({
      room_id: roomId,
      name: '管理人',
      color: '#ffffff',
      message: `${name}さん、またきておくれやすぅ。`,
      client_time: Date.now(),
      system: true,
      ip: '',
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

    const [clientIP, userAgent] = await Promise.all([
      getClientIP(),
      Promise.resolve(getUserAgent()),
    ]);

    const chatToSave = { ...optimistic, ip: clientIP, ua: userAgent };

    const savedChat = await saveChatLogOptimistic(roomId, chatToSave);

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
        ip: '',
        ua: '',
        metadata: metadata ?? undefined,
      });

      startTransition(() => addOptimistic(optimistic));
      setMessage('');
      setShowRanking(false);

      const [clientIP, userAgent] = await Promise.all([
        getClientIP(),
        Promise.resolve(getUserAgent()),
      ]);

      const chatToSave = {
        ...optimistic,
        ip: clientIP,
        ua: userAgent,
      };

      // ユーザー発言を保存
      const savedChat = await saveChatLogOptimistic(roomId, chatToSave);
      startTransition(() => mergeChat(savedChat));
      if (trackedCommand) {
        trackEvent('command_used', { room_id: roomId, command: trackedCommand });
      } else {
        trackEvent('message_sent', { room_id: roomId, message_length: msg.length });
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
            ip: '',
            ua: '',
            metadata: {
              version: 1,
              kind: 'fortune',
              avatar: 'miko1',
              fontStyle: { bold: true },
            },
          });

          startTransition(() => addOptimistic(fortuneOptimistic));

          const fortuneToSave = {
            ...fortuneOptimistic,
            ip: clientIP,
            ua: userAgent,
          };

          const savedFortune = await saveChatLogOptimistic(roomId, fortuneToSave);
          startTransition(() => mergeChat(savedFortune));
        } catch {
          // 巫女メッセージの保存失敗時はサイレントに失敗
        }
      }
    },
    [roomId, name, color, email, setMessage, setShowRanking, setChatLog, addOptimistic, mergeChat]
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
