import { useEffect, useEffectEvent, useId, useRef } from 'react';
import type { ChangeEvent, KeyboardEvent } from 'react';
import Input from '@shared/components/Input';
import { FILTER_WORD_MAX_LENGTH } from '@features/chat/utils/ipFilterStore';

type Props = {
  /** ダブルタップした発言の本文 */
  message: string;
  /** 非表示にする言葉 */
  value: string;
  onChange: (word: string) => void;
  /** 今のログで、この言葉を含む発言の数 */
  matchCount: number;
  /** Enter で「フィルタする」 */
  onSubmit: () => void;
};

/**
 * 言葉のフィルタで、発言の一部を選ぶ欄（.kiro/specs/chat-ip-mute Requirement 9）。
 *
 * - 発言の全文を枠に出し、その中を範囲選択すると「非表示にする言葉」に入る（パソコンのドラッグ、スマートフォンの長押し）
 * - 入力欄で直接書き換えてもよい。今のログで、この言葉を含む発言の数をその場で出す
 * - 選択の変化（selectionchange）は document の出来事なので Effect で購読する。値の書き込みは useEffectEvent で
 *   最新の onChange を呼び、購読をやり直さない
 */
export default function WordPicker({ message, value, onChange, matchCount, onSubmit }: Props) {
  const inputId = useId();
  const sourceRef = useRef<HTMLParagraphElement>(null);

  const onSelectionChange = useEffectEvent(() => {
    const selection = document.getSelection();
    const source = sourceRef.current;
    if (!selection || selection.isCollapsed || !source || !selection.anchorNode) return;
    if (!source.contains(selection.anchorNode)) return;
    const text = selection.toString().trim();
    if (text) onChange(text.slice(0, FILTER_WORD_MAX_LENGTH));
  });

  useEffect(() => {
    const listener = () => onSelectionChange();
    document.addEventListener('selectionchange', listener);
    return () => document.removeEventListener('selectionchange', listener);
  }, []);

  return (
    <div className="mt-2">
      <p
        ref={sourceRef}
        className="max-h-24 overflow-y-auto border-2 border-ie-gray [border-style:inset] bg-white p-1 text-xs break-all select-text"
        data-testid="filter-word-source"
      >
        {message}
      </p>
      <label htmlFor={inputId} className="mt-2 block text-xs">
        非表示にする言葉（上の発言から選ぶか、入力してください）
      </label>
      <Input
        id={inputId}
        type="text"
        value={value}
        maxLength={FILTER_WORD_MAX_LENGTH}
        onChange={(event: ChangeEvent<HTMLInputElement>) => onChange(event.target.value)}
        onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onSubmit();
          }
        }}
        className="mt-1 w-full"
      />
      <p className="mt-1 text-xs text-gray-600" aria-live="polite">
        {value.trim() ? `この言葉を含む発言: ${matchCount} 件` : '言葉が空です'}
      </p>
    </div>
  );
}
