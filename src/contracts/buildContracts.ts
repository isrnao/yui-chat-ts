/**
 * Web と Android 版（okiraku-android）が共有する Contracts（`contracts/`）を作る。
 * .kiro/specs/android-native-app design.md §8。
 *
 * - データ（部屋・トップの一覧・色・選択肢・文言）は Web とサーバーのソースから取る。手で書かない
 * - fixtures の期待値は、Web の関数に入力を通して作る。Android は同じ入力で同じ結果になることを確かめる
 *
 * 生成と古さの確認は src/test/contracts.test.ts が行う（`pnpm contracts:export` で書き出す）。
 * エイリアス（@features）を使うソースを読むため、node ではなく Vitest から呼ぶ。
 */
import {
  CHAT_ROOM_IDS,
  CHAT_ROOMS,
  DEFAULT_ROOM_ID,
  getAppScope,
  ROOM_CATEGORY_LABELS,
  TWO_SHOT_ROOM_ID,
} from '@features/chat/rooms';
import {
  chatDirectoryGroups,
  chatRules,
  footerLines,
  guideMenu,
  intro,
  news,
  pickupGroups,
  sectionTitles,
  share,
  tabNav,
  X_SCREEN_NAME,
} from '@features/top/data';
import {
  COUNT_BADGE_MANY,
  COUNT_BADGE_TONES,
  toneClass,
} from '@features/top/components/shared/tones';
import { tailwindHex } from './tailwindColors';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { cwd } from 'node:process';
import { FONT_COLOR_CSS, FONT_SIZE_CSS, type Chat } from '@features/chat/types';
import {
  AVATAR_IDS,
  DEFAULT_COLOR,
  EMAIL_MAX,
  FONT_COLOR_NAMES,
  FONT_SIZES,
  MESSAGE_MAX,
  METADATA_KINDS,
  NAME_MAX,
  OPTIMISTIC_NONCE_MAX,
} from '@features/chat/inputRules';
import { INPUT_ERROR_MESSAGES } from '@features/chat/inputErrorMessages';
import { normalizeChat } from '@features/chat/utils/normalizeMetadata';
import { validateName } from '@features/chat/utils/validation';
import { UI_MESSAGES } from '@features/chat/uiMessages';
import { CHAT_TEXTS } from '@features/chat/chatTexts';
import { parseMessageSegments } from '@features/chat/utils/urlLinker';
import { LEGAL_PAGE_PATHS, TERMS_VERSION } from '@features/legal/legal';
import { buildAbsoluteUrl } from '@shared/utils/seo';
import {
  createRoomLogStore,
  INITIAL_CHAT_LOG_LIMIT,
  type LogSource,
} from '@features/chat/api/roomLogStore';
import type { RealtimeStatus } from '@features/chat/api/realtime';
import { buildAdminChat, enterMessage, exitMessage } from '@features/chat/serverMessages';
import {
  ADMIN_AVATAR,
  ADMIN_COLOR,
  ADMIN_NAME,
  FORTUNE_AVATAR,
  FORTUNE_COLOR,
  FORTUNE_NAME,
  buildFortuneChat,
} from '../../supabase/functions/save-chat/messages.ts';
import {
  checkSayInput,
  MESSAGE_MAX_CODE_POINTS,
  RESERVED_NAMES,
  sanitizeMetadata,
} from '../../supabase/functions/save-chat/schema.ts';
import {
  DEFAULT_WINDOW_ROW_OPTIONS,
  EXTENDED_WINDOW_ROW_OPTIONS,
  getWindowRowOptions,
} from '@features/chat/utils/windowRows';
import { formatLegacyDateTime } from '@shared/utils/format';
import { getRecentParticipants } from '@features/chat/hooks/useParticipants';
import { readAdminEvent } from '@features/chat/utils/adminMessage';
import { reduceOptimisticChat } from '@features/chat/utils/optimisticLog';
import { mergeChatLogByUuid } from '@features/chat/utils/aggregatedLog';
import { filterByIp } from '@features/chat/utils/ipFilter';
import {
  addFilteredIp,
  addFilteredName,
  addFilteredWord,
  clearFilters,
  FILTER_LIST_LIMIT,
  FILTER_NAMES_LIMIT,
  FILTER_WORD_MAX_LENGTH,
  getSnapshot as getFilterSnapshot,
  normalizeFilterWord,
  removeFilter,
} from '@features/chat/utils/ipFilterStore';

/** 互換の無い変更（キーの削除・意味の変更）で上げる。Android は知らない版を読んだらビルドを落とす */
export const CONTRACTS_VERSION = 1;

/** fixtures の日時の表記を作るときのタイムゾーン（Android のテストも同じゾーンで比べる） */
export const FIXTURE_TIME_ZONE = 'Asia/Tokyo';

/** Author_Key の形（サーバーの author_key_hash() と同じ。合わない鍵は保存されるが clear で消せない） */
const AUTHOR_KEY_PATTERN = '^[A-Za-z0-9_-]{43}$';

/** 書き出すファイル（contracts/ からの相対パス → JSON の値） */
export type ContractFiles = Record<string, unknown>;

// --- データ ---

