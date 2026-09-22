// save-chat のトレース（New Relic へ OTLP/HTTP JSON で送る）。
//
// OpenTelemetry SDK は使わない。本番の Edge Runtime はリクエストごとに新しいワーカーを
// 起動するため、SDK 一式の読み込み（約 +144ms）がすべての送信にかかってしまう
// （.kiro/specs/observability-new-relic/design.md「本番 Spike」）。ここでは必要な機能だけを
// 依存なしで持つ。
//
// - Context は暗黙の「アクティブなスパン」を使わず、SpanContext を引数で明示的に渡す。
//   応答後に EdgeRuntime.waitUntil で動く triage も、同じトレースの子として記録できる。
// - 受け取った traceparent の sampled フラグに関係なく全件記録する。アラートは失敗スパンを
//   数えるので、呼び出し元が記録しないと決めた送信の失敗を見落とさないため。
// - 送信の失敗はチャット処理に影響させない（flush は reject しない）。

export interface SpanContext {
  traceId: string;
  spanId: string;
}

export type AttributeValue = string | number | boolean;
export type Attributes = Record<string, AttributeValue | undefined>;

export const SpanKind = { INTERNAL: 1, SERVER: 2, CLIENT: 3 } as const;
type SpanKindValue = (typeof SpanKind)[keyof typeof SpanKind];

const STATUS_ERROR = 2;
/** PostgREST のエラー文は先頭だけ残す（spec R4.1） */
const MAX_DB_MESSAGE = 500;

const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;
const ZERO_TRACE = '0'.repeat(32);
const ZERO_SPAN = '0'.repeat(16);

function randomHex(bytes: number): string {
  const buf = crypto.getRandomValues(new Uint8Array(bytes));
  return Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** W3C traceparent を読む。形式が不正なら null（新しいトレースを始める）。 */
export function parseTraceparent(header: string | null): SpanContext | null {
  const match = header ? TRACEPARENT.exec(header.trim().toLowerCase()) : null;
  if (!match) return null;
  const [, traceId, spanId] = match as unknown as [string, string, string];
  if (traceId === ZERO_TRACE || spanId === ZERO_SPAN) return null;
  return { traceId, spanId };
}

/** 送信先へ渡す traceparent。バックエンドは全件記録するので sampled=01 を付ける。 */
export function formatTraceparent(ctx: SpanContext): string {
  return `00-${ctx.traceId}-${ctx.spanId}-01`;
}

function nowUnixNano(): bigint {
  // performance.timeOrigin + now() でミリ秒未満まで取る（本番で時刻が正しいことを確認済み）
  return BigInt(Math.round((performance.timeOrigin + performance.now()) * 1e6));
}

export interface FinishedSpan {
  name: string;
  kind: SpanKindValue;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  start: bigint;
  end: bigint;
  attributes: Record<string, AttributeValue>;
  error: boolean;
}

export class Span {
  readonly context: SpanContext;
  private readonly attributes: Record<string, AttributeValue> = {};
  private readonly start = nowUnixNano();
  private error = false;
  private ended = false;

  constructor(
    private readonly tracer: Tracer,
    readonly name: string,
    private readonly kind: SpanKindValue,
    private readonly parent: SpanContext | null,
    attributes: Attributes = {}
  ) {
    this.context = { traceId: parent?.traceId ?? randomHex(16), spanId: randomHex(8) };
    this.setAttributes(attributes);
  }

  setAttribute(key: string, value: AttributeValue | undefined): this {
    if (value !== undefined) this.attributes[key] = value;
    return this;
  }

  setAttributes(attributes: Attributes): this {
    for (const [key, value] of Object.entries(attributes)) this.setAttribute(key, value);
    return this;
  }

  /**
   * 失敗として記録する。code は列挙値（例: db_insert_failed）。例外文は HTTP の応答本文を
   * 含み得るのでそのまま載せない（spec R4.1）。
   */
  fail(code: string, attributes: Attributes = {}): this {
    this.error = true;
    return this.setAttribute('error.code', code).setAttributes(attributes);
  }

  /** PostgREST のエラー。code と message（先頭 500 文字）を残してよい（spec R4.1）。 */
  failDb(code: string, error: { code?: string; message?: string }): this {
    return this.fail(code, {
      'db.response.status_code': error.code,
      'error.message': error.message?.slice(0, MAX_DB_MESSAGE),
    });
  }

  /** 例外は種類（name）だけを残す。 */
  failException(code: string, err: unknown): this {
    const type = err instanceof Error ? err.name : typeof err;
    return this.fail(code, { 'error.type': type });
  }

  get failed(): boolean {
    return this.error;
  }

  end(): void {
    if (this.ended) return;
    this.ended = true;
    this.tracer.record({
      name: this.name,
      kind: this.kind,
      traceId: this.context.traceId,
      spanId: this.context.spanId,
      parentSpanId: this.parent?.spanId,
      start: this.start,
      end: nowUnixNano(),
      attributes: { ...this.attributes },
      error: this.error,
    });
  }
}

export type Send = (url: string, init: RequestInit) => Promise<Response>;

export interface TracerOptions {
  serviceName: string;
  environment: string;
  /** 未設定なら記録はするが送らない（ローカル・テスト用） */
  licenseKey?: string;
  endpoint?: string;
  send?: Send;
  timeoutMs?: number;
}

export class Tracer {
  private queue: FinishedSpan[] = [];
  private readonly send: Send;

  constructor(private readonly options: TracerOptions) {
    this.send = options.send ?? ((url, init) => fetch(url, init));
  }

  get enabled(): boolean {
    return Boolean(this.options.licenseKey);
  }

  startSpan(
    name: string,
    parent: SpanContext | null,
    kind: SpanKindValue = SpanKind.INTERNAL,
    attributes: Attributes = {}
  ): Span {
    return new Span(this, name, kind, parent, attributes);
  }

  record(span: FinishedSpan): void {
    if (!this.enabled) return;
    this.queue.push(span);
  }

  /** テスト用: 終了済みでまだ送っていないスパン */
  pending(): readonly FinishedSpan[] {
    return this.queue;
  }

  /**
   * 終了済みのスパンを送る。送ったものはキューから外すので、応答時と triage 終了時の
   * 2 回の flush で同じスパンが重複しない。reject しない。
   */
  async flush(): Promise<void> {
    if (!this.enabled || this.queue.length === 0) return;
    const batch = this.queue;
    this.queue = [];
    try {
      const res = await this.send(`${this.options.endpoint ?? defaultEndpoint()}/v1/traces`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'api-key': this.options.licenseKey ?? '' },
        body: JSON.stringify(encodeSpans(batch, this.options)),
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 3000),
      });
      // 応答本文は読まない（接続を閉じるだけ）
      await res.body?.cancel();
      if (!res.ok) console.warn('[telemetry] export rejected', { status: res.status });
    } catch (err) {
      console.warn('[telemetry] export failed', {
        type: err instanceof Error ? err.name : 'unknown',
      });
    }
  }
}

