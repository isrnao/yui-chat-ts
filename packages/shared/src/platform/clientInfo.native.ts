import { Platform } from 'react-native';

export type ClientInfoFetcher = typeof fetch;

export async function getClientIP(
  fetcher: ClientInfoFetcher | undefined = typeof fetch !== 'undefined' ? fetch : undefined,
): Promise<string> {
  if (!fetcher) {
    return 'unknown';
  }

  const services = [
    'https://api.ipify.org?format=json',
    'https://httpbin.org/ip',
    'https://jsonip.com',
  ];

  for (const service of services) {
    try {
      const response = await fetcher(service);
      const data = await response.json();
      if (data.ip) return data.ip as string;
      if (data.origin) return data.origin as string;
    } catch (error) {
      continue;
    }
  }

  return 'unknown';
}

export function getUserAgent(): string {
  return `react-native/${Platform.OS} ${Platform.Version}`;
}
