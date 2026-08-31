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
import type { ConversationMeasurement } from '@features/chat/utils/conversationMeasurement';

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
  measurement,
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
  measurement: ConversationMeasurement;
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
      measurement.onJoinStarted('all');
      const err = validateName(entryName);
      if (err) {
        measurement.onJoinFailed('all', 'validation');
        throw new Error(err);
      }
      setEntered(true);

      try {
        if (silent) {
          const entryContext = measurement.onEntered();
          trackEvent('chat_enter', {
            room_id: 'all',
            room_title: '全部屋まとめ',
            entry_context: entryContext,
          });
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
        const entryContext = measurement.onEntered();
        trackEvent('chat_enter', {
          room_id: 'all',
          room_title: '全部屋まとめ',
          entry_context: entryContext,
        });
      } catch (error) {
        setEntered(false);
        measurement.onJoinFailed('all', 'save_error');
        throw error;
      }
    },
    [buildAdminOptimistic, setEntered, addOptimistic, mergeChat, measurement]
  );

  const handleExit = useCallback(async () => {
    trackEvent('chat_exit', { room_id: 'all', room_title: '全部屋まとめ' });
    measurement.onExited();

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
    measurement,
  ]);

  const handleSend = useCallback(
    async (msg: string, metadata?: ChatMetadata) => {
      if (isBlankMessage(msg)) return;

      const trimmed = msg.trim();
      const trackedCommand =
        trimmed === 'look' || trimmed === 'unlook'
          ? trimmed
          : isFortuneCommand(trimmed)
            ? 'fortune'
            : undefined;

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

      if (!trackedCommand) measurement.onOwnMessagePending(optimistic);

      startTransition(() => addOptimistic(optimistic));
      setMessage('');

      const savedChat = await saveChatLogOptimistic(replyTarget, optimistic);
      startTransition(() => mergeChat(savedChat));
      if (trackedCommand) {
        trackEvent('command_used', { room_id: replyTarget, command: trackedCommand });
      } else {
        trackEvent('message_sent', { room_id: replyTarget, message_length: msg.length });
        measurement.onOwnMessageSaved(savedChat);
      }

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
      measurement,
    ]
  );

  return { handleEnter, handleExit, handleSend };
}
