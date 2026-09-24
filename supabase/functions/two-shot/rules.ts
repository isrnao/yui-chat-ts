// two-shot（ツーショットチャット）の状態遷移の規則。
// spec: .kiro/specs/two-shot-chat/design.md §6
//
// Edge Function（Deno）とクライアント側のテスト（Vitest）の両方から読むため、import を持たない。
// 乱数・ハッシュ・時刻は呼び出し側（handler.ts）が Context で渡し、ここは副作用を持たない純粋な関数だけにする。
// 状態が変わらないときは受け取った RoomState と同じ参照を返す（handler が書き込みを省けるように）。

// ---------------------------------------------------------------------------
// 定数
// ---------------------------------------------------------------------------

export const ROOM_IDS = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10'] as const;
export type TwoShotRoomId = (typeof ROOM_IDS)[number];

/** ログに残す行数（原作の $max） */
export const MAX_LINES = 10;
/** ログの容量の上限。原作の $fuse（Shift_JIS のバイト数）に当たる互換用の概算（sjisSize / logSize） */
export const LOG_SIZE_LIMIT = 5000;
/** 無発言監視タイマ（原作の $limit） */
export const IDLE_SECONDS = 300;
const IDLE_MS = IDLE_SECONDS * 1000;
/** 入力の上限（コードポイント数）。原作の入室フォームの maxlength */
export const NAME_MAX = 30;
export const PROFILE_MAX = 60;
/** 入室試行（Session_Token の作成時刻）を新規に受け付ける期間と、許容する未来の時刻 */
export const ENTRY_WINDOW_MS = 600_000;
export const ENTRY_FUTURE_SKEW_MS = 60_000;
/** 入室記録（two_shot_admissions）の保持期間 */
export const ADMISSION_RETENTION_MS = 86_400_000;

export const SEX_VALUES = ['M', 'F', '-'] as const;
export type Sex = (typeof SEX_VALUES)[number];
/** 性別の表記（原作の $sex1 / $sex2 / $sex0）。表示と容量の計算で同じものを使う */
export const SEX_LABELS: Readonly<Record<Sex, string>> = { M: '男', F: '女', '-': '？' };

export const NOTICE_NAME = 'おしらせ';
export const OWNER_NOTICE_NAME = '管制者へおしらせ';
export const ANONYMOUS_NAME = '匿名';
export const ANONYMOUS_NAME_2 = '匿名2';

// ---------------------------------------------------------------------------
// 型
// ---------------------------------------------------------------------------

export type Seat = {
  /** 入室ごとの識別子。席が再利用されても同じ値にならない（自分の発言の判定に使う） */
  memberId: string;
  /** Session_Token 全体の SHA-256。生のトークンは保存しない */
  tokenHash: string;
  name: string;
  sex: Sex;
  profile: string;
  /** 信頼できるプロキシが確定した IP。得られなければ null（重複入室の判定をしない） */
  ip: string | null;
  ua: string;
};

/** お知らせ（research.md §5.2 の N1〜N10）。文言は表示するときに組み立てる */
export type Notice =
  | { code: 'N1' | 'N2' | 'N3'; params: { name: string; sex: Sex } }
  | { code: 'N4'; params: { name: string; profile: string } }
  | { code: 'N6'; params: { name: string } }
  | { code: 'N5' | 'N7' | 'N8' | 'N9' | 'N10'; params: Record<string, never> };
export type NoticeCode = Notice['code'];

export type MessageLine = {
  /** Unix ミリ秒 */
  at: number;
  kind: 'message';
  memberId: string;
  name: string;
  text: string;
};
export type NoticeLine = { at: number; kind: 'notice' } & Notice;
export type StoredLine = MessageLine | NoticeLine;

export type RoomState = {
  /** 最終発言（または入室）の時刻。Unix ミリ秒。null なら空室 */
  lastActivityAt: number | null;
  /** 0 = 管制者（Owner）、1 = 入室者（Guest）。JSON に undefined や配列の穴を持ち込まないよう null で埋める */
  seats: [Seat | null, Seat | null];
  /** 古い順 */
  lines: StoredLine[];
};

