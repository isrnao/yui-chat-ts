import { useCallback, useTransition } from 'react';
import {
  saveChatLogOptimistic,
  loadChatLogs,
  clearChatLogsByName,
  broadcastLookEvent,
  broadcastUnlookEvent,
} from '@features/chat/api/chatApi';
import { validateName } from '@features/chat/utils/validation';
import { getClientIP, getUserAgent } from '@shared/utils/clientInfo';
import { playNotificationSound, stopNotificationSound } from '@features/chat/utils/webAudioPlayer';
import { isFortuneCommand, generateFortune } from '@features/chat/utils/fortuneBot';
import type { Chat, ChatMetadata } from '@features/chat/types';
import type { Dispatch, SetStateAction } from 'react';

// 楽観的更新用のタイムスタンプを生成
// 確実に先頭に表示されるよう、十分未来の時刻を使用
function getOptimisticTimestamp(): number {
  // 現在時刻 + 1年（確実に先頭に表示される）
  return Date.now() + 365 * 24 * 60 * 60 * 1000;
}

// 楽観的更新用のチャットを作成（サーバー側でUUID v7とtimeを生成）
function createOptimisticChat(baseChat: Omit<Chat, 'uuid' | 'time' | 'optimistic'>): Chat {
  return {
    ...baseChat,
    uuid: `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, // 一時UUID
    time: getOptimisticTimestamp(),
    optimistic: true, // 楽観的更新フラグを追加
  };
}

export function useChatHandlers({
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
      if (silent) return;

      const optimistic = createOptimisticChat({
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

      const savedChat = await saveChatLogOptimistic(chatToSave);

      startTransition(() => mergeChat(savedChat));
    },
    [setEntered, addOptimistic, mergeChat]
  );

  // 退室
  const handleExit = useCallback(async () => {
    const optimistic = createOptimisticChat({
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

    const savedChat = await saveChatLogOptimistic(chatToSave);

    startTransition(() => mergeChat(savedChat));
  }, [name, color, setEntered, setShowRanking, setName, setMessage, addOptimistic, mergeChat]);

  // メッセージ送信（metadata: フォントスタイル + アバター対応）
  const handleSend = useCallback(
    async (msg: string, metadata?: ChatMetadata) => {
      if (!msg.trim()) return;

      if (msg.trim() === 'cut') {
        setMessage('');
        setShowRanking(false);
        return;
      }
      if (msg.trim() === 'clear') {
        await clearChatLogsByName(name);
        setChatLog((prev) => prev.filter((c) => c.name !== name));
        setMessage('');
        setShowRanking(false);
        return;
      }

      const optimistic = createOptimisticChat({
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
      const savedChat = await saveChatLogOptimistic(chatToSave);
      startTransition(() => mergeChat(savedChat));

      // look/unlook: 自分にも鳴らし、Broadcast で他の参加者にも送信
      const trimmed = msg.trim();
      if (trimmed === 'look') {
        playNotificationSound();
        broadcastLookEvent(savedChat.uuid);
      } else if (trimmed === 'unlook') {
        stopNotificationSound();
        broadcastUnlookEvent();
      }

      // おみくじロジック: ユーザー発言保存成功後に巫女メッセージを生成・保存
      if (isFortuneCommand(msg)) {
        try {
          const fortune = generateFortune(name);
          const fortuneOptimistic = createOptimisticChat({
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

          const savedFortune = await saveChatLogOptimistic(fortuneToSave);
          startTransition(() => mergeChat(savedFortune));
        } catch {
          // 巫女メッセージの保存失敗時はサイレントに失敗
        }
      }
    },
    [name, color, email, setMessage, setShowRanking, addOptimistic, mergeChat]
  );

  // チャット履歴再読み込み
  const handleReload = useCallback(() => {
    loadChatLogs().then((loaded) => setChatLog(() => loaded));
  }, [setChatLog]);

  return {
    handleEnter,
    handleExit,
    handleSend,
    handleReload,
  };
}
