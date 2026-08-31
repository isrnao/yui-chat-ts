import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadBotConfig } from './botConfig.ts';

const originalEnv = { ...process.env };

beforeEach(() => {
  for (const key of Object.keys(process.env)) {
    if (key.startsWith('BOT_') || key === 'OPENAI_API_KEY') {
      delete process.env[key];
    }
  }
});

afterEach(() => {
  Object.assign(process.env, originalEnv);
});

describe('loadBotConfig', () => {
  describe('既定値', () => {
    it('環境変数なしで既定値を返す', () => {
      const config = loadBotConfig();
      expect(config.targetRoom).toBe('superbeginner');
      expect(config.greetings).toEqual(['こんにちは']);
      expect(config.cooldownMinMs).toBe(8000);
      expect(config.cooldownMaxMs).toBe(15000);
      expect(config.responseDelayMinMs).toBe(2000);
      expect(config.responseDelayMaxMs).toBe(6000);
      expect(config.historyMessageCap).toBe(20);
      expect(config.botName).toBe('ゆいボット');
      expect(config.botColor).toBe('#9b59b6');
      expect(config.model).toBe('gpt-4o-mini');
      expect(config.webhookSecret).toBeNull();
      expect(config.openaiApiKey).toBe('');
    });
  });

  describe('環境変数からの読み込み', () => {
    it('BOT_TARGET_ROOM を読み込む', () => {
      process.env.BOT_TARGET_ROOM = 'beginner';
      expect(loadBotConfig().targetRoom).toBe('beginner');
    });

    it('OPENAI_API_KEY を読み込む', () => {
      process.env.OPENAI_API_KEY = 'sk-test-key';
      expect(loadBotConfig().openaiApiKey).toBe('sk-test-key');
    });

    it('BOT_COOLDOWN_MIN_MS を数値に変換する', () => {
      process.env.BOT_COOLDOWN_MIN_MS = '5000';
      expect(loadBotConfig().cooldownMinMs).toBe(5000);
    });

    it('BOT_HISTORY_MESSAGE_CAP=0 を正しく処理する (R8.6)', () => {
      process.env.BOT_HISTORY_MESSAGE_CAP = '0';
      expect(loadBotConfig().historyMessageCap).toBe(0);
    });

    it('BOT_TEMPERATURE を浮動小数点数に変換する', () => {
      process.env.BOT_TEMPERATURE = '1.0';
      expect(loadBotConfig().temperature).toBe(1.0);
    });

    it('BOT_TEMPERATURE 未設定は 0.7 を返す', () => {
      expect(loadBotConfig().temperature).toBe(0.7);
    });

    it('不正な整数値は既定値にフォールバックする', () => {
      process.env.BOT_COOLDOWN_MIN_MS = 'invalid';
      expect(loadBotConfig().cooldownMinMs).toBe(8000);
    });

    it('BOT_WEBHOOK_SECRET を読み込む', () => {
      process.env.BOT_WEBHOOK_SECRET = 'my-secret';
      expect(loadBotConfig().webhookSecret).toBe('my-secret');
    });
  });

  describe('BOT_GREETINGS のパース', () => {
    it('改行区切りの文字列をパースする', () => {
      process.env.BOT_GREETINGS = 'こんにちは\nよろしくね';
      expect(loadBotConfig().greetings).toEqual(['こんにちは', 'よろしくね']);
    });

    it('JSON 配列をパースする', () => {
      process.env.BOT_GREETINGS = '["hello","world"]';
      expect(loadBotConfig().greetings).toEqual(['hello', 'world']);
    });

    it('空の値は既定の挨拶を返す', () => {
      process.env.BOT_GREETINGS = '';
      expect(loadBotConfig().greetings).toEqual(['こんにちは']);
    });

    it('単一の挨拶文字列は配列として返す', () => {
      process.env.BOT_GREETINGS = 'いらっしゃい';
      expect(loadBotConfig().greetings).toEqual(['いらっしゃい']);
    });
  });
});
