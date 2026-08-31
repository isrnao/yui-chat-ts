import type { RoomId } from '@features/chat/rooms';

export const GA_MEASUREMENT_ID = 'G-S3LCSTZBES';

export type EntryContext = 'direct' | 'lobby' | 'event' | 'invite' | 'campaign' | 'unknown';
export type ReminderChannel = 'web_push' | 'email' | 'line' | 'calendar';

/**
 * GA4へ送るイベントの契約。
 * 自由入力、表示名、メッセージ本文、メールアドレス、URLは追加しない。
 */
export type AnalyticsEventMap = {
  room_selected: {
    room_id: RoomId;
    room_title: string;
    room_type: 'chat' | 'chanari';
    transport_type?: 'beacon';
  };
  room_join_started: {
    room_id: RoomId;
    entry_context: EntryContext;
  };
  room_join_failed: {
    room_id: RoomId;
    entry_context: EntryContext;
    reason_category: 'validation' | 'save_error' | 'unknown';
  };
  chat_enter: {
    room_id: RoomId;
    room_title: string;
    entry_context?: EntryContext;
  };
  chat_exit: {
    room_id: RoomId;
    room_title: string;
  };
  message_sent: {
    room_id: RoomId;
    message_length: number;
  };
  command_used: {
    room_id: RoomId;
    command: 'look' | 'unlook' | 'fortune' | 'clear' | 'cut';
  };
  chat_first_message: {
    room_id: RoomId;
    seconds_from_enter: number;
    prompt_id?: string;
  };
  reciprocal_reply_received: {
    room_id: RoomId;
    reply_latency_seconds: number;
  };
  conversation_activated: {
    room_id: RoomId;
    activation_rule: 'reply_after_first_message_v1';
    event_id?: string;
  };
  active_lobby_view: {
    active_room_count: number;
    event_id?: string;
  };
  event_rsvp: {
    event_id: string;
    room_id: RoomId;
  };
  event_rsvp_cancelled: {
    event_id: string;
    room_id: RoomId;
  };
  event_join: {
    event_id: string;
    room_id: RoomId;
    entry_context: EntryContext;
  };
  invite_created: {
    room_id: RoomId;
    event_id?: string;
    invite_type: 'room' | 'scheduled' | 'event';
  };
  invite_opened: {
    invite_id: string;
    share_channel: 'copy' | 'x' | 'line' | 'other' | 'unknown';
  };
  invite_activated: {
    invite_id: string;
    room_id: RoomId;
  };
  reminder_opt_in: {
    channel: ReminderChannel;
    context: 'event' | 'room';
    event_id?: string;
  };
  reminder_click: {
    channel: ReminderChannel;
    event_id?: string;
  };
  report_submitted: {
    reason_category: 'harassment' | 'personal_info' | 'spam' | 'sexual' | 'other';
    room_id: RoomId;
  };
};

export function trackEvent<Name extends keyof AnalyticsEventMap>(
  name: Name,
  params: AnalyticsEventMap[Name]
): void {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', name, params);
  }
}

/**
 * GA4のtraffic sourceとは別に、チャット入室直前のサイト内文脈だけを分類する。
 * クエリ値やreferrer自体はGA4へ送らない。
 */
export function getEntryContext(): EntryContext {
  if (typeof window === 'undefined') return 'unknown';

  const params = new URLSearchParams(window.location.search);
  if (params.has('invite_id')) return 'invite';
  if (params.has('event_id')) return 'event';
  if (params.has('utm_source')) return 'campaign';

  if (!document.referrer) return 'direct';

  try {
    const referrer = new URL(document.referrer);
    if (referrer.origin === window.location.origin) return 'lobby';
  } catch {
    return 'unknown';
  }

  return 'direct';
}
