import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import ChanariChatRoom, { type ChanariChatRoomProps } from './index';

function setup(overrides: Partial<ChanariChatRoomProps> = {}) {
  const props: ChanariChatRoomProps = {
    message: 'こんにちは',
    setMessage: vi.fn(),
    onSend: vi.fn(() => Promise.resolve()),
    onReload: vi.fn(),
    onExit: vi.fn(),
    onClearMyLogs: vi.fn(),
    nameColor: '#ff69b4',
    setNameColor: vi.fn(),
    speechColor: '#000000',
    setSpeechColor: vi.fn(),
    reloadSeconds: 7,
    setReloadSeconds: vi.fn(),
    onRestoreDraft: vi.fn(),
    sid: '',
    ...overrides,
  };
  const { container } = render(<ChanariChatRoom {...props} />);
  return { props, form: container.querySelector('form')! };
}

describe('ChanariChatRoom の失敗表示', () => {
  it('発言の保存に失敗するとエラーを表示する', async () => {
    const { form } = setup({
      onSend: vi.fn(() => Promise.reject(new Error('送信できませんでした'))),
    });

    fireEvent.submit(form);

    expect(await screen.findByRole('alert')).toHaveTextContent('送信できませんでした');
  });

  it('自分の発言の削除に失敗すると、操作に応じた汎用の文言を表示する', async () => {
    setup({
      onClearMyLogs: vi.fn(() => Promise.reject(new Error('Failed to clear chat logs: boom'))),
    });

    fireEvent.click(screen.getByRole('button', { name: 'ログ消去' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('ログを消去できませんでした');
    expect(alert).not.toHaveTextContent('Failed to');
  });
});