function defaultEndpoint(): string {
  return (
    Deno.env.get('OTEL_EXPORTER_OTLP_ENDPOINT') ??
    (Deno.env.get('NEW_RELIC_REGION') === 'EU'
      ? 'https://otlp.eu01.nr-data.net'
      : 'https://otlp.nr-data.net')
  );
}

function encodeValue(value: AttributeValue) {
  if (typeof value === 'boolean') return { boolValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { intValue: String(value) } : { doubleValue: value };
  }
  return { stringValue: value };
}

function encodeAttributes(attributes: Record<string, AttributeValue>) {
  return Object.entries(attributes).map(([key, value]) => ({ key, value: encodeValue(value) }));
}

/** OTLP/HTTP JSON（ExportTraceServiceRequest）へ変換する */
export function encodeSpans(spans: readonly FinishedSpan[], options: TracerOptions) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: encodeAttributes({
            'service.name': options.serviceName,
            'deployment.environment.name': options.environment,
          }),
        },
        scopeSpans: [
          {
            scope: { name: 'save-chat' },
            spans: spans.map((s) => ({
              traceId: s.traceId,
              spanId: s.spanId,
              ...(s.parentSpanId ? { parentSpanId: s.parentSpanId } : {}),
              name: s.name,
              kind: s.kind,
              startTimeUnixNano: s.start.toString(),
              endTimeUnixNano: s.end.toString(),
              attributes: encodeAttributes(s.attributes),
              ...(s.error ? { status: { code: STATUS_ERROR } } : {}),
            })),
          },
        ],
      },
    ],
  };
}

/** 本番以外（supabase functions serve など）では environment を local にする */
export function detectEnvironment(supabaseUrl: string | undefined): string {
  const explicit = Deno.env.get('DEPLOYMENT_ENVIRONMENT');
  if (explicit) return explicit;
  if (!supabaseUrl) return 'local';
  return /localhost|127\.0\.0\.1|kong|host\.docker\.internal/.test(supabaseUrl)
    ? 'local'
    : 'production';
}
