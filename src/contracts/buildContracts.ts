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
import { chatDirectoryGroups } from '@features/top/data';
import { FONT_COLOR_CSS, FONT_SIZE_CSS, type Chat } from '@features/chat/types';
import {
  AVATAR_IDS,
  DEFAULT_COLOR,
  EMAIL_MAX,
  FONT_COLOR_NAMES,
  FONT_SIZES,
  MESSAGE_MAX,
  NAME_MAX,
  OPTIMISTIC_NONCE_MAX,
} from '@features/chat/inputRules';
import { INPUT_ERROR_MESSAGES } from '@features/chat/inputErrorMessages';
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
  FILTER_LIST_LIMIT,
  FILTER_NAMES_LIMIT,
  FILTER_WORD_MAX_LENGTH,
  normalizeFilterWord,
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
export function buildContracts(themeCss: string): ContractFiles {
  const files: ContractFiles = {
    'rooms.json': rooms(),
    'directory.json': directory(),
    'theme.json': theme(themeCss),
    'chat-options.json': chatOptions(),
    'server-messages.json': serverMessages(),
    'fixtures/legacy-date-time.json': legacyDateTime(),
    'fixtures/admin-events.json': adminEvents(),
    'fixtures/participants.json': participants(),
    'fixtures/optimistic.json': optimistic(),
    'fixtures/room-log-merge.json': roomLogMerge(),
    'fixtures/filters.json': filters(),
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
