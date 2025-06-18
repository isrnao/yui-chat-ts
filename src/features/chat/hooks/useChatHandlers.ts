import { useCallback, useTransition } from 'react';
import { saveChatLog, loadChatLogs, clearChatLogs } from '@features/chat/api/chatApi';
import { validateName } from '@features/chat/utils/validation';
import { getClientIP, getUserAgent } from '@shared/utils/clientInfo';
import type { Chat } from '@features/chat/types';
import type { Dispatch, SetStateAction } from 'react';

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
}) {
  const [, startTransition] = useTransition();

  // 入室
  const handleEnter = useCallback(
    async ({ name: entryName, color: entryColor }: { name: string; color: string }) => {
      const err = validateName(entryName);
      if (err) throw new Error(err);
      setEntered(true);

      const [clientIP, userAgent] = await Promise.all([
        getClientIP(),
        Promise.resolve(getUserAgent()),
      ]);

      const joinMsg: Chat = {
        id: 'sys-' + Math.random().toString(36).slice(2),
        name: '管理人',
        color: '#0000ff',
        message: `${entryName}さん、おいでやすぅ。`,
        time: Date.now(),
        system: true,
        ip: clientIP,
        ua: userAgent,
      };

      await saveChatLog(joinMsg);
    },
    [setEntered]
  );

  // 退室
  const handleExit = useCallback(async () => {
    const [clientIP, userAgent] = await Promise.all([
      getClientIP(),
      Promise.resolve(getUserAgent()),
    ]);

    const leaveMsg: Chat = {
      id: 'sys-' + Math.random().toString(36).slice(2),
      name: '管理人',
      color: '#0000ff',
      message: `${name}さん、またきておくれやすぅ。`,
      time: Date.now(),
      system: true,
      ip: clientIP,
      ua: userAgent,
    };
    await saveChatLog(leaveMsg);
    setEntered(false);
    setShowRanking(false);
    setName('');
    setMessage('');
  }, [name, setEntered, setShowRanking, setName, setMessage]);

  // メッセージ送信
  const handleSend = useCallback(
    async (msg: string, chatLog: Chat[]) => {
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

      const [clientIP, userAgent] = await Promise.all([
        getClientIP(),
        Promise.resolve(getUserAgent()),
      ]);

      const chat: Chat = {
        id: Math.random().toString(36).slice(2),
        name,
        color,
        message: msg,
        time: Date.now(),
        email,
        ip: clientIP,
        ua: userAgent,
      };
      await saveChatLog(chat);
      setMessage('');
      setShowRanking(false);
    },
    [name, color, email, setMessage, setShowRanking]
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
