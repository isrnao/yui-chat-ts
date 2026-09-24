import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
// サーバー（Edge Function）の規則を直接テストする。Deno のテストは既存の CI で走らないため、
// import を持たない rules.ts をここから読む（design.md §2）。
import {
  ADMISSION_RETENTION_MS,
  ENTRY_FUTURE_SKEW_MS,
  ENTRY_WINDOW_MS,
  ERROR_PAGES,
  IDLE_SECONDS,
  LOG_SIZE_LIMIT,
  MAX_LINES,
  NAME_MAX,
  PROFILE_MAX,
  ROOM_IDS,
  anonymizeName,
  applyCommand,
  emptyRoomState,
  isRoomId,
  lineText,
  logSize,
  noticeBody,
  noticeName,
  normalizeEntry,
  normalizeRoom,
  parseRoomState,
  sjisSize,
  toRoomView,
  type AdmissionRecord,
  type Command,
  type Context,
  type EnterCommand,
  type ErrorCode,
  type RoomState,
  type Sex,
  type Transition,
} from '../../../supabase/functions/two-shot/rules.ts';

const T0 = Date.UTC(2026, 8, 24, 3, 0, 0);
const IDLE_MS = IDLE_SECONDS * 1000;

function baseCtx(overrides: Partial<Context> = {}): Context {
  return {
    roomId: '01',
    now: T0,
    tokenHash: null,
    admission: null,
    requestHash: null,
    entryCreatedAt: null,
    newMemberId: 'm-unused',
    ip: '203.0.113.1',
    ua: 'UA-A',
    ...overrides,
  };
}

/** 入室試行の文脈。token ごとにハッシュ・要求ハッシュ・Member_ID を決める */
function enterCtx(token: string, overrides: Partial<Context> = {}): Context {
  const now = overrides.now ?? T0;
  return baseCtx({
    tokenHash: `h:${token}`,
    requestHash: `r:${token}`,
    entryCreatedAt: now,
    newMemberId: `m:${token}`,
    ...overrides,
  });
}

function asCtx(token: string | null, overrides: Partial<Context> = {}): Context {
  return baseCtx({ tokenHash: token === null ? null : `h:${token}`, ...overrides });
}

function enterCmd(
  name: string,
  opts: { sex?: Sex; profile?: string; make?: boolean } = {}
): EnterCommand {
  return {
    op: 'enter',
    name,
    sex: opts.sex ?? 'M',
    profile: opts.profile ?? '',
    make: opts.make ?? false,
  };
}

/** 画面の文言で並べたログ（古い順） */
function texts(state: RoomState): string[] {
  return state.lines.map((line) => {
    const { name, body } = lineText(line);
    return `${name} > ${body}`;
  });
}

/** 管制者 alice（トークン A）だけがいる部屋 */
function withOwner(profile = ''): RoomState {
  return applyCommand(emptyRoomState(), enterCmd('alice', { profile }), enterCtx('A')).state;
}

/** alice（A、管制者）と bob（B、入室者。別の IP）がいる満室の部屋 */
function withGuest(): RoomState {
  return applyCommand(
    withOwner(),
    enterCmd('bob', { sex: 'F' }),
    enterCtx('B', { now: T0 + 1000, ip: '198.51.100.2', ua: 'UA-B' })
  ).state;
}

function last<T>(items: readonly T[]): T | undefined {
  return items[items.length - 1];
}

function noticeOf(t: Transition): { code: ErrorCode; placement: string } | null {
  return t.outcome.kind === 'notice'
    ? { code: t.outcome.code, placement: t.outcome.placement }
    : null;
}

