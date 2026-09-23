// ChatRoom.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatRoom from './index';
import type { ChatRoomProps } from './index';
import { UserFacingError } from '@features/chat/utils/userFacingError';

describe('ChatRoom', () => {
  let props: ChatRoomProps;

  beforeEach(() => {
    props = {
      windowRows: 50,
      setWindowRows: vi.fn(),
      onExit: vi.fn(),
      onSend: vi.fn(() => Promise.resolve()),
      onReload: vi.fn(),
      onShowRanking: vi.fn(),
      onBackToChat: vi.fn(),
    };
  });

  it('renders input, buttons, and select', () => {
    render(<ChatRoom {...props} />);
    expect(screen.getByRole('textbox', { name: '発言' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '発言' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '更新' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'ログ行数' })).toBeInTheDocument();
    expect(screen.getByText('[退室]')).toBeInTheDocument();
    expect(screen.getByText('[ランキング]')).toBeInTheDocument();
  });

  it('renders [ランキング] to the right of [退室]', () => {
    const { container } = render(<ChatRoom {...props} />);
    const links = Array.from(container.querySelectorAll('a')).map((a) => a.textContent);
    expect(links).toEqual(['[退室]', '[ランキング]']);
  });

  it('おなまえ欄の名前を入室時に選んだ色で表示する', () => {
    render(<ChatRoom {...props} userName="かお@塵" userColor="#ff69b4" />);
    expect(screen.getByText('かお@塵')).toHaveStyle({ color: '#ff69b4' });
  });

  it('発言欄の値は部品の中で持つ', () => {
    render(<ChatRoom {...props} />);
    const input = screen.getByRole('textbox', { name: '発言' });
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(input).toHaveValue('abc');
  });

  it('ログ行数の選択肢は既定で 100 件まで', () => {
    render(<ChatRoom {...props} />);
    const options = screen.getAllByRole('option').map((o) => o.textContent);
    expect(options).toContain('100');
    expect(options).not.toContain('1000');
  });

  it('windowRowOptions を渡すと 1000 件まで選べる', () => {
    render(<ChatRoom {...props} windowRowOptions={[30, 100, 1000]} />);
    const select = screen.getByRole('combobox', { name: 'ログ行数' });
    fireEvent.change(select, { target: { value: '1000' } });
    expect(props.setWindowRows).toHaveBeenCalledWith(1000);
  });

  it('calls setWindowRows when select changes', () => {
    render(<ChatRoom {...props} />);
    const select = screen.getByRole('combobox', { name: 'ログ行数' });
    fireEvent.change(select, { target: { value: '100' } });
    expect(props.setWindowRows).toHaveBeenCalledWith(100);
  });

  it('calls onExit when [退室] clicked', () => {
    render(<ChatRoom {...props} />);
    fireEvent.click(screen.getByText('[退室]'));
    expect(props.onExit).toHaveBeenCalled();
  });

  it('calls onShowRanking when [ランキング] clicked', () => {
    render(<ChatRoom {...props} />);
    fireEvent.click(screen.getByText('[ランキング]'));
    expect(props.onShowRanking).toHaveBeenCalled();
  });

  it('calls onReload when 更新 button clicked', () => {
    render(<ChatRoom {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '更新' }));
    expect(props.onReload).toHaveBeenCalled();
    expect(props.onBackToChat).toHaveBeenCalled();
  });

  // ランキングから戻る目的で押されるため、送信されない空入力でも戻す
  it('calls onBackToChat even when 発言 is pressed with an empty message', () => {
    render(<ChatRoom {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '発言' }));
    expect(props.onBackToChat).toHaveBeenCalled();
    expect(props.onSend).not.toHaveBeenCalled();
  });

  it('calls onSend when 発言 (submit) and clears message', async () => {
    render(<ChatRoom {...props} />);
    const input = screen.getByRole('textbox', { name: '発言' });
    fireEvent.change(input, { target: { value: '送信テスト' } });
    fireEvent.click(screen.getByRole('button', { name: '発言' }));
    await waitFor(() =>
      expect(props.onSend).toHaveBeenCalledWith('送信テスト', {
        version: 1,
        fontStyle: { bold: true },
      })
    );
  });

  // onSubmit で入力欄を空にしても、action に渡る FormData は空にする前の値で作られる（spec R8.3）
  it('送信すると保存を待たずに入力欄が空になり、送った値は失われない', async () => {
    let resolveSend: () => void = () => {};
    props.onSend = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSend = resolve;
        })
    );
    render(<ChatRoom {...props} />);
    const input = screen.getByRole('textbox', { name: '発言' });
    fireEvent.change(input, { target: { value: 'すぐ消える' } });
    fireEvent.click(screen.getByRole('button', { name: '発言' }));

    await waitFor(() =>
      expect(props.onSend).toHaveBeenCalledWith('すぐ消える', expect.any(Object))
    );
    expect(input).toHaveValue('');
    resolveSend();
  });

  it('送信に失敗すると、内部のエラー文言ではなく汎用の文言を表示する', async () => {
    props.onSend = vi.fn(() => Promise.reject(new Error('Failed to save chat: 500')));
    render(<ChatRoom {...props} />);
    const input = screen.getByRole('textbox', { name: '発言' });
    fireEvent.change(input, { target: { value: 'error test' } });
    fireEvent.click(screen.getByRole('button', { name: '発言' }));

    await waitFor(() => {
      expect(screen.getByText(/発言を送信できませんでした/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Failed to/)).not.toBeInTheDocument();
  });

  it('利用者向けのエラー（UserFacingError）は文言をそのまま表示する', async () => {
    props.onSend = vi.fn(() => Promise.reject(new UserFacingError('削除対象の発言がありません')));
    render(<ChatRoom {...props} />);
    fireEvent.change(screen.getByRole('textbox', { name: '発言' }), { target: { value: 'clear' } });
    fireEvent.click(screen.getByRole('button', { name: '発言' }));

    await waitFor(() => {
      expect(screen.getByText('削除対象の発言がありません')).toBeInTheDocument();
    });
  });

  it('does not send empty message', async () => {
    render(<ChatRoom {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '発言' }));
    await waitFor(() => expect(props.onSend).not.toHaveBeenCalled());
  });

  describe('入力欄のフォーカス', () => {
    it('送信アクション完了後に入力欄へフォーカスが戻る', async () => {
      render(<ChatRoom {...props} />);
      const input = screen.getByRole('textbox', { name: '発言' });
      fireEvent.change(input, { target: { value: 'フォーカステスト' } });

      // 送信前に別要素へフォーカスを移しておく
      const select = screen.getByRole('combobox', { name: 'ログ行数' });
      select.focus();
      expect(document.activeElement).toBe(select);

      fireEvent.click(screen.getByRole('button', { name: '発言' }));

      await waitFor(() => expect(document.activeElement).toBe(input));
    });

    // 回帰テスト: 以前は effect の依存に chatLog が入っていたため、他人の発言が
    // Realtime で届いて再レンダーされるだけでフォーカスを奪っていた
    it('送信を伴わない再レンダーではフォーカスを奪わない', () => {
      const { rerender } = render(<ChatRoom {...props} />);
      const select = screen.getByRole('combobox', { name: 'ログ行数' });
      select.focus();
      expect(document.activeElement).toBe(select);

      rerender(<ChatRoom {...props} userName="ゆい" />);

      expect(document.activeElement).toBe(select);
    });
  });

  describe('レイアウト', () => {
    // 回帰テスト: 発言欄は size=60 由来の固有幅 (Chromium 440px / 全角メトリクスの
    // iOS Safari は 860px) を持ち、親がブロック要素なのでそのままでは親をはみ出す。
    // 親の main は overflow-hidden なので横スクロールでも拾えない。
    // jsdom ではレイアウトを計測できないため、上限クラスの有無で担保する。
    it('発言欄は親幅を超えないよう max-w-full が付いている', () => {
      render(<ChatRoom {...props} />);
      expect(screen.getByRole('textbox', { name: '発言' })).toHaveClass('max-w-full');
    });
  });
});
