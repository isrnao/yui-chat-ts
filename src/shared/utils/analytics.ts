export const GA_MEASUREMENT_ID = 'G-S3LCSTZBES';

export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (typeof window !== 'undefined' && window.gtag) {
    window.gtag('event', name, params);
  }
}
