// ChatRoom.test.tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ChatRoom from './index';
import type { ChatRoomProps } from './index';

describe('ChatRoom', () => {
  let props: ChatRoomProps;

  beforeEach(() => {
    props = {
      message: '',
      setMessage: vi.fn(),
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

  it('calls setMessage when input changes', () => {
    render(<ChatRoom {...props} />);
    const input = screen.getByRole('textbox', { name: '発言' });
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(props.setMessage).toHaveBeenCalledWith('abc');
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
    props.message = '送信テスト';
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
    // 成功時 setMessage('') が呼ばれる
  });

  it('shows error when onSend rejects', async () => {
    props.message = 'error test';
    const errorMsg = '送信失敗';
    props.onSend = vi.fn(() => Promise.reject(new Error(errorMsg)));
    render(<ChatRoom {...props} />);
    const input = screen.getByRole('textbox', { name: '発言' });
    fireEvent.change(input, { target: { value: 'error test' } });
    fireEvent.click(screen.getByRole('button', { name: '発言' }));

    await waitFor(() => {
      expect(screen.getByText(errorMsg)).toBeInTheDocument();
    });
  });

  it('does not send empty message', async () => {
    props.message = '';
    render(<ChatRoom {...props} />);
    fireEvent.click(screen.getByRole('button', { name: '発言' }));
    await waitFor(() => expect(props.onSend).not.toHaveBeenCalled());
  });

  describe('入力欄のフォーカス', () => {
    it('送信アクション完了後に入力欄へフォーカスが戻る', async () => {
      props.message = 'フォーカステスト';
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
});
