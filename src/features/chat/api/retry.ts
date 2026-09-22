/**
 * API 呼び出しのリトライと遅延の警告。chatApi と chatLogResource で共有する。
 * モジュールに可変の状態を持たない（以前は開始時刻をモジュール変数に置いており、
 * 並行した呼び出しで互いに上書きしていた）。
 */

/** この時間を超えた API 呼び出しを警告する */
const SLOW_OPERATION_MS = 3000;

/**
 * 失敗したら指数バックオフ（既定: 1 秒 → 2 秒）で再試行する。
 * `fn` には 1 から始まる試行番号を渡す（save-chat の x-chat-attempt に使う）。
 */
export async function retryWithBackoff<T>(
  fn: (attempt: number) => Promise<T>,
  { attempts = 3, baseDelayMs = 1000 }: { attempts?: number; baseDelayMs?: number } = {}
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      if (attempt >= attempts) throw error;
      const waitTime = baseDelayMs * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
  }
}

/** `startTime`（performance.now()）からの経過が閾値を超えていれば警告する */
export function warnIfSlow(operation: string, startTime: number): void {
  const duration = performance.now() - startTime;
  // 本番環境でも重大なパフォーマンス問題は警告
  if (duration > SLOW_OPERATION_MS) {
    console.warn(`Performance issue in ${operation}: ${duration.toFixed(0)}ms`);
  }
}