/** お知らせ画面（research.md §5.3）。E10 / E11 は再実装では出さない */
export type ErrorCode = 'E1' | 'E2' | 'E3' | 'E4' | 'E5' | 'E6' | 'E7' | 'E8' | 'E9' | 'E12';

export type EnterCommand = {
  op: 'enter';
  name: string;
  sex: Sex;
  profile: string;
  /** 「開設」ボタンで送った */
  make: boolean;
};
export type Command =
  | EnterCommand
  | { op: 'read' }
  | { op: 'say'; text: string }
  | { op: 'clear' }
  | { op: 'leave' }
  | { op: 'kick' }
  | { op: 'close' };

/** 入室試行の記録（two_shot_admissions の 1 行）。同じ試行の再送に同じ結果を返すために使う */
export type AdmissionRecord = {
  roomId: string;
  requestHash: string;
  memberId: string | null;
  result: 'accepted' | 'duplicate' | 'full';
};

export type Context = {
  roomId: string;
  /** Unix ミリ秒 */
  now: number;
  /** x-two-shot-token の SHA-256。ヘッダがなければ null */
  tokenHash: string | null;
  /** このトークンの入室記録（enter のときだけ handler が読む） */
  admission: AdmissionRecord | null;
  /** 正規化した入室要求の SHA-256（enter のときだけ） */
  requestHash: string | null;
  /** トークンに含まれる作成時刻（enter のときだけ） */
  entryCreatedAt: number | null;
  /** 新規入室に割り当てる Member_ID。同じ要求の CAS の再試行では同じ値を渡す */
  newMemberId: string;
  ip: string | null;
  ua: string;
};

export type Outcome =
  | { kind: 'room'; seat: 0 | 1 }
  | { kind: 'lobby' }
  | { kind: 'notice'; code: ErrorCode; placement: 'page' | 'pane' }
  /** 400 にする要求（トークンの転用、容量を超える発言など）。状態は変えない */
  | { kind: 'invalid-request'; reason: string };

/** 新しく保存する入室記録。再送や期限切れでは null */
export type NewAdmission =
  | { result: 'accepted'; memberId: string }
  | { result: 'duplicate' | 'full'; memberId: null };

export type Transition = {
  state: RoomState;
  outcome: Outcome;
  admission: NewAdmission | null;
  /** 保存された発言（Q4(b) の会話の控えを同じトランザクションで書くため） */
  said: { seat: 0 | 1; line: MessageLine } | null;
};

export type ViewLine =
  | { at: number; kind: 'message'; mine: boolean; name: string; text: string }
  | NoticeLine;

/** ログ画面に返す形。ほかの人の IP・UA・ハッシュ・Member_ID は含めない */
export type RoomView = {
  roomId: string;
  seat: 0 | 1;
  me: { name: string; sex: Sex };
  /** 新しい順 */
  lines: ViewLine[];
  /** 〔無発言監視タイマX秒経過〕の X */
  idleSeconds: number;
};

// ---------------------------------------------------------------------------
// 文言（research.md §5.2 / §5.3）
// ---------------------------------------------------------------------------

/** 性別だけを別にした文言の断片。表示側は性別を色付きにする */
export type NoticePart = string | { sex: Sex };

/**
 * お知らせの本文の断片。原作ではホスト名の HTML コメントが「さん」と「が」の間に入って空白が 2 つ続くが、
 * 表示では 1 つに詰まるので 1 つにする。句点は原作どおり半角の「.」。
 */
