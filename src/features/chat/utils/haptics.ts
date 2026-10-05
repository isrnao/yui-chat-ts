/**
 * 対応していれば端末を短く振動させる（.kiro/specs/chat-ip-mute Requirement 3）。
 * iOS Safari とデスクトップには navigator.vibrate がない。Chrome は一度も操作していないページでは
 * 無視して false を返す。どちらも振動以外の動作は変えないので、結果は見ない。
 */
export function tapHaptic(ms = 15): void {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') return;
  try {
    navigator.vibrate(ms);
  } catch {
    // 振動できなくてもフィルタは続ける
  }
}
