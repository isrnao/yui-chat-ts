import { useId } from 'react';
import { clearFilteredIps, removeFilteredIp } from '@features/chat/utils/ipFilterStore';
import { mergeNames } from '@features/chat/utils/ipFilter';
import ModalShell from '../shared/ModalShell';

type Names = ReadonlyMap<string, readonly string[]>;

type Props = {
  /** フィルタした伏せ字の IP。追加した順 */
  ips: readonly string[];
  /** 現在のログで、伏せ字の IP ごとに隠れている発言の数（filterByIp の結果） */
  hiddenCounts: ReadonlyMap<string, number>;
  /** 現在のログで、伏せ字の IP ごとに隠れている発言の「おなまえ」（filterByIp の結果） */
  hiddenNames?: Names;
  /** フィルタした時点で保存した「おなまえ」。今のログで隠れている名前の後ろに続けて出す */
  savedNames?: Names;
  onClose: () => void;
};

const NO_NAMES: Names = new Map();

/** 「おなまえ」の表示。今のログの名前、保存した名前の順に重複なく。どちらにもなければ — */
function namesLabel(ip: string, hiddenNames: Names, savedNames: Names): string {
  const names = mergeNames(hiddenNames.get(ip), savedNames.get(ip));
  return names.length > 0 ? names.join('、') : '—';
}

/**
 * フィルタの一覧（.kiro/specs/chat-ip-mute Requirement 4）。「細字」の右の「フィルタ」で開くモーダル。
 * 1 行に「おなまえ」と、その下に小さく「IP・隠れている件数」、右に「解除」を置き、幅の狭い窓に収める。
 * 解除はストアを直接書き換える（ログはその場で再計算される）。Esc・背景・× で閉じる
 */
export default function FilterListDialog({
  ips,
  hiddenCounts,
  hiddenNames = NO_NAMES,
  savedNames = NO_NAMES,
  onClose,
}: Props) {
  const titleId = useId();

  return (
    <ModalShell labelledBy={titleId} onCancel={onClose} className="w-full max-w-xs">
      <div className="flex items-center justify-between">
        <h2 id={titleId} className="font-bold">
          フィルタ{ips.length > 0 && `（${ips.length}）`}
        </h2>
        <button
          type="button"
          className="px-1 text-base leading-none"
          onClick={onClose}
          aria-label="閉じる"
          autoFocus
        >
          ×
        </button>
      </div>

      {ips.length === 0 ? (
        <p className="mt-2 text-xs">フィルタしている IP はありません。</p>
      ) : (
        <ul className="mt-2 max-h-[50dvh] overflow-y-auto border-y border-ie-gray">
          {ips.map((ip) => (
            <li
              key={ip}
              className="flex items-center gap-2 border-b border-white py-1 last:border-b-0"
            >
              <div className="min-w-0 flex-1">
                <div className="truncate font-bold">{namesLabel(ip, hiddenNames, savedNames)}</div>
                <div className="text-xs text-gray-600">
                  {ip}・{hiddenCounts.get(ip) ?? 0} 件
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 text-xs text-[#060] underline"
                onClick={() => removeFilteredIp(ip)}
                aria-label={`${ip} のフィルタを解除`}
              >
                解除
              </button>
            </li>
          ))}
        </ul>
      )}

      {ips.length >= 2 && (
        <div className="mt-2 text-right">
          <button
            type="button"
            className="text-xs text-[#060] underline"
            onClick={() => clearFilteredIps()}
          >
            すべて解除
          </button>
        </div>
      )}
      <p className="mt-2 text-[0.7rem] leading-snug text-gray-600">
        IP
        は一部を伏せた値で比べるため、別の人の発言も一緒に隠れることがあります。このブラウザの中だけの設定です。
      </p>
    </ModalShell>
  );
}
