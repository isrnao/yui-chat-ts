import { useCallback, useTransition } from 'react';
import { useBroadcastChannel } from '@shared/hooks/useBroadcastChannel';
import { saveChatLogs, clearChatLogs, loadChatLogs } from '@features/chat/api/chatApi';
import { validateName } from '@features/chat/utils/validation';
import type { Chat, BroadcastMsg } from '@features/chat/types';
import type { Dispatch, SetStateAction } from 'react';

export function useChatHandlers({
  name,
  color,
  email,
  myId,
  entered,
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

  const channelRef = useBroadcastChannel<BroadcastMsg>(
    'yui_chat_room',
    useCallback(
      (data: BroadcastMsg) => {
        switch (data.type) {
          case 'chat':
            startTransition(() => {
              setChatLog((prev: Chat[]) => {
                const log = [data.chat, ...prev];
                void saveChatLogs(log);
                return log;
              });
            });
            break;
          case 'req-presence':
            if (entered) {
              channelRef.current?.postMessage({
                type: 'join',
                user: { id: myId, name, color },
              });
            }
            break;
          case 'clear':
            startTransition(() => {
              setChatLog(() => {
                void clearChatLogs();
                return [];
              });
            });
            break;
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [entered, myId, name, color, setChatLog, setName, setMessage, setShowRanking]
    )
  );

  // 入室
  const handleEnter = useCallback(
    async ({ name: entryName, color: entryColor }: { name: string; color: string }) => {
      const err = validateName(entryName);
      if (err) throw new Error(err);
      setEntered(true);

      const joinMsg: Chat = {
        id: 'sys-' + Math.random().toString(36).slice(2),
        name: '管理人',
        color: '#0000ff',
        message: `${entryName}さん、おいでやすぅ。`,
        time: Date.now(),
        system: true,
      };

      setChatLog((prev: Chat[]) => {
        const log = [joinMsg, ...prev];
        void saveChatLogs(log);
        return log;
      });
      setTimeout(() => {
        channelRef.current?.postMessage({
          type: 'join',
          user: { id: myId, name: entryName, color: entryColor },
        });
      }, 10);
      setTimeout(() => {
        channelRef.current?.postMessage({ type: 'req-presence' });
      }, 30);
      channelRef.current?.postMessage({ type: 'chat', chat: joinMsg });
    },
    [setEntered, setChatLog, myId, channelRef]
  );

  // 退室
  const handleExit = useCallback(() => {
    const leaveMsg: Chat = {
      id: 'sys-' + Math.random().toString(36).slice(2),
      name: '管理人',
      color: '#0000ff',
      message: `${name}さん、またきておくれやすぅ。`,
      time: Date.now(),
      system: true,
    };
    setChatLog((prev: Chat[]) => {
      const log = [leaveMsg, ...prev];
      void saveChatLogs(log);
      return log;
    });
    channelRef.current?.postMessage({
      type: 'chat',
      chat: leaveMsg,
    });
    channelRef.current?.postMessage({
      type: 'leave',
      user: { id: myId, name, color },
    });
    setEntered(false);
    setShowRanking(false);
    setName('');
    setMessage('');
  }, [channelRef, myId, name, color, setEntered, setShowRanking, setName, setMessage, setChatLog]);

  // メッセージ送信
  const handleSend = useCallback(
    async (msg: string, chatLog: Chat[]) => {
      if (!msg.trim()) return;

      if (msg.trim() === 'cut') {
        startTransition(() => {
          setChatLog((prev: Chat[]) => {
            const log = prev.filter((c: Chat) => !c.message.match(/img/i));
            void saveChatLogs(log);
            return log;
          });
        });
        setMessage('');
        setShowRanking(false);
        return;
      }
      if (msg.trim() === 'clear') {
        startTransition(() => {
          setChatLog(() => {
            void clearChatLogs();
            return [];
          });
        });
        channelRef.current?.postMessage({ type: 'clear' });
        setMessage('');
        setShowRanking(false);
        return;
      }

      startTransition(() => {
        const chat: Chat = {
          id: Math.random().toString(36).slice(2),
          name,
          color,
          message: msg,
          time: Date.now(),
          email,
        };
        const log = [chat, ...chatLog];
        setChatLog(() => {
          void saveChatLogs(log);
          return log;
        });
        channelRef.current?.postMessage({ type: 'chat', chat });
        setMessage('');
        setShowRanking(false);
      });
    },
    [name, color, email, setChatLog, channelRef, setMessage, setShowRanking]
  );

  // チャット履歴再読み込み
  const handleReload = useCallback(async () => {
    const loaded = await loadChatLogs();
    setChatLog(() => loaded);
  }, [setChatLog]);

  return {
    channelRef,
    handleEnter,
    handleExit,
    handleSend,
    handleReload,
  };
}
