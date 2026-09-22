import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Chat } from '@features/chat/types';
import { saveChatLogOptimistic } from '@features/chat/api/chatApi';
import { recordSendChat } from '@shared/observability/newRelic';
import { createAdminChat, useChatSender } from './useChatSender';

vi.mock('@features/chat/api/chatApi', () => ({
  saveChatLogOptimistic: vi.fn((_roomId: string, chat: Chat) =>
    Promise.resolve({ ...chat, uuid: 'server-uuid', optimistic: false })
  ),
  createOptimisticChat: vi.fn((chat: Omit<Chat, 'uuid' | 'time' | 'optimistic'>) => ({
    ...chat,
    uuid: 'temp-1',
    time: 1,
    optimistic: true,
  })),
}));

vi.mock('@shared/observability/newRelic', () => ({ recordSendChat: vi.fn() }));

function setup() {
  const addOptimistic = vi.fn();
  const mergeChat = vi.fn();
  const { result } = renderHook(() => useChatSender({ addOptimistic, mergeChat }));
  return { result, addOptimistic, mergeChat };
}

describe('createAdminChat', () => {
  it('管理人発言の体裁を組み立てる', () => {
    const chat = createAdminChat({
      roomId: 'superbeginner',
      message: 'ゆい さん、Welcome to お気楽チャット☆',
      userColor: '#ff69b4',
      extraMetadata: { visitCount: 3 },
    });

    expect(chat.room_id).toBe('superbeginner');
    expect(chat.name).toBe('管理人');
    expect(chat.color).toBe('#ffffff');
    expect(chat.system).toBe(true);
    expect(chat.metadata).toMatchObject({
      version: 1,
      avatar: 'hoshi1',
      kind: 'admin',
      userColor: '#ff69b4',
      fontStyle: { bold: true },
      visitCount: 3,
    });
  });
});

describe('useChatSender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('saveUserMessage は操作 ID を 1 つ発行し、send-chat の記録と保存に同じ ID を使う', async () => {
    const { result, mergeChat } = setup();
    const chat = {
      ...createAdminChat({ roomId: 'superbeginner', message: 'x', userColor: '#000' }),
      system: false,
    };

    await act(async () => {
      await result.current.saveUserMessage('superbeginner', chat);
    });

    expect(recordSendChat).toHaveBeenCalledTimes(1);
    const operationId = vi.mocked(recordSendChat).mock.calls[0]![0];
    expect(operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(saveChatLogOptimistic).toHaveBeenCalledWith('superbeginner', chat, { operationId });
    expect(mergeChat).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'server-uuid' }));
  });

  it('入退室などのシステム発言（sendChat / saveAndMerge）は send-chat として記録しない', async () => {
    const { result } = setup();
    const chat = createAdminChat({
      roomId: 'superbeginner',
      message: 'Welcome',
      userColor: '#000',
    });

    await act(async () => {
      await result.current.sendChat('superbeginner', chat);
      await result.current.saveAndMerge('superbeginner', chat);
    });

    expect(recordSendChat).not.toHaveBeenCalled();
    expect(saveChatLogOptimistic).toHaveBeenCalledWith('superbeginner', chat, undefined);
  });

  it('巫女メッセージは send-chat として記録しない', async () => {
    const { result } = setup();
    await act(async () => {
      await result.current.sendFortuneIfCommand('superbeginner', 'おみくじ', 'ゆい');
    });
    expect(saveChatLogOptimistic).toHaveBeenCalledTimes(1);
    expect(recordSendChat).not.toHaveBeenCalled();
  });

  it('sendChat は楽観表示してから保存結果でマージする', async () => {
    const { result, addOptimistic, mergeChat } = setup();
    const chat = createAdminChat({ roomId: 'superbeginner', message: 'やあ', userColor: '#000' });

    await act(async () => {
      await result.current.sendChat('superbeginner', chat);
    });

    expect(addOptimistic).toHaveBeenCalledWith(chat);
    expect(mergeChat).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'server-uuid' }));
  });

  it('おみくじコマンド以外では巫女メッセージを送らない', async () => {
    const { result, addOptimistic } = setup();

    await act(async () => {
      await result.current.sendFortuneIfCommand('superbeginner', 'こんにちは', 'ゆい');
    });

    expect(addOptimistic).not.toHaveBeenCalled();
  });

  it('おみくじコマンドなら巫女メッセージを続けて送る', async () => {
    const { result, addOptimistic } = setup();

    await act(async () => {
      await result.current.sendFortuneIfCommand('superbeginner', 'おみくじ', 'ゆい');
    });

    expect(addOptimistic).toHaveBeenCalledTimes(1);
    expect(addOptimistic.mock.calls[0][0]).toMatchObject({
      system: true,
      metadata: { kind: 'fortune', avatar: 'miko1' },
    });
  });

  it('巫女メッセージの保存失敗はサイレントに無視する', async () => {
    const { saveChatLogOptimistic } = await import('@features/chat/api/chatApi');
    vi.mocked(saveChatLogOptimistic).mockRejectedValueOnce(new Error('boom'));

    const { result } = setup();

    await act(async () => {
      await expect(
        result.current.sendFortuneIfCommand('superbeginner', 'おみくじ', 'ゆい')
      ).resolves.toBeUndefined();
    });
  });
});