describe('お知らせの文言', () => {
  it('N1〜N10 が原作の文言になる（空白は 1 つに詰める）', () => {
    const cases: [Parameters<typeof noticeBody>[0], string][] = [
      [
        { code: 'N1', params: { name: 'alice', sex: 'M' } },
        'alice(男)さん が管制者(ルームを開設した方)として入室しました.',
      ],
      [
        { code: 'N2', params: { name: 'bob', sex: 'F' } },
        'bob(女)さん が入室しましたので、このチャットルームをロックしました.',
      ],
      [
        { code: 'N3', params: { name: '匿名', sex: '-' } },
        '匿名(？)さん がは開設しようとしましたが、管制者がいる状態で入室しました（管制者と相談してください）.',
      ],
      [
        { code: 'N4', params: { name: 'alice', profile: 'hello' } },
        'aliceさんのプロフィール『 hello 』',
      ],
      [
        { code: 'N5', params: {} },
        'チャット名が入力されていないか、使えない文字<>,;:が検知された等の理由で匿名扱いとなります.',
      ],
      [{ code: 'N6', params: { name: 'bob' } }, 'bobさんが退室しましたので待機中になります.'],
      [{ code: 'N7', params: {} }, '現在、退室させる相手はいません.'],
      [{ code: 'N8', params: {} }, '相手を退室させましたので待機中になります.'],
      [{ code: 'N9', params: {} }, '管制者(最初に入室した方)によって画面がクリアされました.'],
      [{ code: 'N10', params: {} }, '参加者の操作に不正な手順を検知しました.'],
    ];
    for (const [notice, expected] of cases) {
      expect(noticeBody(notice)).toBe(expected);
    }
  });

  it('名前の欄は「おしらせ」、N10 だけ「管制者へおしらせ」', () => {
    expect(noticeName('N1')).toBe('おしらせ');
    expect(noticeName('N9')).toBe('おしらせ');
    expect(noticeName('N10')).toBe('管制者へおしらせ');
  });

  it('お知らせ画面は原作の文言で、E2 と E12 だけ再実装の文言になる', () => {
    expect(ERROR_PAGES.E1).toEqual({ title: 'エラー', lines: ['部屋を選択してください.'] });
    expect(ERROR_PAGES.E2).toEqual({
      title: 'エラー',
      lines: ['重複入室を検知しましたので、入室できません.', '空室状況を確認してください.'],
    });
    expect(ERROR_PAGES.E3).toEqual({
      title: '終了1',
      lines: [
        'あなたは現在の利用者であるという認証ができません.',
        'または、データが制限サイズを越えましたので閉鎖しました.',
      ],
    });
    expect(ERROR_PAGES.E4).toEqual({ title: '終了', lines: ['このチャットは終了しました.'] });
    expect(ERROR_PAGES.E5).toEqual({
      title: '終了',
      lines: ['あなたは現在の利用者であるという認証ができません.'],
    });
    expect(ERROR_PAGES.E6).toEqual({
      title: '終了',
      lines: ['既にこのチャットから退室しています.'],
    });
    expect(ERROR_PAGES.E7).toEqual({ title: '退室', lines: ['ご利用ありがとうございました.'] });
    expect(ERROR_PAGES.E8).toEqual({ title: '閉鎖', lines: ['ご利用ありがとうございました.'] });
    expect(ERROR_PAGES.E9).toEqual({
      title: 'エラー',
      lines: ['あなたは現在の管理者であるという認証ができませんでした.'],
    });
    expect(ERROR_PAGES.E12).toEqual({ title: 'システムエラー', lines: ['通信に失敗しました.'] });
  });
});

describe('容量と入力の正規化', () => {
  it('ASCII は 1、それ以外はコードポイントごとに 2 と数える', () => {
    expect(sjisSize('abc')).toBe(3);
    expect(sjisSize('あいう')).toBe(6);
    expect(sjisSize('ｱ')).toBe(2); // 半角カナも 2（実際の Shift_JIS 長ではない）
    expect(sjisSize('😀')).toBe(2); // サロゲートペアは 1 コードポイント
    expect(sjisSize('a😀あ')).toBe(5);
    expect(sjisSize('')).toBe(0);
  });

  it('ログの容量は 1 行あたり「時刻・タブ 2 つ・改行」の 8 と名前・本文を数える', () => {
    const state = withOwner();
    const said = applyCommand(state, { op: 'say', text: 'bc' }, asCtx('A', { now: T0 + 1 })).state;
    expect(logSize(said.lines) - logSize(state.lines)).toBe(8 + sjisSize('alice') + 2);
    const n1 = lineText(state.lines[0]);
    expect(logSize(state.lines)).toBe(8 + sjisSize(n1.name) + sjisSize(n1.body));
  });

  it('入室の入力はタブを消して改行を空白にし、コードポイント数で切り詰める', () => {
    const long = '😀'.repeat(NAME_MAX + 5);
    const normalized = normalizeEntry(
      enterCmd(`${long}`, { profile: `a\tb\r\nc${'x'.repeat(PROFILE_MAX)}` })
    );
    expect(Array.from(normalized.name)).toHaveLength(NAME_MAX);
    expect(normalized.profile.startsWith('ab c')).toBe(true);
    expect(Array.from(normalized.profile)).toHaveLength(PROFILE_MAX);
  });

  it('匿名化: 空や , ; : < > を含む名前は匿名、管制者がいれば匿名2 や匿名にする', () => {
    const owner = withOwner().seats[0]!;
    expect(anonymizeName('', null)).toEqual({ name: '匿名', anonymized: true });
    expect(anonymizeName('a,b', null)).toEqual({ name: '匿名', anonymized: true });
    expect(anonymizeName('<b>', null)).toEqual({ name: '匿名', anonymized: true });
    expect(anonymizeName('a&b', null)).toEqual({ name: 'a&b', anonymized: false });
    expect(anonymizeName('匿名', null)).toEqual({ name: '匿名', anonymized: false });
    expect(anonymizeName('', owner)).toEqual({ name: '匿名2', anonymized: true });
    expect(anonymizeName('匿名', owner)).toEqual({ name: '匿名2', anonymized: true });
    expect(anonymizeName('alice', owner)).toEqual({ name: '匿名', anonymized: true });
    expect(anonymizeName('bob', owner)).toEqual({ name: 'bob', anonymized: false });
  });
});

