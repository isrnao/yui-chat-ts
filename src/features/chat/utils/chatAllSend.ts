/** 空・空白文字のみの発言を判定する */
export function isBlankMessage(msg: string): boolean {
  return msg.trim().length === 0;
}
