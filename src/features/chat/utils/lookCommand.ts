/** 保存・音・表示で共通のcase-sensitiveなlook規則。 */
export function readLookCommand(message: string): 'look' | 'unlook' | null {
  const command = message.trim();
  return command === 'look' || command === 'unlook' ? command : null;
}
