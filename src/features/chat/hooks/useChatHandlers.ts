import { useCallback, useTransition } from 'react';
import { saveChatLogOptimistic, loadChatLogs, clearChatLogs } from '@features/chat/api/chatApi';
import { validateName } from '@features/chat/utils/validation';
import { getClientIP, getUserAgent } from '@shared/utils/clientInfo';
import type { Chat } from '@features/chat/types';
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

  // 入室
  const handleEnter = useCallback(
    async ({ name: entryName }: { name: string; color: string }) => {
      const err = validateName(entryName);
      if (err) throw new Error(err);
      setEntered(true);

      const optimistic = createOptimisticChat({
        name: '管理人',
        color: '#0000ff',
        message: `${entryName}さん、おいでやすぅ。`,
        client_time: Date.now(),
        system: true,
        ip: '',
        ua: '',
      });

      startTransition(() => addOptimistic(optimistic));

      const [clientIP, userAgent] = await Promise.all([
        getClientIP(),
        Promise.resolve(getUserAgent()),
      ]);
      const chatToSave = { ...optimistic, ip: clientIP, ua: userAgent };

      // 最適化されたAPIを使用（selectを最小限に）
      const savedChat = await saveChatLogOptimistic(chatToSave);

      startTransition(() => mergeChat(savedChat));
    },
    [setEntered, addOptimistic, mergeChat]
  ); // 退室
  const handleExit = useCallback(async () => {
    const optimistic = createOptimisticChat({
      name: '管理人',
      color: '#0000ff',
      message: `${name}さん、またきておくれやすぅ。`,
      client_time: Date.now(),
      system: true,
      ip: '',
      ua: '',
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

    // 最適化されたAPIを使用（selectを最小限に）
    const savedChat = await saveChatLogOptimistic(chatToSave);

    startTransition(() => mergeChat(savedChat));
  }, [name, setEntered, setShowRanking, setName, setMessage, addOptimistic, mergeChat]);

  // メッセージ送信
  const handleSend = useCallback(
    async (msg: string) => {
      if (!msg.trim()) return;

      if (msg.trim() === 'cut') {
        // TODO: Implement image filtering in Supabase
        setMessage('');
        setShowRanking(false);
        return;
      }
      if (msg.trim() === 'clear') {
        await clearChatLogs();
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

      // 最適化されたAPIを使用（selectを最小限に）
      const savedChat = await saveChatLogOptimistic(chatToSave);

      startTransition(() => mergeChat(savedChat));
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
