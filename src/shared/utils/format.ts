// 時刻表示の整形ユーティリティ
export function formatTime(time: number): string {
  const d = new Date(time);
  return `${d.getHours().toString().padStart(2, "0")}:${d
    .getMinutes()
    .toString()
    .padStart(2, "0")}:${d.getSeconds().toString().padStart(2, "0")}`;
}

// 日付＋時刻表示の整形ユーティリティ
export function formatCountTime(ts: number): string {
  const d = new Date(ts);
  const w = ["日", "月", "火", "水", "木", "金", "土"];
  return `${d.getMonth() + 1}/${d.getDate()}(${w[d.getDay()]})${d.getHours()
    .toString()
    .padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
}
