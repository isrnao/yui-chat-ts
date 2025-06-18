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
      chatLog: [],
      windowRows: 50,
      setWindowRows: vi.fn(),
      onExit: vi.fn(),
      onSend: vi.fn(() => Promise.resolve()),
      onReload: vi.fn(),
      onShowRanking: vi.fn(),
    };
  });

  it('renders input, buttons, and select', () => {
    render(<ChatRoom {...props} />);
    expect(screen.getByRole('textbox', { name: '発言' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '発言' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'リロード' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'ログ行数' })).toBeInTheDocument();
    expect(screen.getByText('[退室]')).toBeInTheDocument();
    expect(screen.getByText('[発言ランキング]')).toBeInTheDocument();
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

  it('calls onShowRanking when [発言ランキング] clicked', () => {
    render(<ChatRoom {...props} />);
    fireEvent.click(screen.getByText('[発言ランキング]'));
    expect(props.onShowRanking).toHaveBeenCalled();
  });

  it('calls onReload when リロード button clicked', () => {
    render(<ChatRoom {...props} />);
    fireEvent.click(screen.getByRole('button', { name: 'リロード' }));
    expect(props.onReload).toHaveBeenCalled();
  });

  it('calls onSend when 発言 (submit) and clears message', async () => {
    props.message = '送信テスト';
    render(<ChatRoom {...props} />);
    const input = screen.getByRole('textbox', { name: '発言' });
    fireEvent.change(input, { target: { value: '送信テスト' } });
    fireEvent.click(screen.getByRole('button', { name: '発言' }));
    await waitFor(() => expect(props.onSend).toHaveBeenCalledWith('送信テスト'));
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
});
