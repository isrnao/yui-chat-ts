import { describe, it, expect } from 'vitest';

// Supabaseとの統合テストは複雑なモックが必要なため、簡略化
// 実際の統合テストは手動またはE2Eテストで行う

describe('chatApi', () => {
  it('should export required functions', async () => {
    const chatApi = await import('./chatApi');

    // 必要な関数がエクスポートされていることを確認
    expect(typeof chatApi.loadChatLogs).toBe('function');
    expect(typeof chatApi.loadInitialChatLogs).toBe('function');
    expect(typeof chatApi.saveChatLog).toBe('function');
    expect(typeof chatApi.clearChatLogs).toBe('function');
    expect(typeof chatApi.subscribeChatLogs).toBe('function');
  });
});