export function noticeParts(notice: Notice): NoticePart[] {
  switch (notice.code) {
    case 'N1':
      return [
        `${notice.params.name}(`,
        { sex: notice.params.sex },
        ')さん が管制者(ルームを開設した方)として入室しました.',
      ];
    case 'N2':
      return [
        `${notice.params.name}(`,
        { sex: notice.params.sex },
        ')さん が入室しましたので、このチャットルームをロックしました.',
      ];
    case 'N3':
      return [
        `${notice.params.name}(`,
        { sex: notice.params.sex },
        ')さん がは開設しようとしましたが、管制者がいる状態で入室しました（管制者と相談してください）.',
      ];
    case 'N4':
      return [`${notice.params.name}さんのプロフィール『 ${notice.params.profile} 』`];
    case 'N5':
      return [
        'チャット名が入力されていないか、使えない文字<>,;:が検知された等の理由で匿名扱いとなります.',
      ];
    case 'N6':
      return [`${notice.params.name}さんが退室しましたので待機中になります.`];
    case 'N7':
      return ['現在、退室させる相手はいません.'];
    case 'N8':
      return ['相手を退室させましたので待機中になります.'];
    case 'N9':
      return ['管制者(最初に入室した方)によって画面がクリアされました.'];
    case 'N10':
      return ['参加者の操作に不正な手順を検知しました.'];
  }
}

export function noticeBody(notice: Notice): string {
  return noticeParts(notice)
    .map((part) => (typeof part === 'string' ? part : SEX_LABELS[part.sex]))
    .join('');
}

/** ログの名前の欄。お知らせは「おしらせ」、N10 だけ「管制者へおしらせ」 */
export function noticeName(code: NoticeCode): string {
  return code === 'N10' ? OWNER_NOTICE_NAME : NOTICE_NAME;
}

/** ログ 1 行の名前と本文（容量の計算と、表示の文言で共有する） */
export function lineText(line: StoredLine): { name: string; body: string } {
  return line.kind === 'message'
    ? { name: line.name, body: line.text }
    : { name: noticeName(line.code), body: noticeBody(line) };
}

/**
 * お知らせ画面の見出しと本文。E2 は重複入室で部屋を消さないため拒否の文言にする（requirements.md D16）。
 * E12 は通信の失敗（D14）。それ以外は原作と同じ。
 */
export const ERROR_PAGES: Readonly<Record<ErrorCode, { title: string; lines: readonly string[] }>> =
  {
    E1: { title: 'エラー', lines: ['部屋を選択してください.'] },
    E2: {
      title: 'エラー',
      lines: ['重複入室を検知しましたので、入室できません.', '空室状況を確認してください.'],
    },
    E3: {
      title: '終了1',
      lines: [
        'あなたは現在の利用者であるという認証ができません.',
        'または、データが制限サイズを越えましたので閉鎖しました.',
      ],
    },
    E4: { title: '終了', lines: ['このチャットは終了しました.'] },
    E5: { title: '終了', lines: ['あなたは現在の利用者であるという認証ができません.'] },
    E6: { title: '終了', lines: ['既にこのチャットから退室しています.'] },
    E7: { title: '退室', lines: ['ご利用ありがとうございました.'] },
    E8: { title: '閉鎖', lines: ['ご利用ありがとうございました.'] },
    E9: { title: 'エラー', lines: ['あなたは現在の管理者であるという認証ができませんでした.'] },
    E12: { title: 'システムエラー', lines: ['通信に失敗しました.'] },
  };

// ---------------------------------------------------------------------------
// 容量と入力
// ---------------------------------------------------------------------------

/**
 * 互換用の概算バイト数。コードポイントごとに ASCII（U+0000〜U+007F）は 1、それ以外は 2 と数える。
 * 実際の Shift_JIS のエンコード長ではない（半角カナも絵文字も 2）。requirements.md D19。
 */
export function sjisSize(text: string): number {
  let size = 0;
  for (const char of text) {
    size += char.codePointAt(0)! <= 0x7f ? 1 : 2;
  }
  return size;
}

/**
 * ログ全体の概算バイト数。原作のログファイルの 1 行 `HH:MM\t名前\t本文\n` に合わせて、
 * 固定部分（時刻 5 + タブ 2 + 改行 1 = 8）と名前・本文を数える。装飾の HTML や JSON のキーは数えない。
 */
