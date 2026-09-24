import type { ReactNode } from 'react';
import type { Sex } from '../../../../../supabase/functions/two-shot/rules.ts';
import { TWO_SHOT_CONFIG } from '../../config';
import SexLabel from '../SexLabel';

export type LobbyRow =
  | { status: 'empty' }
  | { status: 'waiting'; sex: Sex; name: string; profile: string }
  | { status: 'full' };

/** 一覧の取得の状態。idle は取得前（SSG と hydration の直後を含む） */
export type LobbyState =
  | { kind: 'idle' }
  | { kind: 'loaded'; rows: Readonly<Record<string, LobbyRow>> }
  | { kind: 'error' };

const NBSP = '\u00a0';
const { colors } = TWO_SHOT_CONFIG;

/** 原作は「値の前後に &nbsp;」を入れて描く */
function Padded({ children }: { children?: ReactNode }) {
  return (
    <>
      {NBSP}
      {children}
      {NBSP}
    </>
  );
}

function Status({ row }: { row: LobbyRow }) {
  switch (row.status) {
    case 'empty':
      return <span style={{ color: colors.status.empty }}>空室</span>;
    case 'waiting':
      return (
        <span style={{ color: colors.status.waiting }}>
          <b>待機中</b>
        </span>
      );
    case 'full':
      return <span style={{ color: colors.status.full }}>満室</span>;
  }
}

function Row({ name, row }: { name: string; row: LobbyRow | null }) {
  const waiting = row?.status === 'waiting' ? row : null;
  return (
    <tr>
      <th className="ts-nowrap">{name}</th>
      <td className="ts-nowrap ts-center">
        <Padded>{row && <Status row={row} />}</Padded>
      </td>
      <td className="ts-nowrap ts-center">
        <Padded>{waiting && <SexLabel sex={waiting.sex} />}</Padded>
      </td>
      <td className="ts-nowrap">
        <Padded>{waiting?.name}</Padded>
      </td>
      <td>
        <Padded>{waiting?.profile}</Padded>
      </td>
    </tr>
  );
}

/**
 * 旧お気楽チャットの注意書き（Q4(a)）。会話の控えを残すこと（Q4(b)）と、その保持期間・削除の遅れも書く
 * （requirements.md Requirement 15.5）。
 */
function SafetyNotice({ reportHref }: { reportHref: string }) {
  return (
    <div>
      <b>
        <span style={{ color: '#FF0000' }}>▼重要なお知らせ</span>
        {'\u3000'}プロフィールやチャット名、発言に関する注意事項
      </b>
      <br />
      <b>
        アダルトや出会いを求める表現を記載している方は、見つけ次第、
        <span style={{ color: '#FF0000' }}>即アクセス禁止</span>にします。
      </b>
      <br />
      当サイトはアダルトサイトではありません。
      <br />
      通報に対応するため、会話の控えを 30 日間保存し、通報があったときだけ管理者が確認します（30
      日を過ぎた控えは 1 時間以内に削除します）。
      <br />
      見つけた方は、
      <b>
        <a href={reportHref}>管理者チャット</a>
      </b>{' '}
      でお知らせください。
    </div>
  );
}

/**
 * 空室状況（原作の action=List）。research.md §3.2
 */
export default function RoomList({
  lobby,
  auto,
  onReload,
  onSetAuto,
  homeHref,
  reportHref,
}: {
  lobby: LobbyState;
  /** 60 秒の自動更新中か */
  auto: boolean;
  onReload: () => void;
  onSetAuto: (auto: boolean) => void;
  homeHref: string;
  reportHref: string;
}) {
  const seconds = TWO_SHOT_CONFIG.lobbyReloadSeconds;
  return (
    <div className="ts-doc">
      <div className="ts-p">
        <br />
        <table className="ts-table-70">
          <tbody>
            <tr>
              <td>
                {auto ? (
                  <>
                    〔{seconds}秒自動更新中〕〔
                    <button type="button" className="ts-link" onClick={() => onSetAuto(false)}>
                      手動更新にする
                    </button>
                    〕
                  </>
                ) : (
                  <>
                    〔
                    <button type="button" className="ts-link" onClick={onReload}>
                      <b>手動更新</b>
                    </button>
                    〕〔
                    <button type="button" className="ts-link" onClick={() => onSetAuto(true)}>
                      自動更新({seconds}秒)にする
                    </button>
                    〕
                  </>
                )}
                <div className="ts-p">
                  <SafetyNotice reportHref={reportHref} />
                </div>
                <div className="ts-p">
                  <table className="ts-grid ts-grid-3 ts-table-full">
                    <tbody>
                      <tr style={{ backgroundColor: colors.headerBackground }}>
                        {[
                          'ルーム名',
                          '状態',
                          TWO_SHOT_CONFIG.sexName,
                          'チャット名',
                          'プロフィール',
                        ].map((label) => (
                          <th key={label}>
                            <span style={{ color: colors.headerText }}>{label}</span>
                          </th>
                        ))}
                      </tr>
                      {TWO_SHOT_CONFIG.rooms.map((room) =>
                        lobby.kind === 'error' ? (
                          <tr key={room.id}>
                            <th>{room.name}</th>
                            <td colSpan={4} className="ts-center">
                              異常(2)
                            </td>
                          </tr>
                        ) : (
                          <Row
                            key={room.id}
                            name={room.name}
                            row={lobby.kind === 'loaded' ? (lobby.rows[room.id] ?? null) : null}
                          />
                        )
                      )}
                    </tbody>
                  </table>
                </div>
                <p>
                  〔<a href={homeHref}>{TWO_SHOT_CONFIG.homeLabel}</a>〕
                </p>
                <p />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      {/* 原作の著作表示の画像の位置（Q3: 画像は使わず、文字のクレジットにする） */}
      <div className="ts-right">
        <small>
          原作:{' '}
          <a href="http://www.rescue.ne.jp/" target="_blank" rel="noopener noreferrer">
            2SHOT-CHAT
          </a>{' '}
          (CGI-RESCUE)
        </small>
      </div>
      <p />
    </div>
  );
}