describe('入室', () => {
  it('空室に入ると管制者になり、N1 → N4 → N5 の順に書く', () => {
    const t = applyCommand(emptyRoomState(), enterCmd('', { profile: 'よろしく' }), enterCtx('A'));
    expect(t.outcome).toEqual({ kind: 'room', seat: 0 });
    expect(t.admission).toEqual({ result: 'accepted', memberId: 'm:A' });
    expect(t.state.lastActivityAt).toBe(T0);
    expect(t.state.seats[0]).toMatchObject({ name: '匿名', memberId: 'm:A', tokenHash: 'h:A' });
    expect(texts(t.state)).toEqual([
      'おしらせ > 匿名(男)さん が管制者(ルームを開設した方)として入室しました.',
      'おしらせ > 匿名さんのプロフィール『 よろしく 』',
      'おしらせ > チャット名が入力されていないか、使えない文字<>,;:が検知された等の理由で匿名扱いとなります.',
    ]);
  });

  it('空室なら開設でも入室と同じく N1 になり、前の会話は残らない', () => {
    const stale: RoomState = {
      lastActivityAt: T0 - IDLE_MS,
      seats: [withOwner().seats[0], null],
      lines: withOwner().lines,
    };
    const t = applyCommand(stale, enterCmd('carol', { make: true }), enterCtx('C'));
    expect(t.outcome).toEqual({ kind: 'room', seat: 0 });
    expect(texts(t.state)).toEqual([
      'おしらせ > carol(男)さん が管制者(ルームを開設した方)として入室しました.',
    ]);
  });

  it('待機中の部屋に入ると入室者になり N2 を書く。それまでのログは新しい入室者に渡さない', () => {
    const owner = applyCommand(withOwner(), { op: 'say', text: '前の会話' }, asCtx('A')).state;
    const t = applyCommand(
      owner,
      enterCmd('bob', { sex: 'F' }),
      enterCtx('B', { now: T0 + 5000, ip: '198.51.100.2' })
    );
    expect(t.outcome).toEqual({ kind: 'room', seat: 1 });
    expect(t.state.lastActivityAt).toBe(T0 + 5000);
    expect(t.state.seats[0]).toBe(owner.seats[0]);
    expect(texts(t.state)).toEqual([
      'おしらせ > bob(女)さん が入室しましたので、このチャットルームをロックしました.',
    ]);
  });

  it('管制者がいるときに開設すると、入室者として入って N3 を書く', () => {
    const t = applyCommand(
      withOwner(),
      enterCmd('alice', { sex: '-', make: true }),
      enterCtx('B', { ip: '198.51.100.2' })
    );
    expect(t.outcome).toEqual({ kind: 'room', seat: 1 });
    expect(texts(t.state)).toEqual([
      'おしらせ > 匿名(？)さん がは開設しようとしましたが、管制者がいる状態で入室しました（管制者と相談してください）.',
      'おしらせ > チャット名が入力されていないか、使えない文字<>,;:が検知された等の理由で匿名扱いとなります.',
    ]);
  });

  it('満室なら入口へ戻し、部屋は変えずに結果を記録する', () => {
    const full = withGuest();
    const t = applyCommand(full, enterCmd('carol'), enterCtx('C', { ip: '192.0.2.3' }));
    expect(t.outcome).toEqual({ kind: 'lobby' });
    expect(t.state).toBe(full);
    expect(t.admission).toEqual({ result: 'full', memberId: null });
  });

  it('管制者と同じ IP と UA の入室は、部屋を消さずに E2 で拒否する', () => {
    const owner = withOwner();
    const t = applyCommand(owner, enterCmd('bob'), enterCtx('B'));
    expect(noticeOf(t)).toEqual({ code: 'E2', placement: 'page' });
    expect(t.state).toBe(owner);
    expect(t.admission).toEqual({ result: 'duplicate', memberId: null });
  });

  it('信頼できる IP がない（null）ときは重複入室と判定しない', () => {
    const owner = applyCommand(
      emptyRoomState(),
      enterCmd('alice'),
      enterCtx('A', { ip: null })
    ).state;
    const t = applyCommand(owner, enterCmd('bob'), enterCtx('B', { ip: null }));
    expect(t.outcome).toEqual({ kind: 'room', seat: 1 });
  });

  it('名前とプロフィールは切り詰めてから匿名化する', () => {
    const t = applyCommand(
      emptyRoomState(),
      enterCmd('x'.repeat(40), { profile: 'p'.repeat(70) }),
      enterCtx('A')
    );
    expect(t.state.seats[0]!.name).toBe('x'.repeat(NAME_MAX));
    expect(t.state.seats[0]!.profile).toBe('p'.repeat(PROFILE_MAX));
  });

  it('入室にはトークンが必要', () => {
    const state = emptyRoomState();
    const t = applyCommand(state, enterCmd('alice'), baseCtx());
    expect(t.outcome.kind).toBe('invalid-request');
    expect(t.state).toBe(state);
  });

  describe('同じ試行の再送', () => {
    const accepted: AdmissionRecord = {
      roomId: '01',
      requestHash: 'r:B',
      memberId: 'm:B',
      result: 'accepted',
    };

    it('席が残っていれば同じ席を返し、お知らせも時刻も増やさない', () => {
      const full = withGuest();
      const t = applyCommand(
        full,
        enterCmd('bob', { sex: 'F' }),
        enterCtx('B', { now: T0 + 60_000, admission: accepted, newMemberId: 'm:other' })
      );
      expect(t.outcome).toEqual({ kind: 'room', seat: 1 });
      expect(t.state).toBe(full);
      expect(t.admission).toBeNull();
    });

    it('退室などで席がなくなっていたら E4 にし、入室をやり直さない', () => {
      const left = applyCommand(withGuest(), { op: 'leave' }, asCtx('B')).state;
      const t = applyCommand(left, enterCmd('bob'), enterCtx('B', { admission: accepted }));
      expect(noticeOf(t)).toEqual({ code: 'E4', placement: 'page' });
      expect(t.state).toBe(left);
    });

    it('時間切れで席がなくなっていたら E4 にし、空室に戻したことだけを保存する', () => {
      const full = withGuest();
      const t = applyCommand(
        full,
        enterCmd('bob'),
        enterCtx('B', { now: T0 + 1000 + IDLE_MS, admission: accepted })
      );
      expect(noticeOf(t)).toEqual({ code: 'E4', placement: 'page' });
      expect(t.state).toEqual(emptyRoomState());
      expect(t.admission).toBeNull();
    });

    it('重複・満室と記録された試行には同じ結果を返す', () => {
      const owner = withOwner();
      const dup = applyCommand(
        owner,
        enterCmd('bob'),
        enterCtx('B', { admission: { ...accepted, memberId: null, result: 'duplicate' } })
      );
      expect(noticeOf(dup)).toEqual({ code: 'E2', placement: 'page' });
      const full = applyCommand(
        owner,
        enterCmd('bob'),
        enterCtx('B', { admission: { ...accepted, memberId: null, result: 'full' } })
      );
      expect(full.outcome).toEqual({ kind: 'lobby' });
      expect(full.state).toBe(owner);
    });

    it('同じトークンを別の部屋や別の入力に使うと 400 にする', () => {
      const owner = withOwner();
      const otherRoom = applyCommand(
        owner,
        enterCmd('bob'),
        enterCtx('B', { roomId: '02', admission: accepted })
      );
      expect(otherRoom.outcome.kind).toBe('invalid-request');
      const otherInput = applyCommand(
        owner,
        enterCmd('bob'),
        enterCtx('B', { requestHash: 'r:changed', admission: accepted })
      );
      expect(otherInput.outcome.kind).toBe('invalid-request');
      expect(otherInput.state).toBe(owner);
    });

    it('入室記録が消えた後も、席に残っているトークンなら同じ席を返す', () => {
      const full = withGuest();
      const t = applyCommand(
        full,
        enterCmd('bob'),
        enterCtx('B', { now: T0 + 2000, entryCreatedAt: T0 - ADMISSION_RETENTION_MS })
      );
      expect(t.outcome).toEqual({ kind: 'room', seat: 1 });
      expect(t.state).toBe(full);
    });
  });

  it('新規の試行は作成から 10 分まで、未来は 60 秒まで受け付ける', () => {
    const at = (createdAt: number) =>
      applyCommand(
        emptyRoomState(),
        enterCmd('alice'),
        enterCtx('A', { entryCreatedAt: createdAt })
      ).outcome;
    expect(at(T0 - ENTRY_WINDOW_MS)).toEqual({ kind: 'room', seat: 0 });
    expect(at(T0 - ENTRY_WINDOW_MS - 1)).toEqual({ kind: 'notice', code: 'E4', placement: 'page' });
    expect(at(T0 + ENTRY_FUTURE_SKEW_MS)).toEqual({ kind: 'room', seat: 0 });
    expect(at(T0 + ENTRY_FUTURE_SKEW_MS + 1)).toEqual({
      kind: 'notice',
      code: 'E4',
      placement: 'page',
    });
  });
});