function rooms() {
  return {
    defaultRoomId: DEFAULT_ROOM_ID,
    twoShotRoomId: TWO_SHOT_ROOM_ID,
    rooms: CHAT_ROOM_IDS.map((id) => {
      const meta = CHAT_ROOMS[id];
      return {
        id,
        title: meta.title,
        description: meta.description,
        category: meta.category,
        categoryLabel: ROOM_CATEGORY_LABELS[meta.category],
        enabled: meta.enabled,
        appScope: getAppScope(id),
        windowRowOptions: getWindowRowOptions(id),
      };
    }),
  };
}

function directory() {
  return {
    groups: chatDirectoryGroups.map((group) => ({
      title: group.title,
      note: group.note,
      tone: group.tone,
      items: group.items.map((item) => ({
        label: item.label,
        href: item.href,
        roomId: item.roomId ?? null,
        roomType: item.roomType ?? null,
        external: item.external ?? false,
      })),
    })),
  };
}

/** theme.css の @theme の変数（--color-* と --font-yui）を読む */
export function parseThemeCss(css: string) {
  const colors: Record<string, string> = {};
  for (const match of css.matchAll(/--color-([a-z0-9-]+):\s*([^;]+);/g)) {
    colors[match[1]!] = match[2]!.trim();
  }
  const font = css.match(/--font-yui:\s*([^;]+);/)?.[1] ?? '';
  const fontFamily = font
    .split(',')
    .map((name) => name.trim().replace(/^'(.*)'$/, '$1'))
    .filter((name) => name.length > 0);
  return { colors, fontFamily };
}

function theme(themeCss: string) {
  const { colors, fontFamily } = parseThemeCss(themeCss);
  return {
    colors,
    fontFamily,
    fontColors: FONT_COLOR_NAMES.map((name) => ({ name, css: FONT_COLOR_CSS[name] })),
    fontSizes: FONT_SIZES.map((size) => ({ size, em: Number.parseFloat(FONT_SIZE_CSS[size]) })),
  };
}

function chatOptions() {
  return {
    limits: {
      nameMax: NAME_MAX,
      messageMax: MESSAGE_MAX,
      messageMaxCodePoints: MESSAGE_MAX_CODE_POINTS,
      emailMax: EMAIL_MAX,
      optimisticNonceMax: OPTIMISTIC_NONCE_MAX,
    },
    defaultColor: DEFAULT_COLOR,
    reservedNames: RESERVED_NAMES,
    fontSizes: FONT_SIZES,
    fontColorNames: FONT_COLOR_NAMES,
    avatarIds: AVATAR_IDS,
    /** metadata の kind（発言の種類。サーバーだけが normal 以外を書く） */
    metadataKinds: METADATA_KINDS,
    windowRowOptions: {
      default: DEFAULT_WINDOW_ROW_OPTIONS,
      extended: EXTENDED_WINDOW_ROW_OPTIONS,
    },
    inputErrorMessages: INPUT_ERROR_MESSAGES,
    authorKeyPattern: AUTHOR_KEY_PATTERN,
    filters: {
      listLimit: FILTER_LIST_LIMIT,
      namesPerIpLimit: FILTER_NAMES_LIMIT,
      wordMaxLength: FILTER_WORD_MAX_LENGTH,
    },
  };
}

function serverMessages() {
  const NAME = '{name}';
  return {
    admin: { name: ADMIN_NAME, color: ADMIN_COLOR, avatar: ADMIN_AVATAR },
    fortune: { name: FORTUNE_NAME, color: FORTUNE_COLOR, avatar: FORTUNE_AVATAR },
    /** `{name}` を入退室した人の名前に置き換える（楽観的な表示だけに使う。保存される文言はサーバーが作る） */
    enterTemplate: enterMessage(NAME),
    exitTemplate: exitMessage(NAME),
  };
}

// --- fixtures ---

/** fixtures の行を作る（ここに無い項目は既定値） */
function row(partial: Partial<Chat> & Pick<Chat, 'uuid' | 'time'>): Chat {
  return {
    name: 'ゆい',
    color: '#ff69b4',
    message: 'こんにちは',
    ip_masked: '',
    ua: '',
    ...partial,
  };
}

