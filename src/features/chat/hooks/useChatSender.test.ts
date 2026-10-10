import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import type { Chat } from '@features/chat/types';
import { saveChatLogOptimistic } from '@features/chat/api/saveChat';
import { recordSendChat } from '@shared/observability/newRelic';
import { createAdminChat, useChatSender } from './useChatSender';

vi.mock('@features/chat/api/saveChat', () => ({
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
  it('管理人発言の体裁を save-chat と同じ関数（messages.ts）で組み立てる', () => {
    const chat = createAdminChat({
      roomId: 'superbeginner',
      event: 'enter',
      name: 'ゆい',
      color: '#ff69b4',
      visitCount: 3,
    });

    expect(chat.room_id).toBe('superbeginner');
    expect(chat.name).toBe('管理人');
    expect(chat.color).toBe('#ffffff');
    expect(chat.message).toBe('ゆい さん、Welcome to お気楽チャット☆');
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

  it('楽観的な行の色は送った色のまま（保存の応答の metadata で確定する）', () => {
    const chat = createAdminChat({
      roomId: 'superbeginner',
      event: 'exit',
      name: 'ゆい',
      color: 'あか',
    });
    expect(chat.message).toBe('ゆいさん、またきておくれやすぅ。');
    expect(chat.metadata?.userColor).toBe('あか');
  });
});

describe('useChatSender', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sendUserMessage は操作 ID を 1 つ発行し、send-chat の記録と保存に同じ ID を使う', async () => {
    const { result, mergeChat } = setup();
    const chat = {
      ...createAdminChat({ roomId: 'superbeginner', event: 'enter', name: 'x', color: '#000' }),
      system: false,
    };

    await act(async () => {
      await result.current.sendUserMessage('superbeginner', chat);
    });

    expect(recordSendChat).toHaveBeenCalledTimes(1);
    const operationId = vi.mocked(recordSendChat).mock.calls[0]![0];
    expect(operationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    );
    expect(saveChatLogOptimistic).toHaveBeenCalledWith(
      'superbeginner',
      chat,
      expect.objectContaining({ operationId })
    );
    expect(mergeChat).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'server-uuid' }));
  });

  it('入退室（sendAdminEvent）は op で送り、send-chat として記録しない', async () => {
    const { result, addOptimistic } = setup();
    const input = { event: 'enter', name: 'ゆい', color: '#000', visitCount: 2 } as const;

    await act(async () => {
      await result.current.sendAdminEvent('superbeginner', input);
    });

    expect(recordSendChat).not.toHaveBeenCalled();
    expect(addOptimistic).toHaveBeenCalledWith(
      expect.objectContaining({ name: '管理人', message: 'ゆい さん、Welcome to お気楽チャット☆' })
    );
    expect(saveChatLogOptimistic).toHaveBeenCalledWith(
      'superbeginner',
      expect.objectContaining({ name: '管理人' }),
      expect.objectContaining({ admin: input })
    );
  });

  it('send は楽観表示してから保存結果でマージする', async () => {
    const { result, addOptimistic, mergeChat } = setup();
    const chat = createAdminChat({
      roomId: 'superbeginner',
      event: 'exit',
      name: 'やあ',
      color: '#000',
    });

    await act(async () => {
      await result.current.send('superbeginner', chat);
    });

    expect(addOptimistic).toHaveBeenCalledWith(chat);
    expect(mergeChat).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'server-uuid' }));
  });

  it('同じ要求でサーバーが保存した発言（おみくじの巫女の返事）もログへマージする', async () => {
    const miko = {
      uuid: 'miko-uuid',
      room_id: 'superbeginner' as const,
      name: '巫女',
      color: 'hotpink',
      message: '大吉で〜す。＞ゆいさん',
      time: 2,
      system: true,
      ip_masked: '',
      ua: '',
    };
    vi.mocked(saveChatLogOptimistic).mockImplementationOnce((_roomId, chat, options) => {
      options?.onExtra?.([miko]);
      return Promise.resolve({ ...chat, uuid: 'server-uuid', optimistic: false });
    });
    const { result, mergeChat } = setup();
    const chat = {
      ...createAdminChat({ roomId: 'superbeginner', event: 'enter', name: 'ゆい', color: '#000' }),
      name: 'ゆい',
      message: 'おみくじ',
      system: false,
    };

    await act(async () => {
      await result.current.sendUserMessage('superbeginner', chat);
    });

    expect(mergeChat).toHaveBeenCalledWith(miko);
    expect(mergeChat).toHaveBeenCalledWith(expect.objectContaining({ uuid: 'server-uuid' }));
    // 巫女の返事のために 2 回目の保存はしない（往復 1 回）
    expect(saveChatLogOptimistic).toHaveBeenCalledTimes(1);
  });
});