describe('入室後の操作と認証', () => {
  type Actor = 'none' | 'unknown' | 'guest' | 'owner';
  const token = { none: null, unknown: 'Z', guest: 'B', owner: 'A' } as const;
  const expected: Record<
    'read' | 'say' | 'clear' | 'kick' | 'leave' | 'close',
    Record<Actor, string>
  > = {
    read: { none: 'E3', unknown: 'E4', guest: 'room', owner: 'room' },
    say: { none: 'E3', unknown: 'E4', guest: 'room', owner: 'room' },
    clear: { none: 'E3', unknown: 'E4', guest: 'E4', owner: 'room' },
    kick: { none: 'E5', unknown: 'E6', guest: 'E4', owner: 'room' },
    leave: { none: 'E5', unknown: 'E6', guest: 'E7', owner: 'E6' },
    close: { none: 'E9', unknown: 'E9', guest: 'E9', owner: 'E8' },
  };

  it('design.md §6 の認証の表どおりの結果になり、お知らせは下ペインに出す', () => {
    for (const [op, row] of Object.entries(expected)) {
      for (const [actor, result] of Object.entries(row)) {
        const cmd = (op === 'say' ? { op, text: 'hi' } : { op }) as Command;
        const t = applyCommand(withGuest(), cmd, asCtx(token[actor as Actor]));
        const got = t.outcome.kind === 'notice' ? t.outcome.code : t.outcome.kind;
        expect(`${op}/${actor}:${got}`).toBe(`${op}/${actor}:${result}`);
        if (t.outcome.kind === 'notice') expect(t.outcome.placement).toBe('pane');
      }
    }
  });

  it('認証できない要求は、部屋を変えない（N10 も書かない）', () => {
    const full = withGuest();
    for (const op of ['read', 'clear', 'kick', 'leave', 'close'] as const) {
      for (const tok of [null, 'Z']) {
        expect(applyCommand(full, { op }, asCtx(tok)).state).toBe(full);
      }
    }
    expect(applyCommand(full, { op: 'say', text: 'x' }, asCtx('Z')).state).toBe(full);
  });

  it('発言は Member_ID と名前で書き、最終発言時刻を更新する', () => {
    const t = applyCommand(
      withGuest(),
      { op: 'say', text: 'a\tb' },
      asCtx('B', { now: T0 + 9000 })
    );
    expect(t.outcome).toEqual({ kind: 'room', seat: 1 });
    expect(t.state.lastActivityAt).toBe(T0 + 9000);
    expect(t.said).toEqual({
      seat: 1,
      line: { at: T0 + 9000, kind: 'message', memberId: 'm:B', name: 'bob', text: 'ab' },
    });
  });

  it('空の発言は更新と同じく何も書かない', () => {
    const full = withGuest();
    const t = applyCommand(full, { op: 'say', text: '' }, asCtx('A', { now: T0 + 9000 }));
    expect(t.state).toBe(full);
    expect(t.said).toBeNull();
  });

  it('更新は最終発言時刻を変えない', () => {
    const full = withGuest();
    expect(applyCommand(full, { op: 'read' }, asCtx('A', { now: T0 + 60_000 })).state).toBe(full);
  });

  it('1 回の発言は概算 5000 バイトまで', () => {
    const full = withGuest();
    const ok = applyCommand(full, { op: 'say', text: 'a'.repeat(LOG_SIZE_LIMIT) }, asCtx('A'));
    expect(ok.outcome).toEqual({ kind: 'room', seat: 0 });
    const tooLong = applyCommand(full, { op: 'say', text: 'あ'.repeat(2501) }, asCtx('A'));
    expect(tooLong.outcome.kind).toBe('invalid-request');
    expect(tooLong.state).toBe(full);
  });

  it('ログは最新の 10 行だけを残す', () => {
    let state = withGuest();
    for (let i = 1; i <= 12; i++) {
      state = applyCommand(state, { op: 'say', text: `m${i}` }, asCtx('A', { now: T0 + i })).state;
    }
    expect(state.lines).toHaveLength(MAX_LINES);
    expect(lineText(state.lines[0]).body).toBe('m3');
    expect(lineText(state.lines[MAX_LINES - 1]).body).toBe('m12');
  });

  it('画面クリアはログを N9 の 1 行だけにし、時刻は変えない', () => {
    const full = withGuest();
    const t = applyCommand(full, { op: 'clear' }, asCtx('A', { now: T0 + 5000 }));
    expect(texts(t.state)).toEqual([
      'おしらせ > 管制者(最初に入室した方)によって画面がクリアされました.',
    ]);
    expect(t.state.lastActivityAt).toBe(full.lastActivityAt);
  });

  it('相手を退室: 入室者がいれば席を空けて N8、いなければ N7', () => {
    const kicked = applyCommand(withGuest(), { op: 'kick' }, asCtx('A'));
    expect(kicked.state.seats[1]).toBeNull();
    expect(last(texts(kicked.state))).toBe('おしらせ > 相手を退室させましたので待機中になります.');
    const again = applyCommand(kicked.state, { op: 'kick' }, asCtx('A'));
    expect(again.outcome).toEqual({ kind: 'room', seat: 0 });
    expect(last(texts(again.state))).toBe('おしらせ > 現在、退室させる相手はいません.');
    // 退室させられた入室者の次の操作は「終了」
    expect(noticeOf(applyCommand(kicked.state, { op: 'read' }, asCtx('B')))).toEqual({
      code: 'E4',
      placement: 'pane',
    });
  });

  it('入室者の退室は N6 を書いて席（IP・UA も）を空け、E7 を出す', () => {
    const t = applyCommand(withGuest(), { op: 'leave' }, asCtx('B'));
    expect(noticeOf(t)).toEqual({ code: 'E7', placement: 'pane' });
    expect(t.state.seats[1]).toBeNull();
    expect(JSON.stringify(t.state)).not.toContain('198.51.100.2');
    expect(last(texts(t.state))).toBe('おしらせ > bobさんが退室しましたので待機中になります.');
    expect(noticeOf(applyCommand(t.state, { op: 'leave' }, asCtx('B')))).toEqual({
      code: 'E6',
      placement: 'pane',
    });
  });

  it('管制者の閉鎖は部屋を空室にして E8、入室者の閉鎖は N10 を書いて E9', () => {
    const closed = applyCommand(withGuest(), { op: 'close' }, asCtx('A'));
    expect(noticeOf(closed)).toEqual({ code: 'E8', placement: 'pane' });
    expect(closed.state).toEqual(emptyRoomState());

    const full = withGuest();
    const byGuest = applyCommand(full, { op: 'close' }, asCtx('B', { now: T0 + 3000 }));
    expect(noticeOf(byGuest)).toEqual({ code: 'E9', placement: 'pane' });
    expect(byGuest.state.seats).toEqual(full.seats);
    expect(byGuest.state.lastActivityAt).toBe(full.lastActivityAt);
    expect(last(texts(byGuest.state))).toBe(
      '管制者へおしらせ > 参加者の操作に不正な手順を検知しました.'
    );
  });
});

