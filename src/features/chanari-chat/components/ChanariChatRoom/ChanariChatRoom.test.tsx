import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, act } from '@testing-library/react';
import ChanariChatRoom, { type ChanariChatRoomProps } from './index';

function setup(overrides: Partial<ChanariChatRoomProps> = {}) {
  const props: ChanariChatRoomProps = {
    initialMessage: 'こんにちは',
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

it('即時clear・二重送信抑止・新しい編集を壊さない失敗復元', async () => {
  let reject!: (error: Error) => void;
  const send = vi.fn(
    () =>
      new Promise<void>((_, fail) => {
        reject = fail;
      })
  );
  const save = vi.fn();
  const { form } = setup({ onSend: send, onSaveDraft: save });
  fireEvent.submit(form);
  expect(screen.getByRole('textbox', { name: '発言' })).toHaveValue('');
  fireEvent.submit(form);
  expect(send).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByRole('textbox', { name: '発言' }), {
    target: { value: '新しい編集' },
  });
  await act(async () => reject(new Error('offline')));
  expect(screen.getByRole('textbox', { name: '発言' })).toHaveValue('新しい編集');
  fireEvent.click(screen.getByRole('button', { name: '送信できなかった本文を戻す' }));
  expect(screen.getByRole('textbox', { name: '発言' })).toHaveValue('こんにちは');
  expect(save).toHaveBeenCalledWith('こんにちは');
});
it('draftをdebounce保存し、終了時に最新の非空本文を保存する', () => {
  vi.useFakeTimers();
  const save = vi.fn();
  const { unmount } = render(
    <ChanariChatRoom
      initialMessage=""
      onSaveDraft={save}
      onSend={() => {}}
      onReload={() => {}}
      onExit={() => {}}
      onClearMyLogs={() => {}}
      nameColor="#ff69b4"
      setNameColor={() => {}}
      speechColor="#000000"
      setSpeechColor={() => {}}
      reloadSeconds={7}
      setReloadSeconds={() => {}}
      onRestoreDraft={() => '他タブの候補'}
      sid=""
    />
  );
  const input = screen.getByRole('textbox', { name: '発言' });
  fireEvent.change(input, { target: { value: 'あ' } });
  fireEvent.change(input, { target: { value: 'あいう' } });
  act(() => vi.advanceTimersByTime(299));
  expect(save).not.toHaveBeenCalled();
  act(() => vi.advanceTimersByTime(1));
  expect(save).toHaveBeenCalledTimes(1);
  expect(save).toHaveBeenLastCalledWith('あいう');
  fireEvent.click(screen.getByRole('button', { name: '発言復元' }));
  expect(input).toHaveValue('他タブの候補');
  unmount();
  expect(save).toHaveBeenLastCalledWith('他タブの候補');
  vi.useRealTimers();
});

it('同じ送信のretryを新しい投稿に変換せず、新しい本文を保持する', async () => {
  const retry = vi.fn().mockResolvedValue(undefined);
  const { props } = setup({
    initialMessage: '新しい本文',
    failedMessage: '失敗本文',
    onRetrySend: retry,
  });
  fireEvent.click(screen.getByRole('button', { name: '同じ送信を再試行' }));
  await act(async () => {});
  expect(retry).toHaveBeenCalledTimes(1);
  expect(props.onSend).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: '発言' })).toHaveValue('新しい本文');
});
