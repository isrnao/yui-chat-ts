import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import App from './App';

// 複雑なSupabase統合部分はモック化
vi.mock('@features/chat/api/chatApi', () => ({
  loadChatLogs: vi.fn().mockResolvedValue([]),
  saveChatLog: vi.fn(),
  clearChatLogs: vi.fn(),
  subscribeChatLogs: vi.fn(() => ({ unsubscribe: vi.fn() })),
}));

vi.mock('@shared/utils/clientInfo', () => ({
  getClientIP: vi.fn().mockResolvedValue('127.0.0.1'),
  getUserAgent: vi.fn().mockReturnValue('test-agent'),
}));

// TermsModalのcanvas関連エラーを回避するため、モック化
vi.mock('@shared/components', () => ({
  TermsModal: ({ open, onAgree }: { open: boolean; onAgree: () => void }) =>
    open ? (
      <div role="dialog">
        <h2>利用規約</h2>
        <button onClick={onAgree}>同意</button>
      </div>
    ) : null,
}));

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
});

describe('<App />', () => {
  it('should render the app without crashing', () => {
    render(<App />);
    // アプリが正常にレンダリングされることを確認
    expect(document.body).toBeInTheDocument();
  });

  it('should show terms modal on initial load', () => {
    render(<App />);
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('利用規約')).toBeInTheDocument();
  });
});
