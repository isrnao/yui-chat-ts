import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { startTransition, useActionState, useOptimistic, useState } from 'react';
import type { Chat } from '@features/chat/types';
import { useChatSender } from './useChatSender';
import { reduceOptimisticChat } from './useChatLog';

// 保存の完了をテストから制御する。解決するまで楽観的なチャットが見えていることを確かめる
let settleSave: { resolve: () => void; reject: (error: Error) => void } | null = null;

vi.mock('@features/chat/api/chatApi', () => ({
  saveChatLogOptimistic: vi.fn(
    (_roomId: string, chat: Chat) =>
      new Promise<Chat>((resolve, reject) => {
        settleSave = {
          resolve: () => resolve({ ...chat, uuid: 'server-uuid', optimistic: false }),
          reject,
        };
      })
  ),
  createOptimisticChat: vi.fn(),
}));
vi.mock('@shared/observability/newRelic', () => ({ recordSendChat: vi.fn() }));

const chat = {
  uuid: 'temp-1',
  name: 'ゆい',
  color: '#000',
  message: 'こんにちは',
  time: 1,
  optimistic: true,
  ip_masked: '',
  ua: '',
} as Chat;

// 送信の Promise。イベントハンドラの中で代入する（レンダー中に外部の値を書き換えない）
let pending: Promise<unknown> | undefined;

/**
 * 実際の useOptimistic と useChatSender を組み合わせたハーネス。
 * mode で「呼び出し元が Action の外 / useActionState の中」を切り替える。
 */
function Harness({ mode }: { mode: 'plain' | 'actionState' }) {
  const [log, setLog] = useState<Chat[]>([]);
  const [optimisticLog, addOptimistic] = useOptimistic(log, reduceOptimisticChat);
  const mergeChat = (saved: Chat) =>
    setLog((prev) => [saved, ...prev.filter((c) => c.uuid !== saved.uuid)]);
  const { send } = useChatSender({ addOptimistic, mergeChat });
  const [, dispatch] = useActionState(async () => {
    await send('superbeginner', chat).catch(() => {});
    return null;
  }, null);

  const handleClick = () => {
    if (mode === 'plain') {
      pending = send('superbeginner', chat);
      pending.catch(() => {});
    } else {
      startTransition(() => dispatch());
    }
  };

  const handleClickInAction = () => {
    startTransition(async () => {
      pending = send('superbeginner', chat);
      await pending;
    });
  };

  return (
    <>
      <button onClick={handleClick}>send</button>
      <button onClick={handleClickInAction}>send-in-action</button>
      <ul>
        {optimisticLog.map((c) => (
          <li key={c.uuid}>{c.uuid}</li>
        ))}
      </ul>
    </>
  );
}

function renderedUuids(): string[] {
  return screen.queryAllByRole('listitem').map((li) => li.textContent ?? '');
}

describe('useChatSender の楽観的更新', () => {
  beforeEach(() => {
    settleSave = null;
    pending = undefined;
  });

  it.each(['plain', 'actionState'] as const)(
    '呼び出し元が %s でも、保存が解決するまで楽観的なチャットを表示する',
    async (mode) => {
      render(<Harness mode={mode} />);

      await act(async () => {
        fireEvent.click(screen.getByText('send'));
      });
      expect(renderedUuids()).toEqual(['temp-1']);

      await act(async () => {
        settleSave!.resolve();
        await pending?.catch(() => {});
      });
      expect(renderedUuids()).toEqual(['server-uuid']);
    }
  );

  it('呼び出し元がすでに async Action の中にいても、保存が解決するまで表示する', async () => {
    render(<Harness mode="plain" />);

    await act(async () => {
      fireEvent.click(screen.getByText('send-in-action'));
    });
    expect(renderedUuids()).toEqual(['temp-1']);

    await act(async () => {
      settleSave!.resolve();
      await pending;
    });
    expect(renderedUuids()).toEqual(['server-uuid']);
  });

  it('保存に失敗すると楽観的なチャットは消え、呼び出し元にエラーが届く', async () => {
    render(<Harness mode="plain" />);

    await act(async () => {
      fireEvent.click(screen.getByText('send'));
    });
    expect(renderedUuids()).toEqual(['temp-1']);

    await act(async () => {
      settleSave!.reject(new Error('保存に失敗しました'));
      await pending?.catch(() => {});
    });
    await expect(pending).rejects.toThrow('保存に失敗しました');
    expect(renderedUuids()).toEqual([]);
  });
});
