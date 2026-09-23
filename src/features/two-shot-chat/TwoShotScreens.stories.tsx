import type { Meta, StoryObj } from '@storybook/react-vite';
import { useState } from 'react';
import { fn } from 'storybook/test';
import {
  applyCommand,
  emptyRoomState,
  toRoomView,
  type Command,
  type ErrorCode,
  type RoomState,
  type RoomView,
} from '../../../supabase/functions/two-shot/rules.ts';
import { getTwoShotRoomName, TWO_SHOT_CONFIG, type AutoSeconds } from './config';
import ChatForm from './components/ChatForm';
import ChatLog from './components/ChatLog';
import EntryForm, { type EntryValues } from './components/EntryForm';
import FrameLayout from './components/FrameLayout';
import NoticePage from './components/NoticePage';
import RoomList, { type LobbyState } from './components/RoomList';
import TwoShotScope from './components/Scope';

/**
 * 原作（Oracle）と見比べるための画面の組み合わせ（design.md「テスト戦略」の S1〜S11）。
 * ログは rules.ts の状態遷移で作るので、サーバーと同じ規則の中身になる。
 */

// 2026-09-24 06:12（日本時間）
const T0 = Date.UTC(2026, 8, 23, 21, 12, 0);

type Actor = { token: string; ip: string; ua: string };
const ALICE: Actor = { token: 'a', ip: '203.0.113.1', ua: 'UA-A' };
const HANAKO: Actor = { token: 'b', ip: '198.51.100.2', ua: 'UA-B' };

function run(steps: [Actor, Command][]): RoomState {
  let state = emptyRoomState();
  steps.forEach(([actor, cmd], index) => {
    state = applyCommand(state, cmd, {
      roomId: '01',
      now: T0 + index * 1000,
      tokenHash: `h:${actor.token}`,
      admission: null,
      requestHash: `r:${actor.token}`,
      entryCreatedAt: T0,
      newMemberId: `m:${actor.token}:${index}`,
      ip: actor.ip,
      ua: actor.ua,
    }).state;
  });
  return state;
}

const enter = (name: string, extra: Partial<Extract<Command, { op: 'enter' }>> = {}): Command => ({
  op: 'enter',
  name,
  sex: 'M',
  profile: '',
  make: false,
  ...extra,
});

function view(state: RoomState, seat: 0 | 1, idleSeconds = 0): RoomView {
  return { ...toRoomView('01', state, seat, T0), idleSeconds };
}

const ownerOnly = run([[ALICE, enter('', { profile: 'よろしく' })]]);
const withGuest = run([
  [ALICE, enter('alice')],
  [HANAKO, enter('はなこ', { sex: 'F' })],
]);
const makeConflict = run([
  [ALICE, enter('alice')],
  [HANAKO, enter('alice', { sex: '-', make: true })],
]);
const tenLines = run([
  [ALICE, enter('alice')],
  [HANAKO, enter('はなこ', { sex: 'F' })],
  ...Array.from({ length: 10 }, (_, i): [Actor, Command] => [
    i % 2 === 0 ? ALICE : HANAKO,
    { op: 'say', text: `${i + 1}番目の発言です <b>太字</b> &hearts;` },
  ]),
]);
const kicked = run([
  [ALICE, enter('alice')],
  [HANAKO, enter('はなこ', { sex: 'F' })],
  [ALICE, { op: 'say', text: 'こんにちは' }],
  [ALICE, { op: 'kick' }],
]);
const kickedTwice = run([
  [ALICE, enter('alice')],
  [HANAKO, enter('はなこ', { sex: 'F' })],
  [ALICE, { op: 'say', text: 'こんにちは' }],
  [ALICE, { op: 'kick' }],
  [ALICE, { op: 'kick' }],
]);
const cleared = run([
  [ALICE, enter('alice')],
  [HANAKO, enter('はなこ', { sex: 'F' })],
  [ALICE, { op: 'clear' }],
]);
const guestTriedClose = run([
  [ALICE, enter('alice')],
  [HANAKO, enter('はなこ', { sex: 'F' })],
  [HANAKO, { op: 'close' }],
]);

const allEmpty: LobbyState = {
  kind: 'loaded',
  rows: Object.fromEntries(
    TWO_SHOT_CONFIG.rooms.map((room) => [room.id, { status: 'empty' as const }])
  ),
};

const lobbyRows: LobbyState = {
  kind: 'loaded',
  rows: {
    '01': { status: 'waiting', sex: 'F', name: 'はなこ', profile: 'こんにちは、お話ししましょう' },
    '02': { status: 'full' },
    '03': { status: 'empty' },
    '04': { status: 'waiting', sex: '-', name: '匿名', profile: '' },
    ...Object.fromEntries(
      ['05', '06', '07', '08', '09', '10'].map((id) => [id, { status: 'empty' as const }])
    ),
  },
};

const EMPTY_ENTRY: EntryValues = { name: '', sex: '-', room: '', profile: '', save: true };