/** uuid v7（時刻の部分だけ変える）。並びの fixtures は uuid の大小で決まる */
function v7(ms: number, suffix = 0): string {
  const hex = ms.toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-${suffix.toString(16).padStart(12, '0')}`;
}

const T0 = Date.UTC(2026, 9, 11, 11, 10, 0); // 2026-10-11 20:10:00 JST

function legacyDateTime() {
  const times = [
    T0,
    Date.UTC(2013, 0, 2, 11, 0, 0),
    Date.UTC(2026, 0, 1, 14, 59, 59), // JST で 1/1 23:59
    Date.UTC(2025, 11, 31, 15, 0, 0), // JST で 1/1 0:00（UTC では前年）
  ];
  return {
    timeZone: FIXTURE_TIME_ZONE,
    cases: times.map((time) => ({ time, expected: formatLegacyDateTime(time) })),
  };
}

function adminChat(
  uuid: string,
  time: number,
  event: 'enter' | 'exit',
  name: string,
  color: string
): Chat {
  const built = buildAdminChat({ event, name, color });
  return { ...row({ uuid, time }), ...built };
}

function legacyAdminChat(uuid: string, time: number, message: string, userColor?: string): Chat {
  return row({
    uuid,
    time,
    name: '管理人',
    color: ADMIN_COLOR,
    message,
    system: true,
    metadata: { version: 1, kind: 'admin', ...(userColor ? { userColor } : {}) },
  });
}

function adminEvents() {
  const cases: { name: string; chat: Chat }[] = [
    { name: '構造のある入室', chat: adminChat(v7(T0), T0, 'enter', 'ゆい', '#ff0000') },
    { name: '構造のある退室', chat: adminChat(v7(T0), T0, 'exit', 'ほし', '#0000ff') },
    {
      name: '構造の無い古い入室',
      chat: legacyAdminChat(v7(T0), T0, 'つき さん、Welcome to お気楽チャット☆', 'orangered'),
    },
    {
      name: '構造の無い古い退室（読点が半角）',
      chat: legacyAdminChat(v7(T0), T0, 'つきさん,またきておくれやすぅ。'),
    },
    {
      name: '入退室でない管理人の発言',
      chat: legacyAdminChat(v7(T0), T0, '機能要求を受け付けました（Issue #12）'),
    },
    { name: '利用者の発言', chat: row({ uuid: v7(T0), time: T0 }) },
  ];
  return {
    cases: cases.map(({ name, chat }) => ({
      name,
      chat,
      expected: readAdminEvent(chat) ?? null,
    })),
  };
}

function participants() {
  const now = T0;
  const min = 60_000;
  const log: Chat[] = [
    row({ uuid: v7(now - 1 * min), time: now - 1 * min, name: 'ゆい', color: '#ff69b4' }),
    adminChat(v7(now - 2 * min), now - 2 * min, 'exit', 'ほし', '#0000ff'),
    row({ uuid: v7(now - 3 * min), time: now - 3 * min, name: 'ほし', color: '#0000ff' }),
    adminChat(v7(now - 4 * min), now - 4 * min, 'enter', 'つき', '#008000'),
    legacyAdminChat(
      v7(now - 4.5 * min),
      now - 4.5 * min,
      'そら さん、Welcome to お気楽チャット☆',
      'navy'
    ),
    row({ uuid: v7(now - 6 * min), time: now - 6 * min, name: 'むかし', color: '#808080' }),
    {
      ...row({ uuid: v7(now - 30_000), time: now - 30_000 }),
      ...buildFortuneChat('ゆい', 0),
    },
  ];
  return {
    windowMs: 5 * min,
    cases: [{ name: '直近 5 分と入退室', now, log, expected: getRecentParticipants(log, now) }],
  };
}

function optimistic() {
  const nonce = 'nonce-1';
  const temp = row({
    uuid: 'temp-1',
    time: T0 + 365 * 24 * 60 * 60 * 1000,
    client_time: T0,
    optimistic: true,
    metadata: { version: 1, optimisticNonce: nonce },
  });
  const saved = row({ uuid: v7(T0), time: T0, metadata: { version: 1, optimisticNonce: nonce } });
  const other = row({ uuid: v7(T0 - 1000), time: T0 - 1000, name: 'ほし', message: 'やあ' });
  const steps = [
    { name: '確定行がまだ無いので重ねる', state: [other], chat: temp },
    { name: '同じ nonce の確定行があるので重ねない', state: [saved, other], chat: temp },
    {
      name: 'nonce の無い古い行は client_time と中身で比べる',
      state: [{ ...saved, metadata: { version: 1 as const }, client_time: T0 }, other],
      chat: { ...temp, metadata: { version: 1 as const } },
    },
    {
      name: '同じ uuid は置き換える',
      state: [saved, other],
      chat: { ...saved, message: '直した' },
    },
  ];
  return {
    cases: steps.map((step) => ({
      ...step,
      expectedUuids: reduceOptimisticChat(step.state, step.chat).map((c) => c.uuid),
    })),
  };
}

/**
 * DB と Realtime の行の読み方（Web の normalizeChat）。古い行は形がそろっていないので、項目ごとに型を確かめ、
 * 合わないものは既定値にする（metadata は許可した値だけを残す）。
 */
function normalizeChatRows() {
  const inputs: { name: string; row: unknown }[] = [
    {
      name: '新しい行はそのまま',
      row: {
        uuid: v7(T0),
        room_id: DEFAULT_ROOM_ID,
        name: 'ゆい',
        color: '#ff69b4',
        message: 'こんにちは',
        time: T0,
        system: false,
        email: 'yui@example.com',
        ip_masked: '219.107.106.*',
        ua: 'Mozilla/5.0',
        metadata: {
          version: 1,
          fontStyle: { fontSize: 3, fontColor: 'red', bold: true },
          avatar: 'hoshi1',
        },
      },
    },
    {
      name: '知らない部屋は既定の部屋にする',
      row: {
        uuid: v7(T0),
        room_id: 'no-such-room',
        name: 'ゆい',
        color: '#000',
        message: 'a',
        time: T0,
      },
    },
    {
      name: '型の違う項目は既定値にする',
      row: {
        uuid: 1,
        room_id: null,
        name: 2,
        color: null,
        message: ['x'],
        time: '1',
        email: 3,
        ip_masked: 4,
        ua: 5,
      },
    },
    { name: '行でなければ空の行', row: 'not a row' },
    {
      name: '未対応の版の metadata は捨てる',
      row: {
        uuid: v7(T0),
        name: 'ゆい',
        color: '#000',
        message: 'a',
        time: T0,
        metadata: { version: 2, avatar: 'hoshi1' },
      },
    },
    {
      name: 'metadata は許可した値だけを残す',
      row: {
        uuid: v7(T0),
        name: 'ゆい',
        color: '#000',
        message: 'a',
        time: T0,
        metadata: {
          version: 1,
          fontStyle: { fontSize: 9, fontColor: 'pink', bold: 'yes' },
          avatar: 'none',
          kind: 'secret',
          userColor: 7,
          visitCount: '3',
          lastLogin: T0,
          optimisticNonce: 'n-1',
          extra: true,
        },
      },
    },
    {
      name: '文字の飾りが 1 つでも合えば残す',
      row: {
        uuid: v7(T0),
        name: 'ゆい',
        color: '#000',
        message: 'a',
        time: T0,
        metadata: {
          version: 1,
          fontStyle: { fontSize: 2, fontColor: 'nocolor' },
          avatar: 'tuki1',
          kind: 'fortune',
        },
      },
    },
    {
      name: '入退室の構造は名前があるときだけ読む',
      row: {
        uuid: v7(T0),
        name: '管理人',
        color: 'red',
        message: 'ゆいさん、Welcome to …',
        time: T0,
        system: true,
        metadata: {
          version: 1,
          kind: 'admin',
          userColor: '#ff69b4',
          visitCount: 49,
          event: 'enter',
          subject: { name: 'ゆい', color: '#ff69b4' },
        },
      },
    },
    {
      name: '名前の無い入退室の構造は捨てる',
      row: {
        uuid: v7(T0),
        name: '管理人',
        color: 'red',
        message: 'x',
        time: T0,
        metadata: { version: 1, kind: 'admin', event: 'exit', subject: { name: '' } },
      },
    },
    {
      name: '入退室の色が文字列でなければ空',
      row: {
        uuid: v7(T0),
        name: '管理人',
        color: 'red',
        message: 'x',
        time: T0,
        metadata: { version: 1, kind: 'admin', event: 'exit', subject: { name: 'ゆい', color: 1 } },
      },
    },
    {
      name: '楽観的な行の項目も読む',
      row: {
        uuid: 'temp-1',
        name: 'ゆい',
        color: '#000',
        message: 'a',
        time: T0,
        client_time: T0,
        optimistic: true,
      },
    },
  ];
  return { cases: inputs.map(({ name, row }) => ({ name, row, expected: normalizeChat(row) })) };
}

// --- Room_Log_Store の規則（design.md §6.2） ---

type LogStep =
  | { type: 'start' }
  | { type: 'resolve'; fetch: number; rows: Chat[] }
  | { type: 'reject'; fetch: number }
  | { type: 'insert'; chat: Chat }
  | { type: 'status'; status: RealtimeStatus }
  | { type: 'saved'; chat: Chat }
  | { type: 'remove'; uuids: string[] }
  | { type: 'reload' }
  | { type: 'expand'; limit: number };

/** 発言 1 件。uuid は v7 の形で、時刻 n の大小が並びを決める。本文は名札（id）にする */
function logChat(id: string, n: number): Chat {
  return row({ uuid: v7(T0 + n * 1000, n), time: T0 + n * 1000, message: id });
}

/**
 * Web の Room_Log_Store を、偽の取得と Realtime で 1 歩ずつ動かし、各歩の後の状態を記録する。
 * 取得の結果（resolve / reject）は、何番目の取得に返すかを `fetch`（1 から）で指す。
 */
async function runRoomLog(steps: LogStep[]) {
  const fetches: { limit: number; resolve: (chats: Chat[]) => void; reject: (e: Error) => void }[] =
    [];
  let onInsert: ((chat: Chat) => void) | null = null;
  let onStatus: ((status: RealtimeStatus) => void) | null = null;
  const source: LogSource = {
    initialLimit: INITIAL_CHAT_LOG_LIMIT,
    fetch: (limit) =>
      new Promise<Chat[]>((resolve, reject) => fetches.push({ limit, resolve, reject })),
    subscribe: (insert, status) => {
      onInsert = insert;
      onStatus = status;
      return { unsubscribe() {} };
    },
  };
  const store = createRoomLogStore(source);
  const snapshots = [];
  for (const step of steps) {
    switch (step.type) {
      case 'start':
        store.subscribe(() => {});
        break;
      case 'resolve':
        fetches[step.fetch - 1]!.resolve(step.rows);
        break;
      case 'reject':
        fetches[step.fetch - 1]!.reject(new Error('failed'));
        break;
      case 'insert':
        onInsert!(step.chat);
        break;
      case 'status':
        onStatus!(step.status);
        break;
      case 'saved':
        store.applySaved(step.chat);
        break;
      case 'remove': {
        const removed = new Set(step.uuids);
        store.update((chats) => chats.filter((c) => !removed.has(c.uuid)));
        break;
      }
      case 'reload':
        store.reload();
        break;
      case 'expand':
        store.expand(step.limit);
        break;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    const state = store.getSnapshot();
    snapshots.push({
      status: state.status,
      messages: state.chats.map((c) => c.message),
      realtime: state.realtime,
      fetches: fetches.map((f) => f.limit),
    });
  }
  return snapshots;
}

/**
 * Room_Log_Store の場面（Web の roomLogStore.test.ts と同じ）。購読をやめた後の再開は含めない
 * （アプリは最後の状態を残してすぐ出す。design.md §6.2 で Web と意図して違う）。
 */
async function roomLogEvents() {
  const a = logChat('a', 1);
  const b = logChat('b', 2);
  const c = logChat('c', 3);
  const d = logChat('d', 4);
  const scenarios: { name: string; steps: LogStep[] }[] = [
    {
      name: '最初の購読で Realtime を張ってから取得を始め、結果を ready で公開する',
      steps: [{ type: 'start' }, { type: 'resolve', fetch: 1, rows: [b, a] }],
    },
    {
      name: '取得中に届いた発言は取得結果に無くても残す',
      steps: [
        { type: 'start' },
        { type: 'insert', chat: c },
        { type: 'resolve', fetch: 1, rows: [b, a] },
      ],
    },
    {
      name: '順番どおりでなく届いた発言も、新しい順の位置に入る',
      steps: [
        { type: 'start' },
        { type: 'resolve', fetch: 1, rows: [d, a] },
        { type: 'insert', chat: b },
        { type: 'insert', chat: c },
      ],
    },
    {
      name: 'connected に遷移したときだけ取り直す',
      steps: [
        { type: 'start' },
        { type: 'resolve', fetch: 1, rows: [a] },
        { type: 'status', status: 'connected' },
        { type: 'status', status: 'connected' },
        { type: 'resolve', fetch: 2, rows: [b, a] },
        { type: 'status', status: 'disconnected' },
        { type: 'status', status: 'connected' },
        { type: 'resolve', fetch: 3, rows: [c, b, a] },
      ],
    },
    {
      name: '拡張では表示中の発言を残し、通常の取り直しでは取得結果を正とする',
      steps: [
        { type: 'start' },
        { type: 'resolve', fetch: 1, rows: [d, c] },
        { type: 'expand', limit: 100 },
        { type: 'resolve', fetch: 2, rows: [c, b, a] },
        { type: 'reload' },
        { type: 'resolve', fetch: 3, rows: [c, a] },
      ],
    },
    {
      name: '件数は減らす方向に戻さない',
      steps: [
        { type: 'start' },
        { type: 'expand', limit: 100 },
        { type: 'expand', limit: 30 },
        { type: 'expand', limit: 100 },
      ],
    },
    {
      name: '新しい取得が始まったら古い取得の結果は捨てる',
      steps: [
        { type: 'start' },
        { type: 'reload' },
        { type: 'resolve', fetch: 2, rows: [b] },
        { type: 'resolve', fetch: 1, rows: [a] },
      ],
    },
    {
      name: '取得に失敗すると error にし、表示中の行は残す',
      steps: [
        { type: 'start' },
        { type: 'resolve', fetch: 1, rows: [b, a] },
        { type: 'reload' },
        { type: 'reject', fetch: 2 },
      ],
    },
    {
      name: '取得中に合流した保存の確定値は、古い取得結果で消さない',
      steps: [
        { type: 'start' },
        { type: 'saved', chat: c },
        { type: 'resolve', fetch: 1, rows: [b, a] },
      ],
    },
    {
      name: '取得中に行った書き換え（clear の反映）は、古い取得結果で巻き戻さない',
      steps: [
        { type: 'start' },
        { type: 'resolve', fetch: 1, rows: [b, a] },
        { type: 'reload' },
        { type: 'remove', uuids: [a.uuid] },
        { type: 'resolve', fetch: 2, rows: [b, a] },
      ],
    },
    {
      name: '同じ取得中に削除と新着が繰り返されても、最後の削除後の発言だけ残す',
      steps: [
        { type: 'start' },
        { type: 'insert', chat: a },
        { type: 'remove', uuids: [a.uuid] },
        { type: 'insert', chat: b },
        { type: 'remove', uuids: [b.uuid] },
        { type: 'insert', chat: c },
        { type: 'resolve', fetch: 1, rows: [a] },
      ],
    },
    {
      name: '取得が終わった後の書き換えは、次の取得結果には適用しない',
      steps: [
        { type: 'start' },
        { type: 'resolve', fetch: 1, rows: [b, a] },
        { type: 'remove', uuids: [a.uuid] },
        { type: 'reload' },
        { type: 'resolve', fetch: 2, rows: [b, a] },
      ],
    },
    {
      name: '同じ uuid の保存の確定値は置き換える',
      steps: [
        { type: 'start' },
        { type: 'resolve', fetch: 1, rows: [b, a] },
        { type: 'saved', chat: { ...b, message: 'b2' } },
      ],
    },
  ];
  const cases = [];
  for (const scenario of scenarios) {
    cases.push({ ...scenario, expected: await runRoomLog(scenario.steps) });
  }
  return { initialLimit: INITIAL_CHAT_LOG_LIMIT, cases };
}

// --- Filter_List の操作（Web の ipFilterStore、.kiro/specs/chat-ip-mute） ---

type FilterOp =
  | { type: 'addIp'; ip: string; names: string[] }
  | { type: 'addName'; name: string }
  | { type: 'addWord'; word: string }
  | { type: 'remove'; key: string }
  | { type: 'clear' };

/**
 * Filter_List の読み込み（古い保存形式・壊れた値）と操作（重複・名前のまとめ方・上限）。Web の ipFilterStore に通して
 * 期待値にする。保存先の localStorage は jsdom のもの
 */
function filterList() {
  const key = 'yui-chat-muted-ips';
  const parseCases: { name: string; raw: unknown }[] = [
    { name: '種類を持つ前の形（IP の文字列だけ）', raw: ['1.2.3.*', '', '*', 7] },
    {
      name: '種類を持つ前の形（ip と names）',
      raw: [{ ip: '1.2.3.*', names: ['a', 'a', 1, '', 'b'] }],
    },
    {
      name: '3 種類と、使えない値',
      raw: [
        { kind: 'name', name: 'ゆい' },
        { kind: 'name', name: '  ' },
        { kind: 'word', word: '  ばか  ' },
        { kind: 'word', word: '' },
        { kind: 'other', ip: '1.2.3.*' },
        { kind: 'ip', ip: '4.5.6.*', names: 'x' },
      ],
    },
    {
      name: '重複は最初のものを残す',
      raw: [{ kind: 'name', name: 'a' }, { kind: 'name', name: 'a' }, '1.1.1.*'],
    },
    {
      name: '長い言葉は上限まで',
      raw: [{ kind: 'word', word: 'あ'.repeat(FILTER_WORD_MAX_LENGTH + 5) }],
    },
    {
      name: '件数が上限を超えたら末尾を残す',
      raw: Array.from({ length: FILTER_LIST_LIMIT + 3 }, (_, i) => ({
        kind: 'name',
        name: `n${i}`,
      })),
    },
    {
      name: '1 つの IP の名前は上限まで',
      raw: [
        { ip: '1.2.3.*', names: Array.from({ length: FILTER_NAMES_LIMIT + 2 }, (_, i) => `n${i}`) },
      ],
    },
    { name: '配列でなければ空', raw: { ip: '1.2.3.*' } },
  ];
  const parse = parseCases.map(({ name, raw }) => {
    localStorage.setItem(key, JSON.stringify(raw));
    return { name, raw, expected: getFilterSnapshot() };
  });

  const scenarios: { name: string; ops: FilterOp[] }[] = [
    {
      name: '同じ IP に名前を足すと、まだない名前だけを前に足す',
      ops: [
        { type: 'addIp', ip: '1.2.3.*', names: ['a', 'b'] },
        { type: 'addIp', ip: '1.2.3.*', names: ['c', 'a'] },
        { type: 'addIp', ip: '1.2.3.*', names: ['a'] },
      ],
    },
    {
      name: '分からない IP は足さない',
      ops: [
        { type: 'addIp', ip: '*', names: ['a'] },
        { type: 'addIp', ip: '', names: [] },
      ],
    },
    {
      name: '名前と言葉は重ねて足さず、言葉は整える',
      ops: [
        { type: 'addName', name: 'ゆい' },
        { type: 'addName', name: 'ゆい' },
        { type: 'addName', name: '  ' },
        { type: 'addWord', word: '  ばか ' },
        { type: 'addWord', word: 'ばか' },
        { type: 'addWord', word: '   ' },
      ],
    },
    {
      name: '1 件ずつ外し、まとめて外す',
      ops: [
        { type: 'addIp', ip: '1.2.3.*', names: [] },
        { type: 'addName', name: 'ゆい' },
        { type: 'remove', key: 'ip:1.2.3.*' },
        { type: 'remove', key: 'name:none' },
        { type: 'addWord', word: 'x' },
        { type: 'clear' },
      ],
    },
    {
      name: '上限を超えたら古いものから捨てる',
      ops: Array.from({ length: FILTER_LIST_LIMIT + 2 }, (_, i) => ({
        type: 'addName' as const,
        name: `n${i}`,
      })),
    },
  ];
  const cases = scenarios.map(({ name, ops }) => {
    localStorage.removeItem(key);
    const expected = ops.map((op) => {
      switch (op.type) {
        case 'addIp':
          addFilteredIp(op.ip, op.names);
          break;
        case 'addName':
          addFilteredName(op.name);
          break;
        case 'addWord':
          addFilteredWord(op.word);
          break;
        case 'remove':
          removeFilter(op.key);
          break;
        case 'clear':
          clearFilters();
          break;
      }
      return getFilterSnapshot();
    });
    return { name, ops, expected };
  });
  localStorage.removeItem(key);
  return { parse, cases };
}

/**
 * 入室フォームの名前の検査（Web の validateName）。画面での先回りの検査で、最後の判定はサーバー（save-chat）。
 * 画面は UTF-16 の単位で数えるので、コードポイントで数えるサーバーより厳しい
 */
function nameChecks() {
  const names = [
    'ゆい',
    '',
    '   ',
    'あ'.repeat(NAME_MAX),
    'あ'.repeat(NAME_MAX + 1),
    '😀'.repeat(13),
    ...RESERVED_NAMES,
    ' 管理人 ',
    '　',
    // 予約名は NFKC にして空白と見えない文字を除いてから比べる（save-chat の isReservedName）
    '管 理 人',
    '管理⼈',
    '管\u200B理人',
    '巫\u3000女',
    '\u2060巫女\uFE0F',
    '管理人さん',
  ];
  return { cases: names.map((name) => ({ name, expected: validateName(name) })) };
}

// --- ホーム（Web のトップ、design.md §4.2） ---

function linkOf(item: {
  label?: string;
  linkLabel?: string;
  href?: string;
  linkHref?: string;
  roomId?: string;
  roomType?: string;
  external?: boolean;
}) {
  return {
    label: item.label ?? item.linkLabel ?? '',
    href: item.href ?? item.linkHref ?? '',
    roomId: item.roomId ?? null,
    roomType: item.roomType ?? null,
    external: item.external ?? false,
  };
}

function headerColors(): Record<string, string> {
  const css = readFileSync(
    join(cwd(), 'src/features/top/components/Header/headerTheme.css'),
    'utf8'
  );
  const colors: Record<string, string> = {};
  for (const match of css.matchAll(/--ochat-h-([a-z0-9-]+):\s*(#[0-9a-f]{3,6});/gi)) {
    colors[match[1]!] = match[2]!.toLowerCase();
  }
  return colors;
}

/** ホームの文言・並び・色。どれも Web のトップ（top/data.ts と tones.ts）から作る */
function home() {
  return {
    intro: { title: intro.title, body: intro.body.join('') },
    sectionTitles,
    guideMenu: guideMenu.map((item) => ({ ...linkOf(item), iconKind: item.iconKind })),
    tabs: tabNav.map(linkOf),
    news: news.map((item) => ({
      parts: item.parts.map((part) =>
        typeof part === 'string' ? { text: part } : { link: linkOf(part) }
      ),
    })),
    pickupGroups: pickupGroups.map((group) => ({
      title: group.title,
      note: group.note,
      tone: group.tone,
      items: group.items.map(linkOf),
    })),
    chatRules,
    xScreenName: X_SCREEN_NAME,
    share,
    footerLines,
    /** 系統の色（見出しの補足と行頭の丸） */
    tones: Object.fromEntries(
      Object.entries(toneClass).map(([tone, className]) => [tone, tailwindHex(className)])
    ),
    countBadge: {
      many: COUNT_BADGE_MANY,
      none: tailwindHex(COUNT_BADGE_TONES.none),
      few: tailwindHex(COUNT_BADGE_TONES.few),
      manyColor: tailwindHex(COUNT_BADGE_TONES.many),
    },
    /** ヘッダーの配色（headerTheme.css の --ochat-h-* のうち 16 進の色） */
    headerColors: headerColors(),
    /** トップで使う文字・線・リンクの色（TopPage と各欄の class） */
    colors: Object.fromEntries(
      ['gray-300', 'gray-500', 'gray-700', 'gray-800', 'blue-600', 'blue-700'].map((name) => [
        name,
        tailwindHex(name),
      ])
    ),
  };
}

/** 本文の URL のリンク化（Web の parseMessageSegments）。http(s) だけ、末尾の日本語の句読点と閉じ括弧は外す */
function urlSegments() {
  const messages = [
    '',
    'こんにちは',
    'https://www.okiraku.chat/ を見て',
    'ここ→https://example.com/a?b=c。',
    '（http://example.com/x）',
    '二つ https://a.example/ と http://b.example/path#frag',
    'javascript:alert(1) ftp://x.example',
    'https://example.com/「引用」',
    '<https://example.com/>',
    'https://example.com/】」』、',
  ];
  return {
    cases: messages.map((message) => ({ message, expected: parseMessageSegments(message) })),
  };
}

function roomLogMerge() {
  const a = row({ uuid: v7(T0, 1), time: T0 });
  const b = row({ uuid: v7(T0 + 1000, 2), time: T0 + 1000 });
  const c = row({ uuid: v7(T0 + 2000, 3), time: T0 + 2000 });
  const legacy = row({ uuid: 'legacy-not-v7', time: T0 + 500 });
  const steps = [
    { name: '新しい行は先頭', state: [b, a], incoming: [c] },
    { name: '古い行は位置を探して入れる', state: [c, a], incoming: [b] },
    { name: '同じ uuid は置き換える', state: [c, b, a], incoming: [{ ...b, message: '直した' }] },
    { name: '複数をまとめて合流', state: [a], incoming: [c, b] },
    { name: 'v7 でない uuid は time で比べる', state: [c, b, a], incoming: [legacy] },
  ];
  return {
    maxRows: 2000,
    cases: steps.map((step) => {
      const merged = mergeChatLogByUuid(step.state, step.incoming);
      return {
        ...step,
        expectedUuids: merged.map((chat) => chat.uuid),
        expectedMessages: merged.map((chat) => chat.message),
      };
    }),
  };
}

function filters() {
  const log: Chat[] = [
    row({
      uuid: v7(T0, 1),
      time: T0,
      name: 'ゆい',
      message: 'ＡＢＣの話',
      ip_masked: '219.*.*.253',
    }),
    row({
      uuid: v7(T0 - 1000, 2),
      time: T0 - 1000,
      name: 'ほし',
      message: 'abc です',
      ip_masked: '2001:*',
    }),
    adminChat(v7(T0 - 2000, 3), T0 - 2000, 'enter', 'ほし', '#0000ff'),
    {
      ...row({ uuid: v7(T0 - 3000, 4), time: T0 - 3000, ip_masked: '219.*.*.253' }),
      ...buildFortuneChat('ゆい', 1),
    },
    row({
      uuid: v7(T0 - 4000, 5),
      time: T0 - 4000,
      name: 'つき',
      message: 'こんばんは',
      ip_masked: '*',
    }),
  ];
  const specs = [
    { name: 'IP', ips: ['219.*.*.253'], names: [], words: [] },
    { name: '名前（入退室の名前にも当たる）', ips: [], names: ['ほし'], words: [] },
    {
      name: '言葉（NFKC・大文字小文字を区別しない。管理人の定型文には当てない）',
      ips: [],
      names: [],
      words: ['abc'],
    },
    { name: '組み合わせ', ips: ['2001:*'], names: ['つき'], words: ['ＷＥＬＣＯＭＥ'] },
  ];
  return {
    log,
    cases: specs.map((spec) => {
      const result = filterByIp(log, {
        set: new Set(spec.ips),
        names: new Set(spec.names),
        words: spec.words,
      });
      return {
        ...spec,
        expectedVisibleUuids: result.visible.map((chat) => chat.uuid),
        expectedHiddenCounts: Object.fromEntries(result.hiddenCounts),
        expectedHiddenNames: Object.fromEntries(result.hiddenNames),
      };
    }),
    normalizeWord: ['  ことば  ', 'Ａｂｃ', ''].map((word) => ({
      word,
      expected: normalizeFilterWord(word),
    })),
  };
}

function authorKey() {
  const valid = 'A'.repeat(21) + '-_' + 'z9'.repeat(10);
  return {
    pattern: AUTHOR_KEY_PATTERN,
    byteLength: 32,
    encoding: 'base64url（パディングなし）',
    cases: [
      { key: valid, valid: true },
      { key: valid.slice(1), valid: false },
      { key: `${valid}=`, valid: false },
      { key: valid.replace('-', '+'), valid: false },
      { key: '', valid: false },
    ].map((c) => ({ ...c, valid: new RegExp(AUTHOR_KEY_PATTERN).test(c.key) })),
  };
}

/** save-chat の入力の判定（サーバーの schema.ts）。アプリの Fake の ChatApi と、エラーの文言の対応に使う */
function saveChatInputChecks() {
  const cases = [
    {
      name: '通る',
      input: { name: ' ゆい ', message: 'こんにちは', color: '#FF69B4', email: null },
    },
    {
      name: '名前が 25 文字',
      input: { name: 'あ'.repeat(25), message: 'x', color: '#000000', email: null },
    },
    {
      name: '予約名（空白入り）',
      input: { name: '管 理 人', message: 'x', color: '#000000', email: null },
    },
    {
      name: '空白だけの発言',
      input: { name: 'ゆい', message: '   ', color: '#000000', email: null },
    },
    {
      name: '121 文字の発言',
      input: { name: 'ゆい', message: 'あ'.repeat(121), color: '#000000', email: null },
    },
    {
      name: '読めない色は既定の色',
      input: { name: 'ゆい', message: 'x', color: 'あか', email: null },
    },
    {
      name: '長すぎるメール',
      input: { name: 'ゆい', message: 'x', color: 'red', email: 'a'.repeat(65) },
    },
  ];
  return {
    cases: cases.map(({ name, input }) => {
      const result = checkSayInput(input);
      return {
        name,
        input,
        expected: result.error ? { error: result.error } : { error: null, value: result.value },
      };
    }),
    metadata: [
      {
        version: 1,
        fontStyle: { fontSize: 3, fontColor: 'red', bold: true },
        avatar: 'hoshi1',
        optimisticNonce: 'n',
      },
      { version: 1, kind: 'admin', fontStyle: { fontSize: 9 }, avatar: 'none', extra: 1 },
      { version: 2 },
    ].map((input) => ({ input, expected: sanitizeMetadata(input) })),
  };
}

function adminMessages() {
  return {
    cases: [
      {
        event: 'enter' as const,
        name: 'ゆい',
        color: '#ff69b4',
        visitCount: 49,
        lastLogin: T0,
        nonce: 'n1',
      },
      { event: 'exit' as const, name: 'ほし', color: 'navy', nonce: 'n2' },
    ].map((input) => ({ input, expected: buildAdminChat(input) })),
    fortune: { userName: 'ゆい', index: 0, expected: buildFortuneChat('ゆい', 0) },
  };
}

/** contracts/ に書き出す全ファイル。fixtures の日時は FIXTURE_TIME_ZONE で作ること（呼び出し側が TZ を合わせる） */
export async function buildContracts(themeCss: string): Promise<ContractFiles> {
  const files: ContractFiles = {
    'rooms.json': rooms(),
    'directory.json': directory(),
    'home.json': home(),
    'theme.json': theme(themeCss),
    'chat-options.json': chatOptions(),
    'server-messages.json': serverMessages(),
    'ui-messages.json': UI_MESSAGES,
    'chat-texts.json': CHAT_TEXTS,
    'legal.json': {
      termsVersion: TERMS_VERSION,
      pages: Object.fromEntries(
        Object.entries(LEGAL_PAGE_PATHS).map(([key, path]) => [key, buildAbsoluteUrl(path)])
      ),
    },
    'fixtures/legacy-date-time.json': legacyDateTime(),
    'fixtures/admin-events.json': adminEvents(),
    'fixtures/participants.json': participants(),
    'fixtures/optimistic.json': optimistic(),
    'fixtures/room-log-merge.json': roomLogMerge(),
    'fixtures/room-log-events.json': await roomLogEvents(),
    'fixtures/normalize-chat.json': normalizeChatRows(),
    'fixtures/filters.json': filters(),
    'fixtures/url-segments.json': urlSegments(),
    'fixtures/name-checks.json': nameChecks(),
    'fixtures/filter-list.json': filterList(),
    'fixtures/author-key.json': authorKey(),
    'fixtures/save-chat/input-checks.json': saveChatInputChecks(),
    'fixtures/save-chat/server-messages.json': adminMessages(),
  };
  return {
    'manifest.json': {
      contractsVersion: CONTRACTS_VERSION,
      fixtureTimeZone: FIXTURE_TIME_ZONE,
      files: Object.keys(files).sort(),
    },
    ...files,
  };
}
