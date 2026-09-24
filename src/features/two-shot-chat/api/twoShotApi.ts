import {
  parseLobbyRows,
  parseTwoShotResponse,
  type TwoShotRequest,
  type TwoShotResponse,
} from '../protocol';
import type { LobbyRow } from '../components/RoomList';

/**
 * Two_Shot_API と公開一覧を呼ぶ fetch のクライアント。Supabase の SDK は読み込まない
 * （このルートの JS を軽くする。requirements.md Requirement 17.5）。
 *
 * 通信の失敗・タイムアウト・4xx / 5xx・形の違う応答は、どれも 'failed'（画面は E12）にする。
 * 変更の操作は自動で再送しない（応答を失った発言を二重に送らないため。design.md §6）。
 */

export const REQUEST_TIMEOUT_MS = 10_000;

export type Failed = 'failed';

function config(): { url: string; key: string } | null {
  const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '';
  const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '';
  return url && key ? { url: url.replace(/\/$/, ''), key } : null;
}

async function postJson(
  path: string,
  body: unknown,
  headers: Record<string, string>,
  signal?: AbortSignal
): Promise<unknown> {
  const env = config();
  if (env === null) return undefined;
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), REQUEST_TIMEOUT_MS);
  const onAbort = () => timeout.abort();
  signal?.addEventListener('abort', onAbort);
  try {
    const response = await fetch(`${env.url}${path}`, {
      method: 'POST',
      headers: {
        apikey: env.key,
        Authorization: `Bearer ${env.key}`,
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: timeout.signal,
      cache: 'no-store',
    });
    if (!response.ok) return undefined;
    return (await response.json()) as unknown;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }
}

/** Edge Function two-shot を呼ぶ */
export async function callTwoShot(
  request: TwoShotRequest,
  token: string | null,
  signal?: AbortSignal
): Promise<TwoShotResponse | Failed> {
  const json = await postJson(
    '/functions/v1/two-shot',
    request,
    token === null ? {} : { 'x-two-shot-token': token },
    signal
  );
  return parseTwoShotResponse(json) ?? 'failed';
}

/** 公開一覧（two_shot_lobby()）を取得する */
export async function fetchLobby(signal?: AbortSignal): Promise<Record<string, LobbyRow> | Failed> {
  const json = await postJson('/rest/v1/rpc/two_shot_lobby', {}, {}, signal);
  return parseLobbyRows(json) ?? 'failed';
}
