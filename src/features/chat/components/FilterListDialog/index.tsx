import { useId } from 'react';
import { clearFilters, filterKey, removeFilter } from '@features/chat/utils/ipFilterStore';
import type { FilterEntry } from '@features/chat/utils/ipFilterStore';
import { mergeNames } from '@features/chat/utils/ipFilter';
import ModalShell from '../shared/ModalShell';
import { CHAT_TEXTS, fillText } from '@features/chat/chatTexts';

type Names = ReadonlyMap<string, readonly string[]>;

type Props = {
  open: boolean;
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
        label: fillText(CHAT_TEXTS.filterList.removeIp, { ip: entry.ip }),
      };
    }
    case 'name':
      return {
        title: entry.name,
        kind: CHAT_TEXTS.filterList.kindName,
        label: fillText(CHAT_TEXTS.filterList.removeName, { name: entry.name }),
      };
    case 'word':
      return {
        title: `「${entry.word}」`,
        kind: CHAT_TEXTS.filterList.kindWord,
        label: fillText(CHAT_TEXTS.filterList.removeWord, { word: entry.word }),
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
  open,
  entries,
  hiddenCounts,
  hiddenNames = NO_NAMES,
  onClose,
}: Props) {
  const titleId = useId();

  return (
    <ModalShell open={open} labelledBy={titleId} onCancel={onClose} className="w-full max-w-xs">
      <div className="flex items-center justify-between">
        <h2 id={titleId} className="font-bold">
          {entries.length > 0
            ? fillText(CHAT_TEXTS.filterList.titleCount, { count: entries.length })
            : CHAT_TEXTS.filterList.title}
        </h2>
        <button
          type="button"
          className="px-1 text-base leading-none"
          onClick={onClose}
          aria-label={CHAT_TEXTS.filterList.close}
          autoFocus
          data-dialog-initial-focus
        >
          ×
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="mt-2 text-xs">{CHAT_TEXTS.filterList.none}</p>
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
                    {fillText(CHAT_TEXTS.filterList.count, {
                      kind,
                      count: hiddenCounts.get(key) ?? 0,
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  className="shrink-0 text-xs text-[#060] underline"
                  onClick={() => removeFilter(key)}
                  aria-label={label}
                >
                  {CHAT_TEXTS.filterList.remove}
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
            {CHAT_TEXTS.filterList.removeAll}
          </button>
        </div>
      )}
      <p className="mt-2 text-[0.7rem] leading-snug text-gray-600">{CHAT_TEXTS.filterList.note}</p>
    </ModalShell>
  );
}
