import { useChatRanking } from '@features/chat/hooks/useChatRanking';
import { formatCountTime } from '@shared/utils/format';
import type { Chat } from '@features/chat/types';

type Props = {
  chatLog: Chat[];
  /** 見出しに出す部屋名。レガシーは「〇〇チャットの発言ランキング」だった */
  roomTitle?: string;
  /** 部屋名リンクの遷移先。レガシーではここがチャット本体へ戻る導線だった */
  onBackToChat?: () => void;
};

/**
 * 発言ランキング（レガシー再現）。
 *
 * 当時のマークアップは枠線もクラスも持たない素の table で、見た目はブラウザ既定の
 * テーブル描画そのものだった。chatgreen.css が持っていたのは次の3点だけ。
 *   body   : background #C1FC92
 *   a      : color #060 / underline
 *   .rankingname font : display block / width 16em / height 1em / overflow hidden
 * Tailwind の preflight が見出し・テーブル・hr の既定値を打ち消すため、
 * ここでは当時のブラウザ既定値を明示的に戻している。
 */
export default function ChatRanking({ chatLog, roomTitle, onBackToChat }: Props) {
  const ranking = useChatRanking(chatLog);

  return (
    <div className="font-yui text-[13px] text-black">
      <h3 className="my-[1em] text-[1.17em] font-bold">
        {roomTitle &&
          (onBackToChat ? (
            <button type="button" className="text-[#060] underline" onClick={onBackToChat}>
              {roomTitle}
            </button>
          ) : (
            roomTitle
          ))}
        の発言ランキング
      </h3>

      <hr className="my-[0.5em] [border-style:inset] [border-width:1px]" />

      <div className="overflow-x-auto">
        <table className="border-separate border-spacing-[2px]">
          <thead>
            <tr>
              <th className="whitespace-nowrap p-px text-center font-bold">おなまえ</th>
              <th className="whitespace-nowrap p-px text-center font-bold">発言回数</th>
              <th className="whitespace-nowrap p-px text-center font-bold">最終発言時刻</th>
              <th className="whitespace-nowrap p-px text-center font-bold">ホスト情報</th>
            </tr>
          </thead>
          <tbody>
            {ranking.length === 0 && (
              <tr>
                <td className="p-px text-left" colSpan={4}>
                  データなし
                </td>
              </tr>
            )}
            {ranking.map(({ name, count, lastTime, color, host }) => (
              <tr key={name}>
                <td className="p-px text-left">
                  {/* 当時は td.rankingname font { display:block; width:16em; height:1em; overflow:hidden }。
                      長い名前でレイアウトを崩さないための1行クリップだが、height:1em をそのまま
                      持ち込むと DotGothic16 では字面が収まらず下が切れる。意図（16em で1行に
                      収める）はそのままに、縦のクリップは nowrap に置き換えている。 */}
                  <span
                    className="block w-[16em] overflow-hidden whitespace-nowrap font-bold"
                    style={{ color }}
                  >
                    {name}
                  </span>
                </td>
                <td className="p-px text-left">{count}</td>
                <td className="p-px text-left">{formatCountTime(lastTime)}</td>
                <td className="p-px text-left">{host}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <hr className="my-[0.5em] [border-style:inset] [border-width:1px]" />
    </div>
  );
}
