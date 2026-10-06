// deno test --allow-env --allow-read supabase/functions/save-chat/
import { assertEquals } from 'jsr:@std/assert@1';
import {
  checkSayInput,
  countCodePoints,
  countGraphemes,
  DEFAULT_COLOR,
  EMAIL_MAX,
  MESSAGE_MAX,
  NAME_MAX,
  normalizeColor,
} from './schema.ts';

const ok = { name: 'ゆい', message: 'こんにちは', color: '#ff69b4', email: null };

Deno.test('名前: 前後の空白を除いて 1〜24 コードポイント', () => {
  assertEquals(checkSayInput({ ...ok, name: 'あ'.repeat(NAME_MAX) }).error, null);
  assertEquals(checkSayInput({ ...ok, name: 'あ'.repeat(NAME_MAX + 1) }).error, 'invalid_name');
  // 前後の空白は数えない
  assertEquals(checkSayInput({ ...ok, name: ` ${'あ'.repeat(NAME_MAX)}　` }).error, null);
  assertEquals(checkSayInput({ ...ok, name: ' 　 ' }).violations, ['name_blank']);
  // サロゲートペアは 1 文字（画面の maxLength=24 は UTF-16 の単位なので、ここの方が緩い）
  assertEquals(countCodePoints('😀'.repeat(NAME_MAX)), NAME_MAX);
  assertEquals(checkSayInput({ ...ok, name: '😀'.repeat(NAME_MAX) }).error, null);
});

Deno.test('発言: 1〜120 grapheme（絵文字・結合文字は 1 文字）', () => {
  assertEquals(checkSayInput({ ...ok, message: 'a'.repeat(MESSAGE_MAX) }).error, null);
  assertEquals(
    checkSayInput({ ...ok, message: 'a'.repeat(MESSAGE_MAX + 1) }).error,
    'invalid_message'
  );
  // 家族の絵文字（ZWJ でつないだ 7 コードポイント）と、か + 結合の濁点
  const family = '👨‍👩‍👧‍👦';
  const ga = 'が';
  assertEquals(countGraphemes(family), 1);
  assertEquals(countGraphemes(ga), 1);
  assertEquals(checkSayInput({ ...ok, message: family.repeat(MESSAGE_MAX) }).error, null);
  assertEquals(
    checkSayInput({ ...ok, message: ga.repeat(MESSAGE_MAX + 1) }).error,
    'invalid_message'
  );
  assertEquals(checkSayInput({ ...ok, message: ' \n ' }).violations, ['message_blank']);
  // 結合文字を重ねた 1 grapheme は 120 grapheme 以内でも、DB の上限（2000 コードポイント）を超えれば拒否する
  const heavy = 'a' + '\u0301'.repeat(2000);
  assertEquals(countGraphemes(heavy), 1);
  assertEquals(checkSayInput({ ...ok, message: heavy }).error, 'invalid_message');
});

Deno.test(
  '色: #rgb・#rrggbb・CSS の色名は小文字にし、それ以外は既定の色に置き換える（拒否しない）',
  () => {
    assertEquals(normalizeColor('#FF69B4'), '#ff69b4');
    assertEquals(normalizeColor(' #F0a '), '#f0a');
    assertEquals(normalizeColor('OrangeRed'), 'orangered');
    assertEquals(normalizeColor('あか'), null);
    assertEquals(normalizeColor('#ff69b'), null);
    assertEquals(normalizeColor('red;background:url(x)'), null);
    assertEquals(normalizeColor(undefined), null);

    const replaced = checkSayInput({ ...ok, color: 'あか' });
    assertEquals(replaced.error, null);
    assertEquals(replaced.violations, ['color_replaced']);
    assertEquals(replaced.value.color, DEFAULT_COLOR);
    assertEquals(checkSayInput({ ...ok, color: 'Navy' }).value.color, 'navy');
  }
);

Deno.test('メール: 64 文字以内で制御文字を含まない。形は確かめない', () => {
  assertEquals(checkSayInput({ ...ok, email: 'a'.repeat(EMAIL_MAX) }).error, null);
  assertEquals(checkSayInput({ ...ok, email: 'a'.repeat(EMAIL_MAX + 1) }).error, 'invalid_email');
  assertEquals(checkSayInput({ ...ok, email: 'a\u0000b' }).error, 'invalid_email');
  assertEquals(checkSayInput({ ...ok, email: 'x\u0085' }).error, 'invalid_email');
  // スキームは表示側が限っているので、ここでは通す
  assertEquals(checkSayInput({ ...ok, email: 'javascript:alert(1)' }).error, null);
  assertEquals(checkSayInput({ ...ok, email: '' }).value.email, '');
  assertEquals(checkSayInput({ ...ok, email: undefined }).value.email, null);
  assertEquals(checkSayInput({ ...ok, email: 1 }).error, 'invalid_email');
});

Deno.test('最初の違反のコードを返し、違反はすべて記録する', () => {
  const result = checkSayInput({
    name: 'あ'.repeat(NAME_MAX + 1),
    message: 'a'.repeat(MESSAGE_MAX + 1),
    color: 'x',
    email: null,
  });
  assertEquals(result.error, 'invalid_name');
  assertEquals(result.violations, ['name_too_long', 'message_too_long', 'color_replaced']);
});
