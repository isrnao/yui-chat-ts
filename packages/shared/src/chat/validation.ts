export function validateName(name: string): string | null {
  if (!name.trim()) return 'おなまえは必須です';
  if (name.trim().length > 24) return 'おなまえは24文字以内';
  return null;
}