describe('無発言監視タイマとログの容量', () => {
  it('最後の発言から 299.999 秒ならそのまま、300 秒で空室に戻して E4', () => {
    const owner = withOwner();
    expect(applyCommand(owner, { op: 'read' }, asCtx('A', { now: T0 + IDLE_MS - 1 })).state).toBe(
      owner
    );
    const expired = applyCommand(owner, { op: 'read' }, asCtx('A', { now: T0 + IDLE_MS }));
    expect(noticeOf(expired)).toEqual({ code: 'E4', placement: 'pane' });
    expect(expired.state).toEqual(emptyRoomState());
  });

  it('時間切れは認証なしでも空室に戻す（この 2 つの正規化だけが例外）', () => {
    const expired = applyCommand(withOwner(), { op: 'read' }, asCtx(null, { now: T0 + IDLE_MS }));
    expect(noticeOf(expired)).toEqual({ code: 'E3', placement: 'pane' });
    expect(expired.state).toEqual(emptyRoomState());
  });

  it('閉鎖の要求で時間切れを検知したときは、トークンに関係なく E8', () => {
    for (const tok of [null, 'Z', 'A']) {
      const t = applyCommand(withOwner(), { op: 'close' }, asCtx(tok, { now: T0 + IDLE_MS }));
      expect(noticeOf(t)).toEqual({ code: 'E8', placement: 'pane' });
    }
    // すでに空室なら閉鎖は E9（原作は管理者の認証に失敗する）
    expect(noticeOf(applyCommand(emptyRoomState(), { op: 'close' }, asCtx('A')))).toEqual({
      code: 'E9',
      placement: 'pane',
    });
  });

  it('時間切れの部屋への新規入室は、空室として管制者になる', () => {
    const t = applyCommand(
      withGuest(),
      enterCmd('carol'),
      enterCtx('C', { now: T0 + 1000 + IDLE_MS })
    );
    expect(t.outcome).toEqual({ kind: 'room', seat: 0 });
    expect(t.state.seats[1]).toBeNull();
  });

  it('ログが 5000 ならそのまま、5001 になった次の操作で空室に戻す', () => {
    const owner = withOwner();
    const fill = (extra: number) => {
      const rest = LOG_SIZE_LIMIT - logSize(owner.lines) - (8 + sjisSize('alice')) + extra;
      return applyCommand(owner, { op: 'say', text: 'a'.repeat(rest) }, asCtx('A', { now: T0 + 1 }))
        .state;
    };
    const exact = fill(0);
    expect(logSize(exact.lines)).toBe(LOG_SIZE_LIMIT);
    expect(applyCommand(exact, { op: 'read' }, asCtx('A', { now: T0 + 2 })).state).toBe(exact);

    const over = fill(1);
    expect(logSize(over.lines)).toBe(LOG_SIZE_LIMIT + 1);
    const t = applyCommand(over, { op: 'read' }, asCtx('A', { now: T0 + 2 }));
    expect(noticeOf(t)).toEqual({ code: 'E4', placement: 'pane' });
    expect(t.state).toEqual(emptyRoomState());
  });

  it('空室のはずの状態に席やログが残っていたら空室に揃える', () => {
    const broken: RoomState = { lastActivityAt: null, seats: withOwner().seats, lines: [] };
    expect(normalizeRoom(broken, T0)).toEqual(emptyRoomState());
    const empty = emptyRoomState();
    expect(normalizeRoom(empty, T0)).toBe(empty);
  });
});

