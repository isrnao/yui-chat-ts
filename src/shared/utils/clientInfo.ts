export async function getClientIP(): Promise<string> {
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
      } catch (error) {
        console.warn(`Failed to get IP from ${service}:`, error);
        continue;
      }
    }

    return 'unknown';
  } catch (error) {
    console.error('Failed to get client IP:', error);
    return 'unknown';
  }
}

export function getUserAgent(): string {
  return navigator.userAgent || 'unknown';
}
