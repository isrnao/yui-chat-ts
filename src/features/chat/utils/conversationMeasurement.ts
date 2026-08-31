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
  firstMessagePending: boolean;
  pendingReplies: Chat[];
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
    firstMessagePending: false,
    pendingReplies: [],
    activated: false,
    ownNonces: new Set(),
    ownUuids: new Set(),
  };
}

function isNormalMessage(chat: Chat): boolean {
  const message = chat.message.trim();
  return (
    !chat.system &&
    chat.metadata?.kind !== 'admin' &&
    chat.metadata?.kind !== 'fortune' &&
    message !== 'look' &&
    message !== 'unlook' &&
    message !== 'おみくじ'
  );
}

function isNormalSavedMessage(chat: Chat): boolean {
  return !chat.optimistic && isNormalMessage(chat);
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
      if (state.entered && state.firstMessageAt === null && !state.activated && isNormalMessage(chat)) {
        state.firstMessagePending = true;
      }
    },

    onOwnMessageSaved(chat: Chat, promptId?: string) {
      state.ownUuids.add(chat.uuid);
      const nonce = chat.metadata?.optimisticNonce;
      if (nonce) state.ownNonces.add(nonce);

      if (!state.entered || state.firstMessageAt !== null || !isNormalSavedMessage(chat)) {
        state.firstMessagePending = false;
        state.pendingReplies = [];
        return;
      }

      const messageAt = now();
      const roomId = chat.room_id ?? 'all';
      state.firstMessageAt = messageAt;
      state.firstMessageRoomId = roomId;
      state.firstMessagePending = false;
      track('chat_first_message', {
        room_id: roomId,
        seconds_from_enter: Math.max(0, Math.round((messageAt - state.enteredAt) / 1000)),
        ...(promptId ? { prompt_id: promptId } : {}),
      });

      // Process replies that arrived while the first message was in-flight (Realtime may race the Edge Function response)
      for (const buffered of state.pendingReplies) {
        if (state.activated) break;
        const bufferedNonce = buffered.metadata?.optimisticNonce;
        if (
          buffered.room_id === roomId &&
          !state.ownUuids.has(buffered.uuid) &&
          !(bufferedNonce && state.ownNonces.has(bufferedNonce))
        ) {
          state.activated = true;
          track('reciprocal_reply_received', {
            room_id: roomId,
            reply_latency_seconds: 0,
          });
          track('conversation_activated', {
            room_id: roomId,
            activation_rule: 'reply_after_first_message_v1',
          });
        }
      }
      state.pendingReplies = [];
    },

    onRealtimeChat(chat: Chat) {
      if (!state.entered || state.activated || !isNormalSavedMessage(chat)) return;

      const nonce = chat.metadata?.optimisticNonce;
      if (state.ownUuids.has(chat.uuid) || (nonce && state.ownNonces.has(nonce))) return;

      // First message still in-flight: buffer the candidate reply instead of discarding it.
      // Realtime and Edge Function responses can arrive in any order.
      if (state.firstMessageAt === null || !state.firstMessageRoomId) {
        if (state.firstMessagePending && chat.room_id) {
          state.pendingReplies.push(chat);
        }
        return;
      }

      if (chat.room_id !== state.firstMessageRoomId) return;

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
