import { describe, it, expect, vi } from 'vitest';
import {
  generateChatId,
  isUUIDv7,
  sortChatsByTime,
  extractTimestampFromUUIDv7,
  benchmarkUUIDGeneration,
} from '@shared/utils/uuid';

describe('UUID v7 Utilities', () => {
  describe('generateChatId', () => {
    it('should generate valid UUID v7', () => {
      const id = generateChatId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      expect(isUUIDv7(id)).toBe(true);
    });

    it('should generate unique IDs', () => {
      const ids = Array.from({ length: 1000 }, () => generateChatId());
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(1000);
    });
  });

  describe('isUUIDv7', () => {
    it('should identify UUID v7 correctly', () => {
      const uuidv7 = generateChatId();
      expect(isUUIDv7(uuidv7)).toBe(true);
    });

    it('should reject non-UUID v7 strings', () => {
      expect(isUUIDv7('not-a-uuid')).toBe(false);
      expect(isUUIDv7('550e8400-e29b-41d4-a716-446655440000')).toBe(false); // UUID v4
      expect(isUUIDv7('')).toBe(false);
    });
  });

  describe('sortChatsByTime', () => {
    it('should sort UUID v7 chats by ID efficiently', () => {
      const chats = [
        { uuid: generateChatId(), time: Date.now() + 1000 },
        { uuid: generateChatId(), time: Date.now() + 2000 },
        { uuid: generateChatId(), time: Date.now() + 3000 },
      ];

      // UUID v7は時間順序性があるため、後で生成されたIDは辞書順で後になる
      const sorted = sortChatsByTime(chats);

      // 降順（新しいものが先）でソートされることを確認
      expect(sorted[0].uuid > sorted[1].uuid).toBe(true);
      expect(sorted[1].uuid > sorted[2].uuid).toBe(true);
    });

    it('should handle mixed UUID versions correctly', () => {
      const chats = [
        { uuid: 'old-uuid-v4-format-123456789012', time: 1000 },
        { uuid: generateChatId(), time: 2000 },
      ];

      const sorted = sortChatsByTime(chats);

      // timeベースでソートされることを確認
      expect(sorted[0].time).toBeGreaterThan(sorted[1].time);
    });
  });

  describe('extractTimestampFromUUIDv7', () => {
    it('should extract timestamp from UUID v7', () => {
      const beforeGeneration = Date.now();
      const id = generateChatId();
      const afterGeneration = Date.now();

      const extractedTimestamp = extractTimestampFromUUIDv7(id);

      expect(extractedTimestamp).not.toBeNull();
      // セキュリティオフセットにより、若干の誤差があることを考慮
      expect(extractedTimestamp!).toBeGreaterThanOrEqual(beforeGeneration);
      expect(extractedTimestamp!).toBeLessThanOrEqual(afterGeneration + 30000); // 最大30秒のオフセット
    });

    it('should return null for non-UUID v7', () => {
      expect(extractTimestampFromUUIDv7('not-a-uuid')).toBeNull();
      expect(extractTimestampFromUUIDv7('550e8400-e29b-41d4-a716-446655440000')).toBeNull();
    });
  });

  describe('benchmarkUUIDGeneration', () => {
    it('should run benchmark without errors', () => {
      const consoleSpy = vi.spyOn(console, 'time');
      const consoleEndSpy = vi.spyOn(console, 'timeEnd');

      benchmarkUUIDGeneration(100); // 小さな数で高速テスト

      expect(consoleSpy).toHaveBeenCalledWith('UUID v7 generation');
      expect(consoleSpy).toHaveBeenCalledWith('UUID v4 generation');
      expect(consoleEndSpy).toHaveBeenCalledWith('UUID v7 generation');
      expect(consoleEndSpy).toHaveBeenCalledWith('UUID v4 generation');

      consoleSpy.mockRestore();
      consoleEndSpy.mockRestore();
    });
  });
});

describe('Performance Integration Tests', () => {
  it('should demonstrate UUID v7 sorting performance', () => {
    // 大量のUUID v7チャットを生成
    const largeDataset = Array.from({ length: 10000 }, (_, i) => ({
      uuid: generateChatId(),
      time: Date.now() + i,
      message: `Message ${i}`,
    }));

    const startTime = performance.now();
    const sorted = sortChatsByTime(largeDataset);
    const endTime = performance.now();

    // ソートが正しく動作することを確認
    expect(sorted.length).toBe(10000);

    // パフォーマンス測定（通常は100ms以下であることが期待される）
    const duration = endTime - startTime;
    console.log(`Sorting 10,000 UUID v7 chats took: ${duration.toFixed(2)}ms`);

    // 過度に遅くないことを確認（CI環境を考慮して緩い条件）
    expect(duration).toBeLessThan(1000);
  });
});
