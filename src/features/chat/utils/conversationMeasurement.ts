import type { RoomId } from '@features/chat/rooms';
import type { Chat } from '@features/chat/types';
import {
  getEntryContext,
  trackEvent,
  type AnalyticsEventMap,
  type EntryContext,
} from '@shared/utils/analytics';

type Track = <Name extends keyof AnalyticsEventMap>(
  name: Name,
  params: AnalyticsEventMap[Name]
) => void;

type MeasurementState = {
  entered: boolean;
  enteredAt: number;
  firstMessageAt: number | null;
  firstMessageRoomId: RoomId | null;
  activated: boolean;
  ownNonces: Set<string>;
  ownUuids: Set<string>;
};

export type ConversationMeasurement = ReturnType<typeof createConversationMeasurement>;

function createInitialState(): MeasurementState {
  return {
    entered: false,
    enteredAt: 0,
    firstMessageAt: null,
    firstMessageRoomId: null,
    activated: false,
    ownNonces: new Set(),
    ownUuids: new Set(),
  };
}

function isNormalSavedMessage(chat: Chat): boolean {
  return (
    !chat.optimistic &&
    !chat.system &&
    chat.metadata?.kind !== 'admin' &&
    chat.metadata?.kind !== 'fortune'
  );
}

export function createConversationMeasurement(
  track: Track = trackEvent,
  now: () => number = Date.now,
  resolveEntryContext: () => EntryContext = getEntryContext
) {
  let state = createInitialState();
  let pendingEntryContext: EntryContext = 'unknown';

  return {
    onJoinStarted(roomId: RoomId) {
      pendingEntryContext = resolveEntryContext();
      track('room_join_started', { room_id: roomId, entry_context: pendingEntryContext });
    },

    onJoinFailed(
      roomId: RoomId,
      reasonCategory: AnalyticsEventMap['room_join_failed']['reason_category']
    ) {
      track('room_join_failed', {
        room_id: roomId,
        entry_context: pendingEntryContext,
        reason_category: reasonCategory,
      });
    },

    onEntered() {
      state = { ...createInitialState(), entered: true, enteredAt: now() };
      return pendingEntryContext;
    },

    onOwnMessagePending(chat: Chat) {
      const nonce = chat.metadata?.optimisticNonce;
      if (nonce) state.ownNonces.add(nonce);
    },

    onOwnMessageSaved(chat: Chat, promptId?: string) {
      state.ownUuids.add(chat.uuid);
      const nonce = chat.metadata?.optimisticNonce;
      if (nonce) state.ownNonces.add(nonce);

      if (!state.entered || state.firstMessageAt !== null || !isNormalSavedMessage(chat)) return;

      const messageAt = now();
      const roomId = chat.room_id ?? 'all';
      state.firstMessageAt = messageAt;
      state.firstMessageRoomId = roomId;
      track('chat_first_message', {
        room_id: roomId,
        seconds_from_enter: Math.max(0, Math.round((messageAt - state.enteredAt) / 1000)),
        ...(promptId ? { prompt_id: promptId } : {}),
      });
    },

    onRealtimeChat(chat: Chat) {
      if (
        !state.entered ||
        state.activated ||
        state.firstMessageAt === null ||
        !state.firstMessageRoomId ||
        !isNormalSavedMessage(chat) ||
        chat.room_id !== state.firstMessageRoomId
      ) {
        return;
      }

      const nonce = chat.metadata?.optimisticNonce;
      if (state.ownUuids.has(chat.uuid) || (nonce && state.ownNonces.has(nonce))) return;

      const replyLatencySeconds = Math.max(0, Math.round((now() - state.firstMessageAt) / 1000));
      state.activated = true;
      track('reciprocal_reply_received', {
        room_id: state.firstMessageRoomId,
        reply_latency_seconds: replyLatencySeconds,
      });
      track('conversation_activated', {
        room_id: state.firstMessageRoomId,
        activation_rule: 'reply_after_first_message_v1',
      });
    },

    onExited() {
      state = createInitialState();
      pendingEntryContext = 'unknown';
    },
  };
}
