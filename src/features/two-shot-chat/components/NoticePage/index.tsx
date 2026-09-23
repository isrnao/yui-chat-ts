import type { ErrorCode } from '../../../../../supabase/functions/two-shot/rules.ts';
import { TWO_SHOT_CONFIG } from '../../config';
import { errorPage } from '../../utils/noticeText';

/**
 * お知らせ画面（原作の error）。research.md §3.5
 *
 * 原作の 〔空室状況へ〕 はページ全体を入口に戻すリンク、〔直前の画面〕 は history.back() だった。
 * ここではどちらも親の操作を呼ぶ（requirements.md D12: 1 ページのアプリで履歴を戻るとサイトから出てしまうため）。
 */
export default function NoticePage({
  code,
  onLobby,
  onBack,
  homeHref,
}: {
  code: ErrorCode;
  onLobby: () => void;
  onBack: () => void;
  homeHref: string;
}) {
  const { title, lines } = errorPage(code);
  return (
    <div className="ts-doc">
      <h1>{title}</h1>
      <ul>
        {lines.map((line, index) => (
          <li key={line}>
            {line}
            {index === lines.length - 1 && <p />}
          </li>
        ))}
        <li>
          〔
          <button type="button" className="ts-link" onClick={onLobby}>
            <b>空室状況へ</b>
          </button>
          〕<p />
        </li>
        <li>
          〔<a href={homeHref}>{TWO_SHOT_CONFIG.homeLabel}</a>〕<p />
        </li>
        <li>
          〔
          <button type="button" className="ts-link" onClick={onBack}>
            直前の画面
          </button>
          〕
        </li>
      </ul>
    </div>
  );
}
