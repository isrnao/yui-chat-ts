import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EntryForm from './index';

function renderEntryForm() {
  return render(
    <EntryForm
      name=""
      setName={vi.fn()}
      color="#ff69b4"
      setColor={vi.fn()}
      email=""
      setEmail={vi.fn()}
      onEnter={vi.fn()}
    />
  );
}

describe('EntryForm のレイアウト', () => {
  // おなまえ欄と E-Mail 欄は size 属性由来の固有幅を持つ flex アイテムなので、
  // min-width:auto のままだと SP 幅で縮めず行ごと画面外にはみ出す。
  // 親の main は overflow-hidden なので横スクロールで救うこともできない。
  // jsdom ではレイアウトを計測できないため、縮小を許可するクラスの有無で担保する。
  it.each([['おなまえ'], ['E-Mail/URL']])(
    '%s 欄は幅が足りないときに縮めるよう min-width が解除されている',
    (label) => {
      renderEntryForm();
      expect(screen.getByRole('textbox', { name: label })).toHaveClass('min-w-0');
    }
  );
});
