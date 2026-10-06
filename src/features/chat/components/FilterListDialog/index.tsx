import { useId } from 'react';
import { clearFilters, filterKey, removeFilter } from '@features/chat/utils/ipFilterStore';
import type { FilterEntry } from '@features/chat/utils/ipFilterStore';
import { mergeNames } from '@features/chat/utils/ipFilter';
import ModalShell from '../shared/ModalShell';

type Names = ReadonlyMap<string, readonly string[]>;

type Props = {
  /** フィルタの一覧（IP・名前・言葉）。追加した順 */
  entries: readonly FilterEntry[];
  /** 現在のログで、フィルタ（filterKey）ごとに隠れている発言の数（filterByIp の結果） */
  hiddenCounts: ReadonlyMap<string, number>;
  /** 現在のログで、伏せ字の IP ごとに隠れている発言の「おなまえ」（filterByIp の結果） */
  hiddenNames?: Names;
  onClose: () => void;
};

const NO_NAMES: Names = new Map();

/** 1 行の見出し・種類・解除ボタンの読み上げ名 */
function describe(
  entry: FilterEntry,
  hiddenNames: Names
): { title: string; kind: string; label: string } {
  switch (entry.kind) {
    case 'ip': {
      // 今のログで隠れている名前、フィルタした時点で保存した名前の順に重複なく。どちらにもなければ —
      const names = mergeNames(hiddenNames.get(entry.ip), entry.names);
      return {
        title: names.length > 0 ? names.join('、') : '—',
        kind: entry.ip,
        label: `${entry.ip} のフィルタを解除`,
      };
    }
    case 'name':
      return { title: entry.name, kind: '名前', label: `名前「${entry.name}」のフィルタを解除` };
    case 'word':
      return {
        title: `「${entry.word}」`,
        kind: '言葉',
        label: `言葉「${entry.word}」のフィルタを解除`,
      };
  }
}

/**
 * フィルタの一覧（.kiro/specs/chat-ip-mute Requirement 4）。「細字」の右の「フィルタ」で開くモーダル。
 * 1 行に見出し（IP なら「おなまえ」、名前、言葉）と、その下に小さく「IP / 名前 / 言葉・隠れている件数」、
 * 右に「解除」を置き、幅の狭い窓に収める。解除はストアを直接書き換える（ログはその場で再計算される）。
 * Esc・背景・× で閉じる
 */
export default function FilterListDialog({
  entries,
  hiddenCounts,
  hiddenNames = NO_NAMES,
  onClose,
}: Props) {
  const titleId = useId();

  return (
    <ModalShell labelledBy={titleId} onCancel={onClose} className="w-full max-w-xs">
      <div className="flex items-center justify-between">
        <h2 id={titleId} className="font-bold">
          フィルタ{entries.length > 0 && `（${entries.length}）`}
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

      {entries.length === 0 ? (
        <p className="mt-2 text-xs">フィルタしているものはありません。</p>
      ) : (
        <ul className="mt-2 max-h-[50dvh] overflow-y-auto border-y border-ie-gray">
          {entries.map((entry) => {
            const key = filterKey(entry);
            const { title, kind, label } = describe(entry, hiddenNames);
            return (
              <li
                key={key}
                className="flex items-center gap-2 border-b border-white py-1 last:border-b-0"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-bold">{title}</div>
                  <div className="text-xs text-gray-600">
                    {kind}・{hiddenCounts.get(key) ?? 0} 件
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs text-[#060] underline"
                  onClick={() => removeFilter(key)}
                  aria-label={label}
                >
                  解除
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {entries.length >= 2 && (
        <div className="mt-2 text-right">
          <button
            type="button"
            className="text-xs text-[#060] underline"
            onClick={() => clearFilters()}
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
