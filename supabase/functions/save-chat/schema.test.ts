// deno test --allow-env --allow-read supabase/functions/save-chat/
import { assertEquals } from 'jsr:@std/assert@1';
import {
  checkSayInput,
  clampInt,
  countCodePoints,
  countGraphemes,
  DEFAULT_COLOR,
  EMAIL_MAX,
  isReservedName,
  MESSAGE_MAX,
  MESSAGE_MAX_CODE_POINTS,
  METADATA_DROPPED_ENTRY_MAX,
  METADATA_DROPPED_MAX,
  METADATA_MAX_BYTES,
  NAME_MAX,
  normalizeColor,
  OPTIMISTIC_NONCE_MAX,
  readNonce,
  sanitizeMetadata,
  VISIT_COUNT_MAX,
} from './schema.ts';

const ok: { name: string; message: string; color: unknown; email: unknown } = {
  name: 'ゆい',
  message: 'こんにちは',
  color: '#ff69b4',
  email: null,
};
const errorOf = (input: Partial<typeof ok>) => checkSayInput({ ...ok, ...input }).error;

Deno.test(
  '名前: 前後の空白を除いて 1〜24 コードポイント。保存するのは前後の空白を除いた名前',
  () => {
    assertEquals(errorOf({ name: 'あ'.repeat(NAME_MAX) }), null);
    assertEquals(errorOf({ name: 'あ'.repeat(NAME_MAX + 1) }), 'invalid_name');
    const padded = checkSayInput({ ...ok, name: ` ${'あ'.repeat(NAME_MAX)}${'　'.repeat(100)}` });
    assertEquals(padded.error === null && padded.value.name, 'あ'.repeat(NAME_MAX));
    assertEquals(checkSayInput({ ...ok, name: ' 　 ' }), {
      error: 'invalid_name',
      violation: 'name_blank',
    });
    // サロゲートペアは 1 文字（画面の maxLength=24 は UTF-16 の単位なので、ここの方が緩い）
    assertEquals(countCodePoints('😀'.repeat(NAME_MAX)), NAME_MAX);
    assertEquals(errorOf({ name: '😀'.repeat(NAME_MAX) }), null);
    assertEquals(checkSayInput({ ...ok, name: 'ゆ\u0007い' }), {
      error: 'invalid_name',
      violation: 'name_control_chars',
    });
  }
);

Deno.test(
  '発言: 1〜120 grapheme（絵文字・結合文字は 1 文字）、コードポイントでも 2000 まで',
  () => {
    assertEquals(errorOf({ message: 'a'.repeat(MESSAGE_MAX) }), null);
    assertEquals(errorOf({ message: 'a'.repeat(MESSAGE_MAX + 1) }), 'invalid_message');
    const family = '👨‍👩‍👧‍👦';
    const ga = 'が';
    assertEquals(countGraphemes(family), 1);
    assertEquals(countGraphemes(ga), 1);
    assertEquals(countGraphemes(''), 0);
    assertEquals(errorOf({ message: family.repeat(MESSAGE_MAX) }), null);
    assertEquals(errorOf({ message: ga.repeat(MESSAGE_MAX + 1) }), 'invalid_message');
    assertEquals(checkSayInput({ ...ok, message: ' \n ' }), {
      error: 'invalid_message',
      violation: 'message_blank',
    });
    // 結合文字を重ねた 1 grapheme は 120 grapheme 以内でも、DB の上限（2000 コードポイント）を超えれば拒否する
    const heavy = 'a' + '́'.repeat(MESSAGE_MAX_CODE_POINTS);
    assertEquals(countGraphemes(heavy), 1);
    assertEquals(errorOf({ message: heavy }), 'invalid_message');
  }
);

Deno.test(
  '色: #rgb・#rrggbb・CSS の色名は小文字にし、それ以外は既定の色に置き換える（拒否しない）',
  () => {
    assertEquals(normalizeColor('#FF69B4'), '#ff69b4');
    assertEquals(normalizeColor(' #F0a '), '#f0a');
    assertEquals(normalizeColor('OrangeRed'), 'orangered');
    assertEquals(normalizeColor('あか'), null);
    assertEquals(normalizeColor('#ff69b'), null);
    assertEquals(normalizeColor('red;background:url(x)'), null);
    assertEquals(normalizeColor('canvas'), null);
    assertEquals(normalizeColor(undefined), null);

    const replaced = checkSayInput({ ...ok, color: 'あか' });
    assertEquals(replaced.error === null && replaced.value.color, DEFAULT_COLOR);
    const navy = checkSayInput({ ...ok, color: 'Navy' });
    assertEquals(navy.error === null && navy.value.color, 'navy');
  }
);

Deno.test('メール: 64 文字以内で制御文字を含まない。形は確かめない', () => {
  assertEquals(errorOf({ email: 'a'.repeat(EMAIL_MAX) }), null);
  assertEquals(errorOf({ email: 'a'.repeat(EMAIL_MAX + 1) }), 'invalid_email');
  assertEquals(errorOf({ email: 'a\u0000b' }), 'invalid_email');
  assertEquals(errorOf({ email: 'x\u0085' }), 'invalid_email');
  // スキームは表示側が限っているので、ここでは通す
  assertEquals(errorOf({ email: 'javascript:alert(1)' }), null);
  assertEquals(errorOf({ email: 1 }), 'invalid_email');
  const empty = checkSayInput({ ...ok, email: '' });
  assertEquals(empty.error === null && empty.value.email, '');
  const none = checkSayInput({ ...ok, email: undefined });
  assertEquals(none.error === null && none.value.email, null);
});