export function logSize(lines: readonly StoredLine[]): number {
  let size = 0;
  for (const line of lines) {
    const { name, body } = lineText(line);
    size += 8 + sjisSize(name) + sjisSize(body);
  }
  return size;
}

/** 原作と同じくタブを消し、改行は空白にする（1 行のログに収めるため） */
export function sanitizeText(text: string): string {
  return text.replace(/\t/g, '').replace(/\r\n?|\n/g, ' ');
}

export function truncateCodePoints(text: string, max: number): string {
  const chars = Array.from(text);
  return chars.length <= max ? text : chars.slice(0, max).join('');
}

/**
 * 入室の入力を正規化する（タブ・改行の除去 → コードポイント数で切り詰め）。
 * handler は入室要求のハッシュをこの結果から作るので、ここを変えると同じ試行の判定も変わる。
 */
export function normalizeEntry(cmd: EnterCommand): EnterCommand {
  return {
    op: 'enter',
    name: truncateCodePoints(sanitizeText(cmd.name), NAME_MAX),
    sex: cmd.sex,
    profile: truncateCodePoints(sanitizeText(cmd.profile), PROFILE_MAX),
    make: cmd.make,
  };
}

/**
 * research.md §5.1 の匿名化。空、または `,` `;` `:` `<` `>` を含む名前は「匿名」。
 * 管制者がいるときは「匿名」を「匿名2」に、管制者と同じ名前を「匿名」にする。
 */
export function anonymizeName(
  name: string,
  owner: Seat | null
): { name: string; anonymized: boolean } {
  let result = name;
  let anonymized = false;
  if (result === '' || /[,;:<>]/.test(result)) {
    result = ANONYMOUS_NAME;
    anonymized = true;
  }
  if (owner !== null) {
    if (result === ANONYMOUS_NAME) {
      result = ANONYMOUS_NAME_2;
      anonymized = true;
    } else if (result === owner.name) {
      result = ANONYMOUS_NAME;
      anonymized = true;
    }
  }
  return { name: result, anonymized };
}

// ---------------------------------------------------------------------------
// 状態遷移
// ---------------------------------------------------------------------------

export function emptyRoomState(): RoomState {
  return { lastActivityAt: null, seats: [null, null], lines: [] };
}

export function isRoomId(value: unknown): value is TwoShotRoomId {
  return typeof value === 'string' && (ROOM_IDS as readonly string[]).includes(value);
}

export function isSex(value: unknown): value is Sex {
  return typeof value === 'string' && (SEX_VALUES as readonly string[]).includes(value);
}

/**
 * 時間切れ（最後の発言から 300 秒以上）と容量超過の部屋を空室に戻す。認証なしで部屋が変わるのはここだけ。
 * 何も変えないときは同じ参照を返す。
 */
export function normalizeRoom(state: RoomState, now: number): RoomState {
  if (state.lastActivityAt === null) {
    // 空室のはずの状態に席やログが残っていたら（壊れたデータ）空室に揃える
    const isEmpty = state.seats[0] === null && state.seats[1] === null && state.lines.length === 0;
    return isEmpty ? state : emptyRoomState();
  }
  if (now - state.lastActivityAt >= IDLE_MS || logSize(state.lines) > LOG_SIZE_LIMIT) {
    return emptyRoomState();
  }
  return state;
}

export function applyCommand(state: RoomState, cmd: Command, ctx: Context): Transition {
  const normalized = normalizeRoom(state, ctx.now);
  if (cmd.op === 'enter') return enter(state, normalized, cmd, ctx);
  // 閉鎖の処理の中で時間切れを判定した場合だけ、原作は「閉鎖」の画面を出す（design.md §6 の例外）
  const closedNow = normalized !== state && state.lastActivityAt !== null;
  return operate(normalized, closedNow, cmd, ctx);
}

