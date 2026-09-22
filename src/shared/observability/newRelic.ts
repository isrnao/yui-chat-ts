// New Relic Browser 監視（spec observability-new-relic Task 3 / Requirement 5）。
//
// - 初回描画のあと、アイドル時に動的 import で読み込む（初期バンドルに含めない）。
// - SSR / 事前レンダリング / テスト、または VITE_NEW_RELIC_* が未設定なら何もしない。
// - 分散トレーシング: Supabase（save-chat）への通信にだけ W3C traceparent / tracestate を付ける。
//   New Relic 独自の newrelic ヘッダーは付けない（R5.1〜5.2）。バックエンドは sampled フラグに
//   関係なく全件記録する。
// - 使う機能は Ajax / JSErrors / SoftNav（インタラクション）/ GenericEvents / PageView だけ。
//   Session Replay・Session Trace・Logging は読み込まない（R4.5）。
// - 本文・名前・IP・UA はカスタム属性に渡さない（R4.6）。

type Interaction = {
  setName(name: string): Interaction;
  setAttribute(key: string, value: string | number | boolean): Interaction;
};
type BrowserApi = { interaction(): Interaction };

let agent: BrowserApi | null = null;
let loading: Promise<void> | null = null;

interface BrowserConfig {
  accountId: string;
  trustKey: string;
  agentId: string;
  licenseKey: string;
  applicationId: string;
  supabaseUrl: string;
}

export function readConfig(env: Record<string, string | undefined>): BrowserConfig | null {
  const config = {
    accountId: env.VITE_NEW_RELIC_ACCOUNT_ID,
    trustKey: env.VITE_NEW_RELIC_TRUST_KEY,
    agentId: env.VITE_NEW_RELIC_AGENT_ID,
    licenseKey: env.VITE_NEW_RELIC_BROWSER_KEY,
    applicationId: env.VITE_NEW_RELIC_APP_ID,
    supabaseUrl: env.VITE_SUPABASE_URL,
  };
  return Object.values(config).every((v) => typeof v === 'string' && v.length > 0)
    ? (config as BrowserConfig)
    : null;
}

/** Browser エージェントの init 設定（テストで中身を確認できるよう分けている） */
export function buildInit(supabaseUrl: string) {
  return {
    distributed_tracing: {
      enabled: true,
      cors_use_newrelic_header: false,
      cors_use_tracecontext_headers: true,
      allowed_origins: [new URL(supabaseUrl).origin],
    },
    privacy: { cookies_enabled: true },
    ajax: { deny_list: ['bam.nr-data.net'] },
    session_replay: { enabled: false },
    session_trace: { enabled: false },
  };
}

/**
 * Browser エージェントを読み込む。何度呼んでも 1 回だけ読み込む。
 * 読み込みや初期化に失敗してもアプリの動作には影響させない。
 */
export function initNewRelicBrowser(
  env: Record<string, string | undefined> = import.meta.env as Record<string, string | undefined>
): Promise<void> {
  if (loading) return loading;
  if (typeof window === 'undefined' || import.meta.env.MODE === 'test') {
    return Promise.resolve();
  }
  const config = readConfig(env);
  if (!config) return Promise.resolve();

  loading = (async () => {
    try {
      const [
        { Agent },
        { Ajax },
        { JSErrors },
        { SoftNav },
        { GenericEvents },
        { PageViewEvent },
        { PageViewTiming },
      ] = await Promise.all([
        import('@newrelic/browser-agent/loaders/agent'),
        import('@newrelic/browser-agent/features/ajax'),
        import('@newrelic/browser-agent/features/jserrors'),
        import('@newrelic/browser-agent/features/soft_navigations'),
        import('@newrelic/browser-agent/features/generic_events'),
        import('@newrelic/browser-agent/features/page_view_event'),
        import('@newrelic/browser-agent/features/page_view_timing'),
      ]);
      const instance = new Agent({
        features: [Ajax, JSErrors, SoftNav, GenericEvents, PageViewEvent, PageViewTiming],
        init: buildInit(config.supabaseUrl),
        info: {
          beacon: 'bam.nr-data.net',
          errorBeacon: 'bam.nr-data.net',
          licenseKey: config.licenseKey,
          applicationID: config.applicationId,
          sa: 1,
        },
        loader_config: {
          accountID: config.accountId,
          trustKey: config.trustKey,
          agentID: config.agentId,
          licenseKey: config.licenseKey,
          applicationID: config.applicationId,
        },
      });
      agent = instance as unknown as BrowserApi;
    } catch (err) {
      // 監視が読めなくてもチャットは使える
      console.warn(
        '[newrelic] browser agent failed to load',
        err instanceof Error ? err.name : err
      );
    }
  })();
  return loading;
}

/**
 * 送信操作を 1 つのインタラクション（send-chat）として記録する（R5.5）。
 * 操作 ID は save-chat へ送る x-chat-operation-id と同じ値（R5.8）。
 * エージェントが未読込なら何もしない。
 */
export function recordSendChat(operationId: string): void {
  try {
    agent?.interaction().setName('send-chat').setAttribute('chatOperationId', operationId);
  } catch {
    // 計測の失敗で送信を止めない
  }
}

/** テスト用 */
export function __resetForTest(api: BrowserApi | null = null): void {
  agent = api;
  loading = null;
}
