export function validateName(name: string): string | null {
  if (!name) return "おなまえは必須です";
  if (name.length > 24) return "おなまえは24文字以内";
  return null;
}
