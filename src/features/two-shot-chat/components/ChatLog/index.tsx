import { Fragment } from 'react';
import type { RoomView, ViewLine } from '../../../../../supabase/functions/two-shot/rules.ts';
import { TWO_SHOT_CONFIG, type AutoSeconds } from '../../config';
import { decodeCharRefs } from '../../utils/decodeCharRefs';
import { formatTime } from '../../utils/formatTime';
import { noticeView } from '../../utils/noticeText';
import SexLabel from '../SexLabel';

const own = TWO_SHOT_CONFIG.colors.own;

function Line({ line }: { line: ViewLine }) {
  const time = `(${formatTime(line.at)})`;
  if (line.kind === 'message' && line.mine) {
    // 自分の発言は全体を薄い色で（原作の <font color=$color6>）
    return (
      <>
        <span style={{ color: own }}>
          {line.name}
          {' > '}
          {decodeCharRefs(line.text)}
        </span>{' '}
        <span className="ts-small" style={{ color: own }}>
          {time}
        </span>
      </>
    );
  }
  if (line.kind === 'message') {
    return (
      <>
        <b>{line.name}</b>
        {' > '}
        {decodeCharRefs(line.text)} <span className="ts-small">{time}</span>
      </>
    );
  }
  // お知らせは名前（おしらせ / 管制者へおしらせ）を太字にし、性別だけ色付きにする
  const notice = noticeView(line);
  return (
    <>
      <b>{notice.name}</b>
      {' > '}
      {notice.parts.map((part, index) =>
        typeof part === 'string' ? (
          <Fragment key={index}>{part}</Fragment>
        ) : (
          <SexLabel key={index} sex={part.sex} />
        )
      )}{' '}
      <span className="ts-small">{time}</span>
    </>
  );
}

/**
 * 入室後のログ画面（原作の action=Chat）。research.md §3.4
 *
 * 〔無発言監視タイマX秒経過〕の X は、取得した時点の値（サーバーが計算した idleSeconds）を表示し、表示している
 * 間は進めない（原作と同じ。レンダー中に現在時刻を読まない）。
 */
export default function ChatLog({
  view,
  auto,
  onClear,
}: {
  view: RoomView;
  auto: AutoSeconds;
  onClear: () => void;
}) {
  return (
    <div className="ts-doc">
      {view.lines.map((line, index) => (
        <Fragment key={`${line.at}-${index}`}>
          <Line line={line} />
          <hr />
        </Fragment>
      ))}
      <div className="ts-form">
        {view.seat === 0 && (
          <>
            <input type="button" value="画面クリア" onClick={onClear} />{' '}
          </>
        )}
        {auto > 0 ? `〔${auto}秒自動更新〕` : '〔手動更新〕'}{' '}
        {`〔無発言監視タイマ${view.idleSeconds}秒経過→${TWO_SHOT_CONFIG.idleSeconds}秒後閉鎖〕`}{' '}
        {`〔表示${TWO_SHOT_CONFIG.maxLines}行〕`}
      </div>
      <p />
    </div>
  );
}