function enter(original: RoomState, s: RoomState, cmd: EnterCommand, ctx: Context): Transition {
  if (ctx.tokenHash === null || ctx.requestHash === null || ctx.entryCreatedAt === null) {
    return invalid(original, 'entry token is required');
  }

  // 1. 同じ試行の再送。新規入室や重複入室の判定より先に、記録した結果を返す
  const admission = ctx.admission;
  if (admission !== null) {
    if (admission.roomId !== ctx.roomId || admission.requestHash !== ctx.requestHash) {
      return invalid(original, 'entry token was used for another request');
    }
    switch (admission.result) {
      case 'accepted': {
        const seat = findSeat(
          s,
          (x) => x.memberId === admission.memberId && x.tokenHash === ctx.tokenHash
        );
        // 退室・相手を退室・閉鎖・時間切れで席がなくなっていたら、元の入室をやり直さない
        return seat === null ? done(s, pageNotice('E4')) : done(s, { kind: 'room', seat });
      }
      case 'duplicate':
        return done(s, pageNotice('E2'));
      case 'full':
        return done(s, { kind: 'lobby' });
    }
  }

  // 入室記録が消えた後（24 時間後）も、席に残っているトークンなら同じ入室として扱う
  const existing = findSeat(s, (x) => x.tokenHash === ctx.tokenHash);
  if (existing !== null) return done(s, { kind: 'room', seat: existing });

  // 2. 新規の試行は作成から 10 分まで（未来は 60 秒まで）
  if (
    ctx.now - ctx.entryCreatedAt > ENTRY_WINDOW_MS ||
    ctx.entryCreatedAt - ctx.now > ENTRY_FUTURE_SKEW_MS
  ) {
    return done(s, pageNotice('E4'));
  }

  // 3. 新規入室
  const entry = normalizeEntry(cmd);
  const [owner, guest] = s.seats;
  if (owner !== null && guest !== null) {
    return done(s, { kind: 'lobby' }, { result: 'full', memberId: null });
  }

  if (owner !== null) {
    // 重複入室（D16）: 部屋は消さずに入室だけを拒否する。信頼できる IP がなければ一致としない
    if (owner.ip !== null && ctx.ip !== null && owner.ip === ctx.ip && owner.ua === ctx.ua) {
      return done(s, pageNotice('E2'), { result: 'duplicate', memberId: null });
    }
    const { name, anonymized } = anonymizeName(entry.name, owner);
    const seat = newSeat(ctx, entry, name);
    // 新しい Guest に前の会話を渡さない（D18）
    const lines = entryNotices(entry.make ? 'N3' : 'N2', seat, anonymized, ctx.now);
    return done(
      { lastActivityAt: ctx.now, seats: [owner, seat], lines },
      { kind: 'room', seat: 1 },
      { result: 'accepted', memberId: seat.memberId }
    );
  }

  // 空室: 前の会話を残さずに作り直し、開設でも入室でも管制者になる
  const { name, anonymized } = anonymizeName(entry.name, null);
  const seat = newSeat(ctx, entry, name);
  const lines = entryNotices('N1', seat, anonymized, ctx.now);
  return done(
    { lastActivityAt: ctx.now, seats: [seat, null], lines },
    { kind: 'room', seat: 0 },
    { result: 'accepted', memberId: seat.memberId }
  );
}

type OperateCommand = Exclude<Command, EnterCommand>;

