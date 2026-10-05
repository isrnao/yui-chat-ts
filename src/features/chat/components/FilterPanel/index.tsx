import { clearFilteredIps, removeFilteredIp } from '@features/chat/utils/ipFilterStore';

type Props = {
  /** フィルタした伏せ字の IP。追加した順 */
  ips: readonly string[];
  /** 現在のログで、伏せ字の IP ごとに隠れている発言の数（filterByIp の結果） */
  hiddenCounts: ReadonlyMap<string, number>;
  /** 現在のログで、伏せ字の IP ごとに隠れている発言の「おなまえ」（filterByIp の結果） */
  hiddenNames?: ReadonlyMap<string, readonly string[]>;
  /** 見出しのリンクからログ表示へ戻る */
  onBack?: () => void;
};

/**
 * フィルタの編集画面（.kiro/specs/chat-ip-mute Requirement 4）。ランキングと同じく下段のログと入れ替えて出す。
 * 見た目はランキング（ChatRanking）と同じ素の見出しと table に合わせる。
 * 解除はストアを直接書き換える。ログは Activity の中で残っているので、戻ったときには反映済みになる。
 */
export default function FilterPanel({ ips, hiddenCounts, hiddenNames, onBack }: Props) {
  return (
    <div className="font-yui text-black">
      <h3 className="my-[1em] text-[1.17em] font-bold">
        {onBack ? (
          <button type="button" className="text-[#060] underline" onClick={onBack}>
            フィルタ
          </button>
        ) : (
          'フィルタ'
        )}
      </h3>

      <hr className="my-[0.5em] [border-style:inset] [border-width:1px]" />

      {ips.length === 0 ? (
        <p className="my-[1em]">
          フィルタしている IP はありません。
        </p>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-[2px]">
              <thead>
                <tr>
                  <th className="whitespace-nowrap p-px text-center font-bold">IP</th>
                  <th className="whitespace-nowrap p-px text-center font-bold">おなまえ</th>
                  <th className="whitespace-nowrap p-px text-center font-bold">隠れている発言</th>
                  <th className="p-px" aria-label="操作" />
                </tr>
              </thead>
              <tbody>
                {ips.map((ip) => (
                  <tr key={ip}>
                    <td className="whitespace-nowrap p-px">{ip}</td>
                    <td className="p-px">{hiddenNames?.get(ip)?.join('、') || '—'}</td>
                    <td className="whitespace-nowrap p-px text-right">
                      {hiddenCounts.get(ip) ?? 0} 件
                    </td>
                    <td className="p-px">
                      <button
                        type="button"
                        className="text-[#060] underline"
                        onClick={() => removeFilteredIp(ip)}
                        aria-label={`${ip} のフィルタを解除`}
                      >
                        解除
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {ips.length >= 2 && (
            <p className="my-[1em]">
              <button
                type="button"
                className="text-[#060] underline"
                onClick={() => clearFilteredIps()}
              >
                すべて解除
              </button>
            </p>
          )}
        </>
      )}

      <hr className="my-[0.5em] [border-style:inset] [border-width:1px]" />
      <p className="text-xs text-gray-600">
        IP は一部を伏せた値で比べるため、別の人の発言も一緒に隠れることがあります。
        フィルタはこのブラウザの中だけの設定です。
      </p>
    </div>
  );
}
