import type { Sex } from '../../../../../supabase/functions/two-shot/rules.ts';
import { TWO_SHOT_CONFIG } from '../../config';
import { decodeCharRefs } from '../../utils/decodeCharRefs';
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

const STATUS: Record<LobbyRow['status'], { label: string; color: string }> = {
  empty: { label: '空室', color: colors.status.empty },
  waiting: { label: '待機中', color: colors.status.waiting },
  full: { label: '満室', color: colors.status.full },
};

/**
 * 1 部屋の行。旧お気楽チャットはプロフィールの下に小さい文字で接続元のホスト名を出していたが、個人情報なので
 * 出さない（2026-09-24 の決定）。行の高さを変えないよう、2 行目は空の小さい文字にする（空室の行と同じ形）。
 */
function Row({ name, row }: { name: string; row: LobbyRow | null }) {
  const waiting = row?.status === 'waiting' ? row : null;
  const status = row === null ? null : STATUS[row.status];
  return (
    <tr>
      <td>{name}</td>
      <td>
        {/* <CENTER><FONT color=…>空室</FONT></CENTER> */}
        <div className="ts-center">
          {status === null ? NBSP : <span style={{ color: status.color }}>{status.label}</span>}
        </div>
      </td>
      <td className="ts-center">{waiting ? <SexLabel sex={waiting.sex} /> : NBSP}</td>
      <td>{waiting?.name || NBSP}</td>
      <td>
        {/* プロフィールは HTML として出していたので、文字参照は記号になる */}
        {(waiting && decodeCharRefs(waiting.profile)) || NBSP}
        {/* <BR><FONT size=-2>&nbsp;</FONT>。Quirks モードの行の高さに合わせて、小さい文字のブロックにする */}
        <div className="ts-x-small">{NBSP}</div>
      </td>
    </tr>
  );
}

/**
 * 旧お気楽チャットの注意書き（Q4(a)）。アーカイブの文言のまま（「にします。」の後の「。」も含む）。
 * 通報の案内は、旧サイトの通報フォームの代わりに管理者チャットへ（2026-09-24 の決定）。会話の控えを残すこと
 * （Q4(b)）と、その保持期間・削除の遅れの 1 行を足す（requirements.md Requirement 15.5）。
 */
function SafetyNotice({ reportHref }: { reportHref: string }) {
  return (
    <div>
      <b>
        <span style={{ color: colors.notice }}>▼重要なお知らせ</span>
        {'\u3000'}待機用プロフィールやハンドルネーム、発言に関する注意事項
      </b>
      <br />
      <b>
        アダルトや出会いを求める表現を記載している方は、見つけ次第、
        <span style={{ color: colors.notice }}>即アクセス禁止</span>にします。
      </b>
      。<br />
      当サイトはアダルトサイトではありません。
      <br />
      通報に対応するため、会話の控えを 30 日間保存し、通報があったときだけ管理者が確認します（30
      日を過ぎた控えは 1 時間以内に削除します）。
      <br />
      発見された方は、
      <b>
        <a href={reportHref} target="_blank" rel="noopener">
          管理者チャット
        </a>
      </b>{' '}
      よりご連絡ください。
    </div>
  );
}

/**
 * 待合室の空室状況。旧お気楽チャットのアーカイブ（2shot.php?action=List。research.md §8）と同じ構成にする。
 * 右の列は広告の枠（幅 200px）だった。広告は出さないが、表の位置を同じにするため空けておく。
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
            手動更新
          </button>
          〕〔
          <button type="button" className="ts-link" onClick={() => onSetAuto(true)}>
            自動更新({seconds}秒)にする
          </button>
          〕
        </>
      )}
      <br />
      <br />
      <SafetyNotice reportHref={reportHref} />
      <br />
      <table className="ts-table-full">
        <tbody>
          <tr>
            <td className="ts-center">
              <table className="ts-pink ts-list" style={{ width: '700px', marginInline: 'auto' }}>
                <tbody>
                  <tr>
                    {[
                      '部屋名',
                      '状態',
                      TWO_SHOT_CONFIG.sexName,
                      TWO_SHOT_CONFIG.nameLabel,
                      'プロフィール',
                    ].map((label) => (
                      <th key={label}>{label}</th>
                    ))}
                  </tr>
                  {TWO_SHOT_CONFIG.rooms.map((room) =>
                    lobby.kind === 'error' ? (
                      <tr key={room.id}>
                        <td>{room.name}</td>
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
            </td>
            <td style={{ verticalAlign: 'top' }}>
              <table style={{ width: '200px', borderSpacing: 0 }} aria-hidden="true">
                <tbody>
                  <tr>
                    <td style={{ padding: '5px' }} />
                  </tr>
                </tbody>
              </table>
            </td>
          </tr>
        </tbody>
      </table>
      〔
      <a href={homeHref} target="_top">
        {TWO_SHOT_CONFIG.homeLabel}
      </a>
      〕
      {/* 旧お気楽チャットは原作の著作表示の画像と「Powered by PHP」。画像は使わず文字のクレジットにする（Q3） */}
      <div className="ts-right ts-line-quirk">
        <small>
          原作:{' '}
          <a href="http://www.rescue.ne.jp/" target="_blank" rel="noopener noreferrer">
            2SHOT-CHAT
          </a>{' '}
          (CGI-RESCUE)
        </small>
      </div>
    </div>
  );
}