describe('ログ画面の形（toRoomView）', () => {
  it('新しい順に並べ、自分の発言を Member_ID で判定する', () => {
    let state = withGuest();
    state = applyCommand(state, { op: 'say', text: 'owner' }, asCtx('A', { now: T0 + 2000 })).state;
    state = applyCommand(state, { op: 'say', text: 'guest' }, asCtx('B', { now: T0 + 3000 })).state;
    const view = toRoomView('01', state, 1, T0 + 4500);
    expect(view.me).toEqual({ name: 'bob', sex: 'F' });
    expect(view.idleSeconds).toBe(1);
    expect(view.lines.map((l) => (l.kind === 'message' ? `${l.text}:${l.mine}` : l.code))).toEqual([
      'guest:true',
      'owner:false',
      'N2',
    ]);
  });

  it('同じ名前の新しい入室者に、前の入室者の発言を自分の発言として返さない', () => {
    let state = applyCommand(withGuest(), { op: 'say', text: 'old' }, asCtx('B')).state;
    state = applyCommand(state, { op: 'leave' }, asCtx('B')).state;
    state = applyCommand(state, { op: 'say', text: 'owner' }, asCtx('A', { now: T0 + 2000 })).state;
    state = applyCommand(
      state,
      enterCmd('bob', { sex: 'F' }),
      enterCtx('B2', { now: T0 + 3000, ip: '198.51.100.9' })
    ).state;
    const view = toRoomView('01', state, 1, T0 + 3000);
    expect(view.lines.some((l) => l.kind === 'message')).toBe(false);
  });

  it('IP・UA・トークンのハッシュ・Member_ID を含めない', () => {
    const state = applyCommand(withGuest(), { op: 'say', text: 'hi' }, asCtx('A')).state;
    for (const seat of [0, 1] as const) {
      const json = JSON.stringify(toRoomView('01', state, seat, T0));
      for (const secret of [
        '203.0.113.1',
        '198.51.100.2',
        'UA-A',
        'UA-B',
        'h:A',
        'h:B',
        'm:A',
        'm:B',
      ]) {
        expect(json).not.toContain(secret);
      }
    }
  });

  it('空いている席を指定すると例外にする', () => {
    expect(() => toRoomView('01', withOwner(), 1, T0)).toThrow();
  });
});

