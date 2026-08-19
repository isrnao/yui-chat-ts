import { describe, expect, it } from 'vitest';
import type { RoomId } from '@features/chat/rooms';
import type { Chat } from '@features/chat/types';
import type { AnalyticsEventMap } from '@shared/utils/analytics';
import { createConversationMeasurement } from './conversationMeasurement';

type TrackedCall = {
  [Name in keyof AnalyticsEventMap]: [Name, AnalyticsEventMap[Name]];
}[keyof AnalyticsEventMap];

function createChat(uuid: string, roomId: RoomId, overrides: Partial<Chat> = {}): Chat {
  return {
    uuid,
    room_id: roomId,
    name: '参加者',
    color: '#000000',
    message: 'こんにちは',
    time: 1,
    ip: '',
    ua: '',
    metadata: { version: 1 },
    ...overrides,
  };
}

function setup() {
  const calls: TrackedCall[] = [];
  let currentTime = 1_000;
  const track = <Name extends keyof AnalyticsEventMap>(
    name: Name,
    params: AnalyticsEventMap[Name]
  ) => {
    calls.push([name, params] as TrackedCall);
  };
  const measurement = createConversationMeasurement(
    track,
    () => currentTime,
    () => 'lobby'
  );

  return {
    calls,
    measurement,
    setTime(value: number) {
      currentTime = value;
    },
  };
}

describe('createConversationMeasurement', () => {
  it('tracks the join funnel with a controlled entry context', () => {
    const { calls, measurement } = setup();

    measurement.onJoinStarted('superbeginner');
    const entryContext = measurement.onEntered();

    expect(entryContext).toBe('lobby');
    expect(calls).toEqual([
      ['room_join_started', { room_id: 'superbeginner', entry_context: 'lobby' }],
    ]);
  });

  it('tracks a join failure without sending the validation message', () => {
    const { calls, measurement } = setup();

    measurement.onJoinStarted('superbeginner');
    measurement.onJoinFailed('superbeginner', 'validation');

    expect(calls[1]).toEqual([
      'room_join_failed',
      {
        room_id: 'superbeginner',
        entry_context: 'lobby',
        reason_category: 'validation',
      },
    ]);
  });

  it('tracks first message and the first external reply as one activation', () => {
    const { calls, measurement, setTime } = setup();
    const ownPending = createChat('temp-1', 'superbeginner', {
      optimistic: true,
      metadata: { version: 1, optimisticNonce: 'own-nonce' },
    });
    const ownSaved = createChat('own-1', 'superbeginner', {
      metadata: { version: 1, optimisticNonce: 'own-nonce' },
    });

    measurement.onJoinStarted('superbeginner');
    measurement.onEntered();
    measurement.onOwnMessagePending(ownPending);
    setTime(5_000);
    measurement.onOwnMessageSaved(ownSaved);

    // Supabase Realtimeが自分の保存結果をechoしても返信には数えない。
    measurement.onRealtimeChat(ownSaved);
    setTime(9_000);
    measurement.onRealtimeChat(createChat('other-1', 'superbeginner'));
    measurement.onRealtimeChat(createChat('other-2', 'superbeginner'));

    expect(calls).toContainEqual([
      'chat_first_message',
      { room_id: 'superbeginner', seconds_from_enter: 4 },
    ]);
    expect(calls).toContainEqual([
      'reciprocal_reply_received',
      { room_id: 'superbeginner', reply_latency_seconds: 4 },
    ]);
    expect(calls).toContainEqual([
      'conversation_activated',
      { room_id: 'superbeginner', activation_rule: 'reply_after_first_message_v1' },
    ]);
    expect(calls.filter(([name]) => name === 'conversation_activated')).toHaveLength(1);
  });

  it('ignores system messages, bot messages, and messages from another room', () => {
    const { calls, measurement, setTime } = setup();

    measurement.onJoinStarted('superbeginner');
    measurement.onEntered();
    setTime(2_000);
    measurement.onOwnMessageSaved(createChat('own-1', 'superbeginner'));
    measurement.onRealtimeChat(createChat('admin-1', 'superbeginner', { system: true }));
    measurement.onRealtimeChat(
      createChat('fortune-1', 'superbeginner', {
        system: true,
        metadata: { version: 1, kind: 'fortune' },
      })
    );
    measurement.onRealtimeChat(createChat('other-room', 'anime'));

    expect(calls.some(([name]) => name === 'conversation_activated')).toBe(false);
  });

  it('does not track replies after exit', () => {
    const { calls, measurement, setTime } = setup();

    measurement.onJoinStarted('superbeginner');
    measurement.onEntered();
    setTime(2_000);
    measurement.onOwnMessageSaved(createChat('own-1', 'superbeginner'));
    measurement.onExited();
    measurement.onRealtimeChat(createChat('other-1', 'superbeginner'));

    expect(calls.some(([name]) => name === 'conversation_activated')).toBe(false);
  });
});
