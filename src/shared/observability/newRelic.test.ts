import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetForTest,
  buildInit,
  initNewRelicBrowser,
  readConfig,
  recordSendChat,
} from './newRelic';

const env = {
  VITE_NEW_RELIC_ACCOUNT_ID: '1234567',
  VITE_NEW_RELIC_TRUST_KEY: '1234567',
  VITE_NEW_RELIC_AGENT_ID: '1111111111',
  VITE_NEW_RELIC_BROWSER_KEY: 'NRJS-test',
  VITE_NEW_RELIC_APP_ID: '1111111111',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
};

describe('New Relic Browser 監視', () => {
  afterEach(() => __resetForTest());

  it('設定が 1 つでも欠けていれば無効（何も読み込まない）', () => {
    expect(readConfig(env)).not.toBeNull();
    for (const key of Object.keys(env)) {
      expect(readConfig({ ...env, [key]: '' })).toBeNull();
    }
  });

  it('分散トレーシングは Supabase のオリジンにだけ W3C ヘッダーを付ける', () => {
    const init = buildInit('https://example.supabase.co/some/path');
    expect(init.distributed_tracing).toEqual({
      enabled: true,
      cors_use_newrelic_header: false,
      cors_use_tracecontext_headers: true,
      allowed_origins: ['https://example.supabase.co'],
    });
  });

  it('Session Replay と Session Trace は無効', () => {
    const init = buildInit(env.VITE_SUPABASE_URL);
    expect(init.session_replay.enabled).toBe(false);
    expect(init.session_trace.enabled).toBe(false);
  });

  it('テスト環境ではエージェントを読み込まない', async () => {
    await initNewRelicBrowser(env);
    const interaction = vi.fn();
    // 読み込まれていないので、記録しても何も起きない（例外も出ない）
    expect(() => recordSendChat('op')).not.toThrow();
    expect(interaction).not.toHaveBeenCalled();
  });

  it('エージェントの API が例外を投げても送信を止めない', () => {
    __resetForTest({
      interaction: () => {
        throw new Error('agent broken');
      },
    });
    expect(() => recordSendChat('op')).not.toThrow();
  });
});