describe('DB の JSON の検証（parseRoomState）', () => {
  it('初期値と、古い既定値の seats: [] を受け付ける', () => {
    expect(parseRoomState({ lastActivityAt: null, seats: [null, null], lines: [] })).toEqual(
      emptyRoomState()
    );
    expect(parseRoomState({ lastActivityAt: null, seats: [], lines: [] })).toEqual(
      emptyRoomState()
    );
  });

  it('保存した状態を JSON 経由で読み戻せる（発言・N2・N4・N6）', () => {
    let state = applyCommand(
      withOwner(),
      enterCmd('bob', { sex: 'F', profile: 'よろしく' }),
      enterCtx('B', { now: T0 + 1000, ip: '198.51.100.2' })
    ).state;
    state = applyCommand(state, { op: 'say', text: 'hi' }, asCtx('A', { now: T0 + 2000 })).state;
    state = applyCommand(state, { op: 'leave' }, asCtx('B', { now: T0 + 3000 })).state;
    expect(state.lines.map((l) => (l.kind === 'notice' ? l.code : l.kind))).toEqual([
      'N2',
      'N4',
      'message',
      'N6',
    ]);
    expect(parseRoomState(JSON.parse(JSON.stringify(state)))).toEqual(state);
  });

  it('形の違うものは null にする', () => {
    expect(parseRoomState(null)).toBeNull();
    expect(parseRoomState({ lastActivityAt: 'x', seats: [], lines: [] })).toBeNull();
    expect(
      parseRoomState({ lastActivityAt: null, seats: [null, null, null], lines: [] })
    ).toBeNull();
    expect(
      parseRoomState({ lastActivityAt: 1, seats: [{ name: 'a' }, null], lines: [] })
    ).toBeNull();
    expect(
      parseRoomState({
        lastActivityAt: 1,
        seats: [],
        lines: [{ at: 1, kind: 'notice', code: 'N99', params: {} }],
      })
    ).toBeNull();
  });
});

it('部屋の ID は 01〜12 の 12 部屋（旧お気楽チャットと同じ）', () => {
  expect(ROOM_IDS).toEqual([
    '01',
    '02',
    '03',
    '04',
    '05',
    '06',
    '07',
    '08',
    '09',
    '10',
    '11',
    '12',
  ]);
  expect(isRoomId('12')).toBe(true);
  expect(isRoomId('13')).toBe(false);
  expect(isRoomId('2shot')).toBe(false);
  expect(isRoomId(1)).toBe(false);
});

// ---------------------------------------------------------------------------
// プロパティテスト（requirements.md Requirement 18.2）
// handler と同じく、入室記録を保存しながら任意の操作列を流し、不変条件を確かめる。
// ---------------------------------------------------------------------------

type Step = {
  actor: 'A' | 'B' | 'C' | null;
  /** enter のとき、新しい試行（新しいトークン）にするか */
  fresh: boolean;
  cmd: Command;
  advance: number;
  net: 'x' | 'y';
};

const stepArb: fc.Arbitrary<Step> = fc.record({
  actor: fc.constantFrom('A' as const, 'B' as const, 'C' as const, null),
  fresh: fc.boolean(),
  cmd: fc.oneof(
    fc.record({
      op: fc.constant('enter' as const),
      name: fc.constantFrom('', 'alice', 'bob', '匿名', 'a;b', '😀'.repeat(40)),
      sex: fc.constantFrom('M' as const, 'F' as const, '-' as const),
      profile: fc.constantFrom('', 'hi'),
      make: fc.boolean(),
    }),
    fc.constant({ op: 'read' as const }),
    fc.record({
      op: fc.constant('say' as const),
      // `:` と `-` を使わない（トークンのハッシュ `h:…` や UA `ua-…` と偶然一致しないように）
      text: fc.oneof(
        fc.string({ unit: fc.constantFrom('a', 'あ', ' ', '\t', '<', '😀'), maxLength: 12 }),
        fc.constant('あ'.repeat(1200))
      ),
    }),
    fc.constant({ op: 'clear' as const }),
    fc.constant({ op: 'kick' as const }),
    fc.constant({ op: 'leave' as const }),
    fc.constant({ op: 'close' as const })
  ),
  advance: fc.oneof(fc.integer({ min: 0, max: 5000 }), fc.integer({ min: 250_000, max: 400_000 })),
  net: fc.constantFrom('x' as const, 'y' as const),
});