function Lobby({
  entry = EMPTY_ENTRY,
  lobby = allEmpty,
  auto = false,
}: {
  entry?: EntryValues;
  lobby?: LobbyState;
  auto?: boolean;
}) {
  const [values, setValues] = useState(entry);
  return (
    <FrameLayout
      initialTopPercent={TWO_SHOT_CONFIG.frames.lobby}
      topLabel="入室フォーム"
      bottomLabel="空室状況"
      top={
        <EntryForm
          values={values}
          onChange={(patch) => setValues((prev) => ({ ...prev, ...patch }))}
          action={fn()}
          focus={entry.name === '' ? 'name' : 'profile'}
        />
      }
      bottom={
        <RoomList
          lobby={lobby}
          auto={auto}
          onReload={fn()}
          onSetAuto={fn()}
          homeHref="/"
          reportHref="/chat/com_sb/"
        />
      }
    />
  );
}

function Room({
  seat,
  me,
  bottom,
  auto = 0,
}: {
  seat: 0 | 1;
  me: { name: string; sex: 'M' | 'F' | '-' };
  bottom: { log: RoomView } | { notice: ErrorCode };
  auto?: AutoSeconds;
}) {
  const [value, setValue] = useState('');
  return (
    <FrameLayout
      initialTopPercent={TWO_SHOT_CONFIG.frames.room}
      topLabel="入力画面"
      bottomLabel="ログ"
      top={
        <ChatForm
          roomName={getTwoShotRoomName('01')}
          me={me}
          seat={seat}
          value={value}
          onValueChange={setValue}
          auto={auto}
          onSay={fn()}
          onReload={fn()}
          onSetAuto={fn()}
          onClose={fn()}
          onKick={fn()}
          onLeave={fn()}
        />
      }
      bottom={
        'log' in bottom ? (
          <ChatLog view={bottom.log} auto={auto} onClear={fn()} />
        ) : (
          <NoticePage code={bottom.notice} onLobby={fn()} onBack={fn()} homeHref="/" />
        )
      }
    />
  );
}

function PageNotice({ code }: { code: ErrorCode }) {
  return (
    <TwoShotScope className="ts-page">
      <NoticePage code={code} onLobby={fn()} onBack={fn()} homeHref="/" />
    </TwoShotScope>
  );
}

const meta = {
  title: 'TwoShot/Screens',
  parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const ALICE_ME = { name: 'alice', sex: 'M' } as const;
const HANAKO_ME = { name: 'はなこ', sex: 'F' } as const;

export const S1_保存値なし: Story = { render: () => <Lobby /> };
export const S2_保存値あり: Story = {
  render: () => (
    <Lobby entry={{ name: 'はなこ', sex: 'F', room: '', profile: 'よろしくね', save: true }} />
  ),
};
export const S3_一覧: Story = { render: () => <Lobby lobby={lobbyRows} /> };
export const S4_一覧_自動更新: Story = { render: () => <Lobby lobby={lobbyRows} auto /> };
export const S3b_一覧_取得前: Story = { render: () => <Lobby lobby={{ kind: 'idle' }} /> };
export const S3c_一覧_取得失敗: Story = { render: () => <Lobby lobby={{ kind: 'error' }} /> };
export const S5_管制者の入室: Story = {
  render: () => (
    <Room seat={0} me={{ name: '匿名', sex: 'M' }} bottom={{ log: view(ownerOnly, 0) }} />
  ),
};
export const S6_入室者の入室: Story = {
  render: () => <Room seat={1} me={HANAKO_ME} bottom={{ log: view(withGuest, 1) }} />,
};
export const S7_開設の競合: Story = {
  render: () => (
    <Room seat={1} me={{ name: '匿名', sex: '-' }} bottom={{ log: view(makeConflict, 1) }} />
  ),
};
export const S8_10行_20秒自動: Story = {
  render: () => <Room seat={1} me={HANAKO_ME} auto={20} bottom={{ log: view(tenLines, 1, 12) }} />,
};
export const S9a_相手を退室: Story = {
  render: () => <Room seat={0} me={ALICE_ME} bottom={{ log: view(kicked, 0) }} />,
};
export const S9b_相手なし: Story = {
  render: () => <Room seat={0} me={ALICE_ME} bottom={{ log: view(kickedTwice, 0) }} />,
};
export const S9c_画面クリア: Story = {
  render: () => <Room seat={0} me={ALICE_ME} bottom={{ log: view(cleared, 0) }} />,
};
export const S9d_不正な閉鎖: Story = {
  render: () => <Room seat={0} me={ALICE_ME} bottom={{ log: view(guestTriedClose, 0) }} />,
};
export const S10a_退室: Story = {
  render: () => <Room seat={1} me={HANAKO_ME} bottom={{ notice: 'E7' }} />,
};
export const S10b_閉鎖: Story = {
  render: () => <Room seat={0} me={ALICE_ME} bottom={{ notice: 'E8' }} />,
};
export const S10c_終了: Story = {
  render: () => <Room seat={1} me={HANAKO_ME} bottom={{ notice: 'E4' }} />,
};
export const S11a_部屋を選ばずに入室: Story = { render: () => <PageNotice code="E1" /> };
export const S11b_重複入室: Story = { render: () => <PageNotice code="E2" /> };
