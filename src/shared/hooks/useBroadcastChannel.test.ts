import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useBroadcastChannel } from './useBroadcastChannel';

// BroadcastChannelのモックを作成
let mockChannelInstance: any;

const createMockChannel = () => ({
  postMessage: vi.fn(),
  close: vi.fn(),
  onmessage: null as ((event: MessageEvent) => void) | null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
});

// グローバルなBroadcastChannelをモック
global.BroadcastChannel = vi.fn(() => {
  mockChannelInstance = createMockChannel();
  return mockChannelInstance;
}) as any;

describe('useBroadcastChannel', () => {
  const mockOnMessage = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockChannelInstance = null;
  });

  afterEach(() => {
    // 各テスト後にchannelをクリーンアップ
    if (mockChannelInstance?.close) {
      mockChannelInstance.close();
    }
  });

  it('should create a BroadcastChannel with the given name', () => {
    renderHook(() => useBroadcastChannel('test-channel', mockOnMessage));

    expect(global.BroadcastChannel).toHaveBeenCalledWith('test-channel');
  });

  it('should return a ref containing the BroadcastChannel instance', () => {
    const { result } = renderHook(() => useBroadcastChannel('test-channel', mockOnMessage));

    // refオブジェクトが返されることを確認
    expect(result.current).toHaveProperty('current');
    expect(result.current.current).toBe(mockChannelInstance);
  });

  it('should call onMsg when a message is received', () => {
    renderHook(() => useBroadcastChannel('test-channel', mockOnMessage));

    const testData = { type: 'test', data: 'hello' };
    const mockEvent = { data: testData } as MessageEvent;

    // onmessageハンドラーが設定されることを確認
    expect(mockChannelInstance.onmessage).toBeDefined();

    // メッセージを受信
    act(() => {
      mockChannelInstance.onmessage(mockEvent);
    });

    expect(mockOnMessage).toHaveBeenCalledWith(testData);
  });

  it('should close channel and set ref to null on unmount', () => {
    const { result, unmount } = renderHook(() =>
      useBroadcastChannel('test-channel', mockOnMessage)
    );

    const closeMock = mockChannelInstance.close;
    expect(result.current.current).toBe(mockChannelInstance);

    unmount();

    expect(closeMock).toHaveBeenCalled();
    expect(result.current.current).toBeNull();
  });

  it('should recreate channel when name changes', () => {
    const { result, rerender } = renderHook(({ name, onMsg }) => useBroadcastChannel(name, onMsg), {
      initialProps: { name: 'channel1', onMsg: mockOnMessage },
    });

    expect(global.BroadcastChannel).toHaveBeenCalledWith('channel1');
    const firstChannel = mockChannelInstance;
    const firstCloseMock = firstChannel.close;

    // nameを変更してrerenderを実行
    rerender({ name: 'channel2', onMsg: mockOnMessage });

    expect(firstCloseMock).toHaveBeenCalled();
    expect(global.BroadcastChannel).toHaveBeenCalledWith('channel2');
    expect(result.current.current).toBe(mockChannelInstance);
    expect(result.current.current).not.toBe(firstChannel);
  });

  it('should recreate channel when onMsg function changes', () => {
    const newOnMessage = vi.fn();

    const { result, rerender } = renderHook(
      ({ onMsg }) => useBroadcastChannel('test-channel', onMsg),
      { initialProps: { onMsg: mockOnMessage } }
    );

    const firstChannel = mockChannelInstance;
    const firstCloseMock = firstChannel.close;

    // onMsgを変更してrerenderを実行
    rerender({ onMsg: newOnMessage });

    expect(firstCloseMock).toHaveBeenCalled();
    expect(result.current.current).toBe(mockChannelInstance);
    expect(result.current.current).not.toBe(firstChannel);

    // 新しいonMsgが正しく動作することを確認
    const testData = { type: 'test' };
    const mockEvent = { data: testData } as MessageEvent;

    act(() => {
      mockChannelInstance.onmessage(mockEvent);
    });

    expect(newOnMessage).toHaveBeenCalledWith(testData);
    expect(mockOnMessage).not.toHaveBeenCalled();
  });

  it('should handle type-safe message passing', () => {
    interface TestMessage {
      id: number;
      text: string;
    }

    const typedOnMessage = vi.fn<(data: TestMessage) => void>();

    renderHook(() => useBroadcastChannel<TestMessage>('typed-channel', typedOnMessage));

    const testMessage: TestMessage = { id: 1, text: 'hello' };
    const mockEvent = { data: testMessage } as MessageEvent;

    act(() => {
      mockChannelInstance.onmessage(mockEvent);
    });

    expect(typedOnMessage).toHaveBeenCalledWith(testMessage);
  });
});