/** handler の代わり。トークンの払い出しと入室記録の保存だけを真似る */
function simulate(
  steps: Step[],
  check: (before: RoomState, step: Step, ctx: Context, t: Transition) => void
) {
  let state = emptyRoomState();
  let now = T0;
  let serial = 0;
  const tokens = new Map<string, { token: string; createdAt: number; requestHash: string }>();
  const admissions = new Map<string, AdmissionRecord>();

  for (const step of steps) {
    now += step.advance;
    let ctx: Context;
    if (step.cmd.op === 'enter') {
      const actor = step.actor ?? 'A';
      const requestHash = JSON.stringify(normalizeEntry(step.cmd));
      let current = tokens.get(actor);
      if (step.fresh || current === undefined || current.requestHash !== requestHash) {
        current = { token: `${actor}${++serial}`, createdAt: now, requestHash };
        tokens.set(actor, current);
      }
      ctx = baseCtx({
        now,
        tokenHash: `h:${current.token}`,
        requestHash,
        entryCreatedAt: current.createdAt,
        admission: admissions.get(`h:${current.token}`) ?? null,
        newMemberId: `m:${current.token}`,
        ip: step.net,
        ua: `ua-${step.net}`,
      });
    } else {
      const current = step.actor === null ? undefined : tokens.get(step.actor);
      ctx = baseCtx({ now, tokenHash: current ? `h:${current.token}` : null });
    }
    const t = applyCommand(state, step.cmd, ctx);
    check(state, step, ctx, t);
    if (t.admission !== null && ctx.tokenHash !== null) {
      admissions.set(ctx.tokenHash, {
        roomId: ctx.roomId,
        requestHash: ctx.requestHash!,
        memberId: t.admission.memberId,
        result: t.admission.result,
      });
    }
    state = t.state;
  }
}

describe('不変条件（fast-check）', () => {
  it('席は 2 つまで、入室者がいれば管制者もいる、ログは 10 行以下、空室なら何も残らない', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), (steps) => {
        simulate(steps, (_before, _step, ctx, t) => {
          const { seats, lines, lastActivityAt } = t.state;
          expect(seats).toHaveLength(2);
          if (seats[1] !== null) expect(seats[0]).not.toBeNull();
          expect(lines.length).toBeLessThanOrEqual(MAX_LINES);
          expect(lastActivityAt === null).toBe(seats[0] === null);
          if (lastActivityAt === null) expect(lines).toEqual([]);
          if (seats[0] && seats[1]) {
            expect(seats[0].memberId).not.toBe(seats[1].memberId);
            expect(seats[0].tokenHash).not.toBe(seats[1].tokenHash);
          }
          // 返した画面の形には秘密の値が入らない
          if (t.outcome.kind === 'room') {
            const json = JSON.stringify(toRoomView(ctx.roomId, t.state, t.outcome.seat, ctx.now));
            for (const seat of seats) {
              if (seat === null) continue;
              expect(json).not.toContain(seat.tokenHash);
              expect(json).not.toContain(seat.memberId);
              expect(json).not.toContain(`"${seat.ua}"`);
            }
          }
        });
      }),
      { numRuns: 300 }
    );
  });

  it('認証できない操作と拒否した入室は、時間切れ・容量超過の正規化以外で部屋を変えない', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), (steps) => {
        simulate(steps, (before, step, ctx, t) => {
          const normalized = normalizeRoom(before, ctx.now);
          const seated = normalized.seats.some((s) => s !== null && s.tokenHash === ctx.tokenHash);
          if (step.cmd.op === 'enter') {
            const admitted = t.outcome.kind === 'room' && t.admission !== null;
            if (!admitted && t.outcome.kind !== 'invalid-request')
              expect(t.state).toEqual(normalized);
          } else if (!seated) {
            expect(t.state).toEqual(normalized);
          }
        });
      }),
      { numRuns: 300 }
    );
  });

  it('時間切れの部屋は、どの操作の後にも前の席を残さない', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), (steps) => {
        simulate(steps, (before, _step, ctx, t) => {
          if (before.lastActivityAt === null || ctx.now - before.lastActivityAt < IDLE_MS) return;
          const oldMembers = before.seats.flatMap((s) => (s ? [s.memberId] : []));
          for (const seat of t.state.seats) {
            if (seat !== null) expect(oldMembers).not.toContain(seat.memberId);
          }
        });
      }),
      { numRuns: 300 }
    );
  });

  it('同じ試行の再送は、席もログも時刻も増やさない', () => {
    fc.assert(
      fc.property(fc.array(stepArb, { maxLength: 40 }), (steps) => {
        simulate(steps, (before, step, ctx, t) => {
          if (step.cmd.op !== 'enter' || ctx.admission === null) return;
          if (t.outcome.kind === 'invalid-request') return;
          expect(t.admission).toBeNull();
          expect(t.state).toEqual(normalizeRoom(before, ctx.now));
        });
      }),
      { numRuns: 300 }
    );
  });
});
