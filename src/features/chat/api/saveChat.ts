import type { Chat } from '@features/chat/types';
import { supabase } from '@shared/supabaseClient';
import { generateOperationId } from '@shared/utils/uuid';
import { DEFAULT_ROOM_ID, type RoomId } from '../rooms';
import { retryWithBackoff, warnIfSlow } from './retry';

/**
 * 発言の保存（save-chat Edge Function）。INSERT はクライアントから直接行わず、
 * Edge Function が ip / ua をリクエストヘッダから確定して service_role で書き込む。
 */

/**
 * 送信操作 1 件の ID と試行番号。リトライの全試行で同じ ID を送り、save-chat のトレースを
 * 操作単位で束ねる（spec observability-new-relic R5.8〜5.9）。試行ごとに trace ID は変わる。
 */
interface SaveOperation {
  id: string;
  attempt: number;
}

// Edge Function 共通呼び出し。ip / ua はサーバー側で設定するため payload に含めない。
async function invokeSaveChat(
  payload: {
    room_id: RoomId;
    name: string;
    color: string;
    message: string;
    system?: boolean;
    email?: string | null;
    metadata?: Chat['metadata'] | null;
  },
  operation: SaveOperation
): Promise<{
  uuid: string;
  room_id: RoomId;
  time: number;
  ip_masked?: string;
  ua?: string;
}> {
  const { data, error } = await supabase.functions.invoke('save-chat', {
    body: payload,
    headers: {
      'x-chat-operation-id': operation.id,
      'x-chat-attempt': String(operation.attempt),
    },
  });
  if (error) throw new Error(`Failed to save chat: ${error.message}`);
  const result: unknown = data;
  if (typeof result === 'object' && result !== null && 'error' in result) {
    throw new Error(`Failed to save chat: ${String((result as { error: unknown }).error)}`);
  }
  if (
    typeof result !== 'object' ||
    result === null ||
    typeof (result as { uuid?: unknown }).uuid !== 'string' ||
    typeof (result as { time?: unknown }).time !== 'number'
  ) {
    throw new Error('Failed to save chat: unexpected response from Edge Function');
  }
  return result as {
    uuid: string;
    room_id: RoomId;
    time: number;
    ip_masked?: string;
    ua?: string;
  };
}

export interface SaveChatOptions {
  /**
   * 送信操作の ID（spec observability-new-relic R5.8）。利用者の発言では、送信を始めた
   * フック（useChatSender.sendUserMessage）が発行して Browser の send-chat と共有する。
   * 省略時はここで発行する（入退室・巫女などのシステム発言）。
   */
  operationId?: string;
}

/**
 * save-chat Edge Function で保存する共通処理。リトライの全試行で同じ操作 ID を送り、
 * 試行番号だけを増やす。保存結果はサーバー確定値（uuid / time / ip_masked / ua）で上書きする。
 */
async function saveChatWithRetry(
  roomId: RoomId,
  chat: Chat,
  operationId: string,
  onSaved: () => void
): Promise<Chat> {
  return retryWithBackoff(async (attempt) => {
    const result = await invokeSaveChat(
      {
        room_id: roomId,
        name: chat.name,
        color: chat.color,
        message: chat.message,
        system: chat.system,
        email: chat.email,
        metadata: chat.metadata ?? null,
      },
      { id: operationId, attempt }
    );

    onSaved();

    return {
      ...chat,
      uuid: result.uuid,
      room_id: result.room_id ?? roomId,
      time: result.time,
      // Edge Function が返すサーバー観測値で確定させる。これを反映しないと、
      // realtime INSERT が先に届いた場合に後着の HTTP 応答が空値で上書きし、
      // 送信者だけ IP / ブラウザ行が消える。
      ip_masked: result.ip_masked ?? chat.ip_masked,
      ua: result.ua ?? chat.ua,
      optimistic: false,
    };
  });
}

// 楽観的更新用の高速バージョン
// INSERT は save-chat Edge Function 経由（ip/ua をサーバー側で設定し、RLS を通過）
export async function saveChatLogOptimistic(
  roomId: RoomId = DEFAULT_ROOM_ID,
  chat: Chat,
  { operationId = generateOperationId() }: SaveChatOptions = {}
): Promise<Chat> {
  const startTime = performance.now();
  return saveChatWithRetry(roomId, chat, operationId, () => {
    warnIfSlow('saveChatLogOptimistic', startTime);
  });
}

// 楽観的更新用のヘルパー関数
// 楽観的更新中の time は「サーバー時刻より十分先」に置き、ChatLogList の
// time-desc フォールバック sort で常に先頭に来ることを保証する。
// savedChat にマージされた時点でサーバー側の正しい time に置換される。
const OPTIMISTIC_TIME_OFFSET_MS = 365 * 24 * 60 * 60 * 1000;

export function createOptimisticChat(chatData: Omit<Chat, 'uuid' | 'time' | 'optimistic'>): Chat {
  // optimisticNonce: 楽観的更新の重複表示防止用のランダム識別子。
  // saveChatLogOptimistic がそのまま metadata に詰めて保存し、
  // realtime INSERT で同じ nonce が echo されるため、temp UUID と savedChat の
  // 同一性判定 (reduceOptimisticChat) を (client_time + name + message) より厳密に行える。
  const nonce =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
  const now = Date.now();
  const baseMetadata = chatData.metadata ?? { version: 1 as const };
  return {
    ...chatData,
    uuid: `temp-${now}-${Math.random().toString(36).substr(2, 9)}`, // 一時UUID
    time: now + OPTIMISTIC_TIME_OFFSET_MS, // 先頭表示保証用の未来時刻
    client_time: now,
    optimistic: true,
    metadata: { ...baseMetadata, optimisticNonce: nonce },
  };
}
