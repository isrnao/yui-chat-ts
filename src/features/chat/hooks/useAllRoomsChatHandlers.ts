import { clearChatLogsByName, createOptimisticChat } from '@features/chat/api/chatApi';
import { validateName } from '@features/chat/utils/validation';
import { trackEvent } from '@shared/utils/analytics';
import { isFortuneCommand } from '@features/chat/utils/fortuneBot';
import { isBlankMessage, isClearTarget } from '@features/chat/utils/chatAllSend';
import { getSnapshot as getSettingsSnapshot } from '@features/chat/utils/settingsStore';
import { createAdminChat, useChatSender } from '@features/chat/hooks/useChatSender';
import type { Chat, ChatMetadata, AvatarId } from '@features/chat/types';
import type { Dispatch, SetStateAction } from 'react';
import { getRoomMeta, type RoomId } from '@features/chat/rooms';
import type { ConversationMeasurement } from '@features/chat/utils/conversationMeasurement';

const ALL_ROOMS_TITLE = getRoomMeta('all').title;

// ハンドラのメモ化は React Compiler に任せる（手動の useCallback は使わない）。
// 楽観的更新つき送信・管理人メッセージ・おみくじは useChatSender に集約している。
export function useAllRoomsChatHandlers({
  replyTarget,
  name,
  color,
  email,
  avatar,
  fontStyle,
  chatLog,
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
  /** clear コマンドの削除対象を判定するための現在のログ */
  chatLog: Chat[];
  setEntered: Dispatch<SetStateAction<boolean>>;
  setChatLog: Dispatch<SetStateAction<Chat[]>>;
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

  const handleEnter = async ({
    name: entryName,
    color: entryColor,
    silent = false,
  }: {
    name: string;
    color: string;
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
          room_title: ALL_ROOMS_TITLE,
          entry_context: entryContext,
        });
        return;
      }

      // レガシー互換の「{n}回目:LAST LOGIN:...」表示用に訪問情報を metadata へ載せる
      const { visitCount, previousLogin } = getSettingsSnapshot();

      await sendChat(
        'all',
        createAdminChat({
          roomId: 'all',
          message: `${entryName} さん、Welcome to お気楽チャット☆`,
          userColor: entryColor,
          extraMetadata: { visitCount, lastLogin: previousLogin },
        })
      );

      const entryContext = measurement.onEntered();
      trackEvent('chat_enter', {
        room_id: 'all',
        room_title: ALL_ROOMS_TITLE,
        entry_context: entryContext,
      });
    } catch (error) {
      setEntered(false);
      measurement.onJoinFailed('all', 'save_error');
      throw error;
    }
  };

  const handleExit = async () => {
    trackEvent('chat_exit', { room_id: 'all', room_title: ALL_ROOMS_TITLE });
    measurement.onExited();

    const optimistic = createAdminChat({
      roomId: 'all',
      message: `${name}さん、またきておくれやすぅ。`,
      userColor: color,
    });

    // 保存を待つ前に入力欄と表示状態を戻す（退室操作は即座に反映させる）
    showOptimistic(optimistic);
    setEntered(false);
    setName('');
    setMessage('');

    await saveAndMerge('all', optimistic);
  };

  const handleSend = async (msg: string, metadata?: ChatMetadata) => {
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
      // state updater は純粋である必要があるため、削除対象は updater 内から
      // resolve して読み出すのではなく props で受け取った chatLog から判定する
      const targets = chatLog.filter((c) => isClearTarget(c, replyTarget, name));

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

    showOptimistic(optimistic);
    setMessage('');

    const savedChat = await saveAndMerge(replyTarget, optimistic);
    if (trackedCommand) {
      trackEvent('command_used', { room_id: replyTarget, command: trackedCommand });
    } else {
      trackEvent('message_sent', { room_id: replyTarget, message_length: msg.length });
      measurement.onOwnMessageSaved(savedChat);
    }

    await sendFortuneIfCommand(replyTarget, msg, name);
  };

  return { handleEnter, handleExit, handleSend };
}
