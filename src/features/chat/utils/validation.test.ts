import { describe, it, expect } from 'vitest';
import { validateName } from './validation';

describe('validateName', () => {
  it('should return null for valid names', () => {
    expect(validateName('Alice')).toBeNull();
    expect(validateName('Bob123')).toBeNull();
    expect(validateName('ユーザー')).toBeNull();
    expect(validateName('a')).toBeNull();
    expect(validateName('12345678901234567890123')).toBeNull(); // 23文字（制限内）
    expect(validateName('123456789012345678901234')).toBeNull(); // 24文字（制限境界）
  });

  it('should return error message for empty name', () => {
    expect(validateName('')).toBe('おなまえは必須です');
  });

  it('should return error message for name longer than 24 characters', () => {
    expect(validateName('1234567890123456789012345')).toBe('おなまえは24文字以内'); // 25文字
    expect(validateName('very_long_username_that_exceeds_the_limit')).toBe('おなまえは24文字以内');
  });

  it('should handle special characters', () => {
    expect(validateName('user@domain')).toBeNull();
    expect(validateName('user-name_123')).toBeNull();
    expect(validateName('あいうえおかきくけこさしすせそたちつてとなにぬねの')).toBe(
      'おなまえは24文字以内'
    ); // 25文字のひらがな
  });

  it('should handle whitespace', () => {
    expect(validateName(' Alice ')).toBeNull(); // スペースも文字数に含まれる
    expect(validateName('Alice Bob')).toBeNull();
  });
});