function operate(s: RoomState, closedNow: boolean, cmd: OperateCommand, ctx: Context): Transition {
  if (cmd.op === 'close' && closedNow) return done(s, paneNotice('E8'));

  if (ctx.tokenHash === null) {
    // 原作は退室・相手を退室（bye / bye2）と閉鎖で認証の文言が違う
    return done(s, paneNotice(cmd.op === 'close' ? 'E9' : isByeOp(cmd.op) ? 'E5' : 'E3'));
  }
  const tokenHash = ctx.tokenHash;
  const seat = findSeat(s, (x) => x.tokenHash === tokenHash);
  if (seat === null) {
    return done(s, paneNotice(cmd.op === 'close' ? 'E9' : isByeOp(cmd.op) ? 'E6' : 'E4'));
  }
  const me = s.seats[seat]!;

  switch (cmd.op) {
    case 'read':
      return done(s, { kind: 'room', seat });

    case 'say': {
      const text = sanitizeText(cmd.text);
      // 空の発言は書かずに更新と同じ扱い（原作も Value が空なら書かない）
      if (text === '') return done(s, { kind: 'room', seat });
      if (sjisSize(text) > LOG_SIZE_LIMIT) return invalid(s, 'message is too long');
      const line: MessageLine = {
        at: ctx.now,
        kind: 'message',
        memberId: me.memberId,
        name: me.name,
        text,
      };
      return {
        state: { ...s, lastActivityAt: ctx.now, lines: appendLines(s.lines, line) },
        outcome: { kind: 'room', seat },
        admission: null,
        said: { seat, line },
      };
    }

    case 'clear':
      if (seat !== 0) return done(s, paneNotice('E4'));
      return done(
        { ...s, lines: [notice(ctx.now, { code: 'N9', params: {} })] },
        {
          kind: 'room',
          seat,
        }
      );

    case 'kick': {
      if (seat !== 0) return done(s, paneNotice('E4'));
      if (s.seats[1] === null) {
        return done(
          { ...s, lines: appendLines(s.lines, notice(ctx.now, { code: 'N7', params: {} })) },
          {
            kind: 'room',
            seat,
          }
        );
      }
      return done(
        {
          ...s,
          seats: [s.seats[0], null],
          lines: appendLines(s.lines, notice(ctx.now, { code: 'N8', params: {} })),
        },
        { kind: 'room', seat }
      );
    }

    case 'leave':
      // 管制者には退室の操作がない（抜けるときは閉鎖）
      if (seat !== 1) return done(s, paneNotice('E6'));
      return done(
        {
          ...s,
          seats: [s.seats[0], null],
          lines: appendLines(s.lines, notice(ctx.now, { code: 'N6', params: { name: me.name } })),
        },
        paneNotice('E7')
      );

    case 'close':
      if (seat === 0) return done(emptyRoomState(), paneNotice('E8'));
      // 入室者の閉鎖は部屋を閉じず、管制者に知らせる（D11: 認証できた入室者のときだけ書く）
      return done(
        { ...s, lines: appendLines(s.lines, notice(ctx.now, { code: 'N10', params: {} })) },
        paneNotice('E9')
      );
  }
}

/** ログ画面に返す形にする。ほかの人の IP・UA・ハッシュ・Member_ID は含めない */
export function toRoomView(roomId: string, state: RoomState, seat: 0 | 1, now: number): RoomView {
  const me = state.seats[seat];
  if (me === null) throw new Error(`seat ${seat} is empty`);
  const lines: ViewLine[] = [];
  for (let i = state.lines.length - 1; i >= 0; i--) {
    const line = state.lines[i];
    lines.push(
      line.kind === 'message'
        ? {
            at: line.at,
            kind: 'message',
            mine: line.memberId === me.memberId,
            name: line.name,
            text: line.text,
          }
        : line
    );
  }
  const idleSeconds =
    state.lastActivityAt === null
      ? 0
      : Math.max(0, Math.floor((now - state.lastActivityAt) / 1000));
  return { roomId, seat, me: { name: me.name, sex: me.sex }, lines, idleSeconds };
}

// ---------------------------------------------------------------------------
// DB の JSON の検証
// ---------------------------------------------------------------------------

/**
 * two_shot_rooms.state の JSON を検証する。形が違えば null（handler は 500 にする）。
 * 初期値の `seats: []`（古い既定値）は `[null, null]` に揃える。
 */
