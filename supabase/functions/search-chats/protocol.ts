export class SearchError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
export type SearchInput = {
  mode: 'search';
  roomId: string;
  terms: string[];
  rangeDays: 30 | 90;
  limit: number;
  cursor: string | null;
};
export type ContextInput = { mode: 'context'; roomId: string; targetUuid: string };
export type Cursor = {
  v: 1;
  roomId: string;
  digest: string;
  from: number;
  to: number;
  last: string;
  expires: number;
  rangeDays: 30 | 90;
};
export const DAY = 86_400_000;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = () => new SearchError(400, '検索条件を確認してください。');

export function parseInput(value: unknown, rooms: ReadonlySet<string>): SearchInput | ContextInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad();
  const v = value as Record<string, unknown>;
  if (typeof v.roomId !== 'string' || !rooms.has(v.roomId) || v.roomId === 'all') throw bad();
  if (v.mode === 'context') {
    if (typeof v.targetUuid !== 'string' || !UUID.test(v.targetUuid)) throw bad();
    return { mode: 'context', roomId: v.roomId, targetUuid: v.targetUuid };
  }
  if (v.mode !== 'search' || typeof v.q !== 'string') throw bad();
  const q = v.q.trim();
  const terms = q.split(/\s+/u);
  if (
    [...q].length < 2 ||
    [...q].length > 80 ||
    terms.length > 5 ||
    terms.some((t) => [...t].length < 2) ||
    /[\u0000-\u001f\u007f]/u.test(q)
  )
    throw bad();
  const rangeDays = v.rangeDays ?? 30;
  const limit = v.limit ?? 20;
  if (rangeDays !== 30 && rangeDays !== 90) throw bad();
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > 50) throw bad();
  if (v.cursor != null && (typeof v.cursor !== 'string' || v.cursor.length > 2048)) throw bad();
  return {
    mode: 'search',
    roomId: v.roomId,
    terms,
    rangeDays,
    limit,
    cursor: (v.cursor as string | null) ?? null,
  };
}
const encoder = new TextEncoder();
function encode(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
function decode(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[a-zA-Z0-9_-]+$/.test(text)) throw bad();
  return Uint8Array.from(atob(text.replaceAll('-', '+').replaceAll('_', '/')), (c) =>
    c.charCodeAt(0)
  );
}
async function key(secret: string) {
  return await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}
export async function hmac(value: string, secret: string): Promise<string> {
  return encode(
    new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), encoder.encode(value)))
  );
}
export async function signCursor(cursor: Cursor, secret: string): Promise<string> {
  const payload = encode(encoder.encode(JSON.stringify(cursor)));
  return `${payload}.${await hmac(payload, secret)}`;
}
export async function readCursor(
  token: string,
  input: SearchInput,
  secret: string,
  now: number
): Promise<Cursor> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2 || token.length > 2048) throw bad();
    const [payload, signature] = parts;
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await key(secret),
        decode(signature),
        encoder.encode(payload)
      ))
    )
      throw bad();
    const c = JSON.parse(new TextDecoder().decode(decode(payload))) as Cursor;
    const digest = await hmac(JSON.stringify(input.terms), secret);
    if (
      c.v !== 1 ||
      c.roomId !== input.roomId ||
      c.digest !== digest ||
      c.rangeDays !== input.rangeDays ||
      typeof c.last !== 'string' ||
      !UUID.test(c.last) ||
      !Number.isSafeInteger(c.expires) ||
      c.expires <= now ||
      c.expires > now + 15 * 60_000 ||
      !Number.isSafeInteger(c.from) ||
      !Number.isSafeInteger(c.to) ||
      c.to > now ||
      c.to - c.from !== c.rangeDays * DAY ||
      c.from < now - 91 * DAY
    )
      throw bad();
    return c;
  } catch {
    throw bad();
  }
}
export type SearchRow = {
  uuid: string;
  room_id: string;
  name: string;
  time: string | number;
  excerpt: string;
};
export function toItem(row: SearchRow) {
  return {
    uuid: row.uuid,
    roomId: row.room_id,
    name: row.name,
    time: Number(row.time),
    excerpt: row.excerpt,
  };
}
