// 時刻表示の整形ユーティリティ
export function formatTime(time: number): string {
  const d = new Date(time);
  return `${d.getHours().toString().padStart(2, '0')}:${d
    .getMinutes()
    .toString()
    .padStart(2, '0')}:${d.getSeconds().toString().padStart(2, '0')}`;
}

// 日付＋時刻表示の整形ユーティリティ
export function formatCountTime(ts: number): string {
  const d = new Date(ts);
  const w = ['日', '月', '火', '水', '木', '金', '土'];
  return `${d.getMonth() + 1}/${d.getDate()}(${w[d.getDay()]})${d
    .getHours()
    .toString()
    .padStart(2, '0')}:${d.getMinutes().toString().padStart(2, '0')}`;
}

// レガシー（ゆいちゃっと）互換の日時表示ユーティリティ
// 例: 1357124400000 → "01/02(Wed) 20:00"
const EN_WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

export function formatLegacyDateTime(time: number): string {
  const d = new Date(time);
  const mm = (d.getMonth() + 1).toString().padStart(2, '0');
  const dd = d.getDate().toString().padStart(2, '0');
  const hh = d.getHours().toString().padStart(2, '0');
  const mi = d.getMinutes().toString().padStart(2, '0');
  return `${mm}/${dd}(${EN_WEEKDAYS[d.getDay()]}) ${hh}:${mi}`;
}

/**
 * IP アドレスの末尾を伏せる。
 * レガシー風の発言末尾表示を保ちつつ、生の IP を画面に出さないための整形。
 * 例: "219.107.106.253" → "219.107.106.*" / "2001:db8::1" → "2001:db8::*"
 */
export function maskIpAddress(ip: string): string {
  if (!ip) return '';

  const v4 = ip.match(/^(\d{1,3}\.\d{1,3}\.\d{1,3})\.\d{1,3}$/);
  if (v4) return `${v4[1]}.*`;

  // IPv6: 上位3ブロックだけ残す
  if (ip.includes(':')) return `${ip.split(':').slice(0, 3).join(':')}:*`;

  // 想定外の形式は全体を伏せる
  return '*';
}