export function parseRoomState(value: unknown): RoomState | null {
  if (!isObject(value)) return null;
  const { lastActivityAt, seats, lines } = value;
  if (!(lastActivityAt === null || isFiniteNumber(lastActivityAt))) return null;
  if (!Array.isArray(seats) || seats.length > 2 || !Array.isArray(lines)) return null;
  const parsedSeats: [Seat | null, Seat | null] = [null, null];
  for (let i = 0; i < seats.length; i++) {
    const seat: unknown = seats[i];
    if (seat === null) continue;
    if (!isSeat(seat)) return null;
    parsedSeats[i] = seat;
  }
  if (!lines.every(isStoredLine)) return null;
  return { lastActivityAt, seats: parsedSeats, lines: lines as StoredLine[] };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isSeat(value: unknown): value is Seat {
  return (
    isObject(value) &&
    typeof value.memberId === 'string' &&
    typeof value.tokenHash === 'string' &&
    typeof value.name === 'string' &&
    isSex(value.sex) &&
    typeof value.profile === 'string' &&
    (value.ip === null || typeof value.ip === 'string') &&
    typeof value.ua === 'string'
  );
}

function isStoredLine(value: unknown): value is StoredLine {
  if (!isObject(value) || !isFiniteNumber(value.at)) return false;
  if (value.kind === 'message') {
    return (
      typeof value.memberId === 'string' &&
      typeof value.name === 'string' &&
      typeof value.text === 'string'
    );
  }
  if (value.kind !== 'notice' || !isObject(value.params)) return false;
  const params = value.params;
  switch (value.code) {
    case 'N1':
    case 'N2':
    case 'N3':
      return typeof params.name === 'string' && isSex(params.sex);
    case 'N4':
      return typeof params.name === 'string' && typeof params.profile === 'string';
    case 'N6':
      return typeof params.name === 'string';
    case 'N5':
    case 'N7':
    case 'N8':
    case 'N9':
    case 'N10':
      return true;
    default:
      return false;
  }
}

// ---------------------------------------------------------------------------
// 内部の小さな関数
// ---------------------------------------------------------------------------

function isByeOp(op: OperateCommand['op']): boolean {
  return op === 'leave' || op === 'kick';
}

function findSeat(state: RoomState, match: (seat: Seat) => boolean): 0 | 1 | null {
  if (state.seats[0] !== null && match(state.seats[0])) return 0;
  if (state.seats[1] !== null && match(state.seats[1])) return 1;
  return null;
}

function newSeat(ctx: Context, entry: EnterCommand, name: string): Seat {
  return {
    memberId: ctx.newMemberId,
    tokenHash: ctx.tokenHash!,
    name,
    sex: entry.sex,
    profile: entry.profile,
    ip: ctx.ip,
    ua: ctx.ua,
  };
}

/** 入室のお知らせ。書く順は N1〜N3 → N4 → N5（画面は新しい順なので N5 が一番上） */
function entryNotices(
  code: 'N1' | 'N2' | 'N3',
  seat: Seat,
  anonymized: boolean,
  at: number
): StoredLine[] {
  const lines: StoredLine[] = [notice(at, { code, params: { name: seat.name, sex: seat.sex } })];
  if (seat.profile !== '') {
    lines.push(notice(at, { code: 'N4', params: { name: seat.name, profile: seat.profile } }));
  }
  if (anonymized) lines.push(notice(at, { code: 'N5', params: {} }));
  return lines;
}

function notice(at: number, value: Notice): NoticeLine {
  return { at, kind: 'notice', ...value };
}

function appendLines(lines: readonly StoredLine[], ...added: StoredLine[]): StoredLine[] {
  return [...lines, ...added].slice(-MAX_LINES);
}

function pageNotice(code: ErrorCode): Outcome {
  return { kind: 'notice', code, placement: 'page' };
}

function paneNotice(code: ErrorCode): Outcome {
  return { kind: 'notice', code, placement: 'pane' };
}

function done(
  state: RoomState,
  outcome: Outcome,
  admission: NewAdmission | null = null
): Transition {
  return { state, outcome, admission, said: null };
}

function invalid(state: RoomState, reason: string): Transition {
  return done(state, { kind: 'invalid-request', reason });
}
