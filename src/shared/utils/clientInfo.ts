let cachedIPPromise: Promise<string> | null = null;

const IP_FETCH_TIMEOUT_MS = 3000;
const IP_SERVICES = [
  'https://api.ipify.org?format=json',
  'https://httpbin.org/ip',
  'https://jsonip.com',
];

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function fetchClientIP(): Promise<string> {
  for (const service of IP_SERVICES) {
    try {
      const response = await fetchWithTimeout(service, IP_FETCH_TIMEOUT_MS);
      const data = await response.json();
      if (data.ip) return data.ip;
      if (data.origin) return data.origin;
    } catch {
      // タイムアウト/ネットワークエラーは次のサービスへフォールバック
      continue;
    }
  }
  return 'unknown';
}

/**
 * クライアントIPを取得する。
 * セッション中は同じ Promise を返すため、外部サービスへのアクセスは1回のみ。
 * 'unknown' が返った場合はキャッシュをクリアし、次回呼び出しで再試行する。
 */
export function getClientIP(): Promise<string> {
  if (!cachedIPPromise) {
    const promise = fetchClientIP();
    cachedIPPromise = promise;
    // 失敗（'unknown'）時はキャッシュを破棄して次回再試行できるようにする
    promise.then((ip) => {
      if (ip === 'unknown' && cachedIPPromise === promise) {
        cachedIPPromise = null;
      }
    });
  }
  return cachedIPPromise;
}

/** キャッシュをクリア（テストや再試行用） */
export function resetClientIPCache(): void {
  cachedIPPromise = null;
}

/**
 * 入室前にIPを先行取得する（getClientIP に委譲）。
 * 入室フォーム操作時などユーザーインタラクション発生タイミングで呼ぶ想定。
 */
export function prefetchClientIP(): void {
  void getClientIP();
}

export function getUserAgent(): string {
  return navigator.userAgent || 'unknown';
}
