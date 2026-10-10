// deno test --allow-env --allow-read supabase/functions/save-chat/
import { assertEquals } from 'jsr:@std/assert@1';
import {
  buildAdminChat,
  buildFortuneChat,
  FORTUNE_MESSAGES,
  isFortuneCommand,
} from './messages.ts';

// 以前の Web（useChatSession.enter / exit + createAdminChat）が保存していた内容。本文と既存のキーは 1 文字も変えない
// （event / subject は Issue #183 で足したキー）
Deno.test('入室: 以前の Web が作っていた文言と metadata と同じ', () => {
  assertEquals(
    buildAdminChat({
      event: 'enter',
      name: 'ゆい',
      color: '#ff69b4',
      visitCount: 49,
      lastLogin: 1735806900000,
      nonce: 'n-1',
    }),
    {
      name: '管理人',
      color: '#ffffff',
      message: 'ゆい さん、Welcome to お気楽チャット☆',
      system: true,
      metadata: {
        version: 1,
        avatar: 'hoshi1',
        kind: 'admin',
        userColor: '#ff69b4',
        fontStyle: { bold: true },
        visitCount: 49,
        lastLogin: 1735806900000,
        optimisticNonce: 'n-1',
        // Issue #183: 誰が入ったかを構造で書く（本文の文言は変えない）
        event: 'enter',
        subject: { name: 'ゆい', color: '#ff69b4' },
      },
    }
  );
});

Deno.test('退室: 以前の Web が作っていた文言と metadata と同じ（訪問の情報は付けない）', () => {
  assertEquals(
    buildAdminChat({
      event: 'exit',
      name: 'ゆい',
      color: 'orangered',
      visitCount: 3,
      nonce: 'n-2',
    }),
    {
      name: '管理人',
      color: '#ffffff',
      message: 'ゆいさん、またきておくれやすぅ。',
      system: true,
      metadata: {
        version: 1,
        avatar: 'hoshi1',
        kind: 'admin',
        userColor: 'orangered',
        fontStyle: { bold: true },
        optimisticNonce: 'n-2',
        event: 'exit',
        subject: { name: 'ゆい', color: 'orangered' },
      },
    }
  );
});

Deno.test('おみくじ: 以前の Web（fortuneBot.ts）と同じ形', () => {
  assertEquals(FORTUNE_MESSAGES.length, 12);
  assertEquals(buildFortuneChat('ゆい', 0), {
    name: '巫女',
    color: 'hotpink',
    message:
      '大吉で〜す。うまい話が転がり込んできます。仕事は早目に片付けて出かけましょう。＞ゆいさん',
    system: true,
    metadata: { version: 1, kind: 'fortune', avatar: 'miko1', fontStyle: { bold: true } },
  });
  assertEquals(isFortuneCommand('　おみくじ\n'), true);
  assertEquals(isFortuneCommand('おみくじ!'), false);
});
