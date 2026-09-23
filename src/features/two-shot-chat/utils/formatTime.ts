const formatter = new Intl.DateTimeFormat('ja-JP', {
  timeZone: 'Asia/Tokyo',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * ログの時刻（原作と同じ日本時間の HH:MM）。ログは SSG しないので、サーバーとブラウザのタイムゾーンの違いは
 * hydration に影響しない。
 */
export function formatTime(at: number): string {
  return formatter.format(at);
}
