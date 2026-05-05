let cachedIPPromise: Promise<string> | null = null;

async function fetchClientIP(): Promise<string> {
  try {
    // 複数のIPアドレス取得サービスを試す
    const services = [
      'https://api.ipify.org?format=json',
      'https://httpbin.org/ip',
      'https://jsonip.com',
    ];

    for (const service of services) {
      try {
        const response = await fetch(service);
        const data = await response.json();

        // サービスごとのレスポンス形式に対応
        if (data.ip) return data.ip;
        if (data.origin) return data.origin;
      } catch {
        continue;
      }
    }

    return 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * クライアントIPを取得する。
 * セッション中は同じ Promise を返すため、外部サービスへのアクセスは1回のみ。
 * 取得失敗時もキャッシュされるので、再試行したい場合は resetClientIPCache() を呼ぶ。
 */
export function getClientIP(): Promise<string> {
  if (!cachedIPPromise) {
    cachedIPPromise = fetchClientIP();
  }
  return cachedIPPromise;
}

/** キャッシュをクリア（テストや再試行用） */
export function resetClientIPCache(): void {
  cachedIPPromise = null;
}

export function getUserAgent(): string {
  return navigator.userAgent || 'unknown';
}

/** アプリ起動時に呼ぶと、入室前にIPを先行取得しておける */
export function prefetchClientIP(): void {
  if (!cachedIPPromise) {
    cachedIPPromise = fetchClientIP();
  }
}
