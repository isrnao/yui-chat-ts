import { useCallback, useTransition } from 'react';
import {
  saveChatLogOptimistic,
  clearChatLogsByName,
  createOptimisticChat,
} from '@features/chat/api/chatApi';
import { validateName } from '@features/chat/utils/validation';
import { trackEvent } from '@shared/utils/analytics';
import { isFortuneCommand, generateFortune } from '@features/chat/utils/fortuneBot';
import { isBlankMessage, isClearTarget } from '@features/chat/utils/chatAllSend';
import { getSnapshot as getSettingsSnapshot } from '@features/chat/utils/settingsStore';
import type { Chat, ChatMetadata, AvatarId } from '@features/chat/types';
import type { Dispatch, SetStateAction } from 'react';
import type { RoomId } from '@features/chat/rooms';

export function useAllRoomsChatHandlers({
  replyTarget,
  name,
  color,
  email,
  avatar,
  fontStyle,
  setEntered,
  setChatLog,
  setName,
  setMessage,
  addOptimistic,
  mergeChat,
}: {
  replyTarget: RoomId;
  name: string;
  color: string;
  email: string;
  avatar?: AvatarId;
  fontStyle?: ChatMetadata['fontStyle'];
  setEntered: Dispatch<SetStateAction<boolean>>;
  setChatLog: Dispatch<SetStateAction<Chat[]>>;
  setName: Dispatch<SetStateAction<string>>;
  setMessage: Dispatch<SetStateAction<string>>;
  addOptimistic: (chat: Chat) => void;
  mergeChat: (chat: Chat) => void;
}) {
  const [, startTransition] = useTransition();

  const buildAdminOptimistic = useCallback(
    (message: string, userColor: string, extraMetadata?: Partial<ChatMetadata>) =>
      createOptimisticChat({
        room_id: 'all',
        name: '管理人',
        color: '#ffffff',
        message,
        client_time: Date.now(),
        system: true,
        ip_masked: '',
        ua: '',
        metadata: {
          version: 1,
          avatar: 'hoshi1',
          kind: 'admin',
          userColor,
          fontStyle: { bold: true },
          ...extraMetadata,
        },
      }),
    []
  );

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

      if (silent) {
        trackEvent('chat_enter', { room_id: 'all', room_title: '全部屋まとめ' });
        return;
      }

      // レガシー互換の「{n}回目:LAST LOGIN:...」表示用に訪問情報を metadata へ載せる
      const { visitCount, previousLogin } = getSettingsSnapshot();
      const optimistic = buildAdminOptimistic(
        `${entryName} さん、Welcome to お気楽チャット☆`,
        entryColor,
        { visitCount, lastLogin: previousLogin }
      );
      startTransition(() => addOptimistic(optimistic));

      const savedChat = await saveChatLogOptimistic('all', optimistic);
      startTransition(() => mergeChat(savedChat));
      trackEvent('chat_enter', { room_id: 'all', room_title: '全部屋まとめ' });
    },
    [buildAdminOptimistic, setEntered, addOptimistic, mergeChat]
  );

  const handleExit = useCallback(async () => {
    trackEvent('chat_exit', { room_id: 'all', room_title: '全部屋まとめ' });

    const optimistic = buildAdminOptimistic(`${name}さん、またきておくれやすぅ。`, color);
    startTransition(() => addOptimistic(optimistic));

    setEntered(false);
    setName('');
    setMessage('');

    const savedChat = await saveChatLogOptimistic('all', optimistic);
    startTransition(() => mergeChat(savedChat));
  }, [
    buildAdminOptimistic,
    name,
    color,
    setEntered,
    setName,
    setMessage,
    addOptimistic,
    mergeChat,
  ]);

  const handleSend = useCallback(
    async (msg: string, metadata?: ChatMetadata) => {
      if (isBlankMessage(msg)) return;

      const trimmed = msg.trim();

      if (trimmed === 'cut') {
        trackEvent('command_used', { room_id: replyTarget, command: 'cut' });
        setMessage('');
        return;
      }

      if (trimmed === 'clear') {
        const targets = await (async () => {
          return new Promise<Chat[]>((resolve) => {
            setChatLog((prev) => {
              const t = prev.filter((c) => isClearTarget(c, replyTarget, name));
              resolve(t);
              return prev;
            });
          });
        })();

        if (targets.length === 0) {
          setMessage('');
          throw new Error('削除対象の発言がありません');
        }

        await clearChatLogsByName(replyTarget, name);
        trackEvent('command_used', { room_id: replyTarget, command: 'clear' });
        setChatLog((prev) => prev.filter((c) => !isClearTarget(c, replyTarget, name)));
        setMessage('');
        return;
      }

      const metaBase: ChatMetadata = { version: 1 };
      if (fontStyle) metaBase.fontStyle = fontStyle;
      if (avatar && avatar !== 'none') metaBase.avatar = avatar as Exclude<AvatarId, 'none'>;

      const resolvedMetadata: ChatMetadata = metadata ? { ...metaBase, ...metadata } : metaBase;

      const optimistic = createOptimisticChat({
        room_id: replyTarget,
        name,
        color,
        message: msg,
        client_time: Date.now(),
        email,
        ip_masked: '',
        ua: '',
        metadata: resolvedMetadata,
      });

      startTransition(() => addOptimistic(optimistic));
      setMessage('');

      const savedChat = await saveChatLogOptimistic(replyTarget, optimistic);
      startTransition(() => mergeChat(savedChat));

      if (isFortuneCommand(msg)) {
        try {
          const fortune = generateFortune(name);
          const fortuneOptimistic = createOptimisticChat({
            room_id: replyTarget,
            name: fortune.senderName,
            color: fortune.color,
            message: fortune.message,
            client_time: Date.now(),
            system: true,
            ip_masked: '',
            ua: '',
            metadata: { version: 1, kind: 'fortune', avatar: 'miko1', fontStyle: { bold: true } },
          });
          startTransition(() => addOptimistic(fortuneOptimistic));
          const savedFortune = await saveChatLogOptimistic(replyTarget, fortuneOptimistic);
          startTransition(() => mergeChat(savedFortune));
        } catch {
          // 巫女メッセージの保存失敗はサイレントに無視
        }
      }
    },
    [
      replyTarget,
      name,
      color,
      email,
      avatar,
      fontStyle,
      setMessage,
      setChatLog,
      addOptimistic,
      mergeChat,
    ]
  );

  return { handleEnter, handleExit, handleSend };
}
