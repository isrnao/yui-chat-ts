import { afterEach, describe, expect, it, vi } from 'vitest';

// エージェント本体は読み込まず、コンストラクタの呼び出しと渡された設定だけを確かめる
const interaction = { setName: vi.fn(), setAttribute: vi.fn() };
interaction.setName.mockReturnValue(interaction);
interaction.setAttribute.mockReturnValue(interaction);
const Agent = vi.fn(function (this: { interaction: () => typeof interaction }) {
  this.interaction = () => interaction;
});
vi.mock('@newrelic/browser-agent/loaders/agent', () => ({ Agent }));
vi.mock('@newrelic/browser-agent/features/ajax', () => ({ Ajax: 'Ajax' }));
vi.mock('@newrelic/browser-agent/features/jserrors', () => ({ JSErrors: 'JSErrors' }));
vi.mock('@newrelic/browser-agent/features/soft_navigations', () => ({ SoftNav: 'SoftNav' }));
vi.mock('@newrelic/browser-agent/features/generic_events', () => ({
  GenericEvents: 'GenericEvents',
}));
vi.mock('@newrelic/browser-agent/features/page_view_event', () => ({
  PageViewEvent: 'PageViewEvent',
}));
vi.mock('@newrelic/browser-agent/features/page_view_timing', () => ({
  PageViewTiming: 'PageViewTiming',
}));

const { __resetForTest, buildInit, initNewRelicBrowser, readConfig, recordSendChat } =
  await import('./newRelic');

const env = {
  VITE_NEW_RELIC_ACCOUNT_ID: '1234567',
  VITE_NEW_RELIC_TRUST_KEY: '1234567',
  VITE_NEW_RELIC_AGENT_ID: '1111111111',
  VITE_NEW_RELIC_BROWSER_KEY: 'NRJS-test',
  VITE_NEW_RELIC_APP_ID: '2222222222',
  VITE_SUPABASE_URL: 'https://example.supabase.co',
};

describe('New Relic Browser 監視', () => {
  afterEach(() => {
    __resetForTest();
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('設定が 1 つでも欠けていれば無効', () => {
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
    expect(init.session_replay.enabled).toBe(false);
    expect(init.session_trace.enabled).toBe(false);
  });

  it('テスト環境ではエージェントを作らない', async () => {
    await initNewRelicBrowser(env);
    expect(Agent).not.toHaveBeenCalled();
    recordSendChat('op');
    expect(interaction.setName).not.toHaveBeenCalled();
  });

  it('本番では 1 回だけ読み込み、使う機能と設定を渡し、send-chat を記録できる', async () => {
    vi.stubEnv('MODE', 'production');
    await Promise.all([initNewRelicBrowser(env), initNewRelicBrowser(env)]);

    expect(Agent).toHaveBeenCalledTimes(1);
    const [options] = Agent.mock.calls[0] as unknown as [Record<string, never>];
    expect(options.features).toEqual([
      'Ajax',
      'JSErrors',
      'SoftNav',
      'GenericEvents',
      'PageViewEvent',
      'PageViewTiming',
    ]);
    expect(options.init).toEqual(buildInit(env.VITE_SUPABASE_URL));
    expect(options.info).toMatchObject({ applicationID: '2222222222', licenseKey: 'NRJS-test' });
    expect(options.loader_config).toMatchObject({ accountID: '1234567', agentID: '1111111111' });

    recordSendChat('op-1');
    expect(interaction.setName).toHaveBeenCalledWith('send-chat');
    expect(interaction.setAttribute).toHaveBeenCalledWith('chatOperationId', 'op-1');
  });

  it('本番でも設定が欠けていれば読み込まない', async () => {
    vi.stubEnv('MODE', 'production');
    await initNewRelicBrowser({ ...env, VITE_NEW_RELIC_APP_ID: '' });
    expect(Agent).not.toHaveBeenCalled();
  });

  it('エージェントの初期化に失敗してもアプリには伝えない', async () => {
    vi.stubEnv('MODE', 'production');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    Agent.mockImplementationOnce(() => {
      throw new Error('agent init failed');
    });
    await expect(initNewRelicBrowser(env)).resolves.toBeUndefined();
    expect(() => recordSendChat('op')).not.toThrow();
    expect(interaction.setName).not.toHaveBeenCalled();
    warn.mockRestore();
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