Deno.test('予約名: NFKC に正規化し、空白と見えない文字を除いて「管理人」「巫女」と比べる', () => {
  for (const name of [
    '管理人',
    '巫女',
    ' 管 理 人 ',
    '管理　人',
    '管理⼈',
    '巫\t女',
    // ゼロ幅スペース・ゼロ幅接合子・Word Joiner・ソフトハイフンを挟んでも同じに見える
    '管​理人',
    '巫‍女',
    '管理⁠人',
    '管­理人',
  ]) {
    assertEquals(isReservedName(name), true, name);
  }
  for (const name of ['管理人さん', 'ゆい', '巫女っ子', '管理']) {
    assertEquals(isReservedName(name), false, name);
  }
  assertEquals(checkSayInput({ ...ok, name: ' 管理人 ' }), {
    error: 'reserved_name',
    violation: 'name_reserved',
  });
});

Deno.test('clampInt と readNonce', () => {
  assertEquals(clampInt(1e12, VISIT_COUNT_MAX), VISIT_COUNT_MAX);
  assertEquals(clampInt(-3.7, VISIT_COUNT_MAX), 0);
  assertEquals(clampInt('49', VISIT_COUNT_MAX), undefined);
  assertEquals(clampInt(Number.NaN, VISIT_COUNT_MAX), undefined);
  assertEquals(readNonce('😀'.repeat(OPTIMISTIC_NONCE_MAX)), '😀'.repeat(OPTIMISTIC_NONCE_MAX));
  assertEquals(readNonce('x'.repeat(OPTIMISTIC_NONCE_MAX + 1)), undefined);
  assertEquals(readNonce(1), undefined);
});

Deno.test('metadata: 今の Web が送る形はそのまま通る', () => {
  const say = {
    version: 1,
    fontStyle: { fontSize: 3, fontColor: 'hotpink', bold: true },
    avatar: 'tuki2',
    optimisticNonce: crypto.randomUUID(),
  } as const;
  assertEquals(sanitizeMetadata(say), { value: say, dropped: [] });
  assertEquals(sanitizeMetadata(null), { value: null, dropped: [] });
  assertEquals(sanitizeMetadata(undefined), { value: null, dropped: [] });
});

Deno.test('metadata: 知らないキー・範囲外の値・サーバーが作る発言だけのキーを落とす', () => {
  const result = sanitizeMetadata({
    version: 1,
    fontStyle: { fontSize: 9, fontColor: 'pink', bold: 'yes', shadow: 1 },
    avatar: 'evil',
    kind: 'admin',
    userColor: '#f00',
    visitCount: 3,
    lastLogin: 1,
    optimisticNonce: 'x'.repeat(65),
    html: '<script>',
  });
  assertEquals(result.value, { version: 1 });
  assertEquals(result.dropped, [
    'unknown:kind',
    'unknown:userColor',
    'unknown:visitCount',
    'unknown:lastLogin',
    'unknown:html',
    'unknown:fontStyle.shadow',
    'fontStyle.fontSize',
    'fontStyle.fontColor',
    'fontStyle.bold',
    'avatar',
    'optimisticNonce',
  ]);
  // avatar の none は「付けない」なので、落としたとは数えない
  assertEquals(sanitizeMetadata({ version: 1, avatar: 'none' }), {
    value: { version: 1 },
    dropped: [],
  });
});

Deno.test('metadata: version が 1 でない・オブジェクトでないものは保存しない', () => {
  assertEquals(sanitizeMetadata({ version: 2, avatar: 'hoshi1' }), {
    value: null,
    dropped: ['version'],
  });
  assertEquals(sanitizeMetadata([1, 2]), { value: null, dropped: ['not_object'] });
  assertEquals(sanitizeMetadata('x'), { value: null, dropped: ['not_object'] });
});

Deno.test('metadata: 作り直した値は常に 2KB に収まる', () => {
  const largest = sanitizeMetadata({
    version: 1,
    fontStyle: { fontSize: 5, fontColor: 'silver', bold: false },
    avatar: 'hoshi8',
    optimisticNonce: '😀'.repeat(OPTIMISTIC_NONCE_MAX),
    padding: 'x'.repeat(100_000),
  }).value;
  const bytes = new TextEncoder().encode(JSON.stringify(largest)).length;
  assertEquals(bytes <= METADATA_MAX_BYTES, true);
});

Deno.test(
  'metadata: JSON の "__proto__" キーは own property として届くので、知らないキーとして落とす',
  () => {
    // オブジェクトリテラルの __proto__ は prototype を変える構文なので、req.json() と同じく JSON.parse で作る
    const input = JSON.parse('{"version":1,"__proto__":{"polluted":true},"avatar":"hoshi1"}');
    const result = sanitizeMetadata(input);
    assertEquals(result.value, { version: 1, avatar: 'hoshi1' });
    assertEquals(result.dropped, ['unknown:__proto__']);
    assertEquals(Object.getPrototypeOf(result.value), Object.prototype);
    assertEquals(({} as Record<string, unknown>).polluted, undefined);
  }
);

Deno.test('metadata: 落としたものの記録は件数と長さを上限で切る', () => {
  const input: Record<string, unknown> = { version: 1 };
  for (let i = 0; i < 1000; i++) input[`k${i}${'x'.repeat(200)}`] = i;
  const { dropped } = sanitizeMetadata(input);
  assertEquals(dropped.length, METADATA_DROPPED_MAX + 1);
  assertEquals(dropped.at(-1), 'truncated');
  assertEquals(
    dropped.every((entry) => entry.length <= METADATA_DROPPED_ENTRY_MAX),
    true
  );
});
