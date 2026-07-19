import { describe, it, expect } from 'vitest';
import { CHAT_ROOM_IDS, CHAT_ROOMS, ROOM_CATEGORY_LABELS, getRoomMeta } from './rooms';

describe('rooms', () => {
  describe('ROOM_DESCRIPTIONS (手書き紹介文の品質保証)', () => {
    it('全部屋の紹介文が重複しない (テンプレ一括生成の再発防止)', () => {
      const descriptions = CHAT_ROOM_IDS.map((id) => CHAT_ROOMS[id].description);
      const unique = new Set(descriptions);
      expect(unique.size).toBe(descriptions.length);
    });

    it('紹介文は 70〜120 文字に収まる (meta description として適切な長さ)', () => {
      const outOfRange = CHAT_ROOM_IDS.filter((id) => {
        const len = [...CHAT_ROOMS[id].description].length;
        return len < 70 || len > 120;
      }).map((id) => `${id}: ${[...CHAT_ROOMS[id].description].length}文字`);

      expect(outOfRange).toEqual([]);
    });

    it('紹介文にテンプレ文 (「でゆっくりおしゃべりしましょう。」) が残っていない', () => {
      for (const id of CHAT_ROOM_IDS) {
        expect(CHAT_ROOMS[id].description).not.toContain('でゆっくりおしゃべりしましょう。');
      }
    });
  });

  describe('category', () => {
    it('全部屋がカテゴリを持ち、表示ラベルが定義されている', () => {
      for (const id of CHAT_ROOM_IDS) {
        const meta = getRoomMeta(id);
        expect(ROOM_CATEGORY_LABELS[meta.category]).toBeTruthy();
      }
    });
  });
});
