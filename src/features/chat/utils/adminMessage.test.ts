import { describe, expect, it } from 'vitest';
import type { Chat } from '../types';
import { getRecentParticipants } from '../hooks/useParticipants';
import { buildAdminChat } from '../serverMessages';
import { readAdminEvent } from './adminMessage';

const NOW = 1_800_000_000_000;
let seq = 0;

function row(partial: Partial<Chat> & Pick<Chat, 'message'>): Chat {
  seq += 1;
  return {
    uuid: `u${seq}`,
    name: '管理人',
    color: '#ffffff',
    time: NOW - 60_000 + seq,
    ip_masked: '',
    ua: '',
    ...partial,
  };
}

/** サーバーが作る今の形（metadata に event / subject がある） */
function structured(event: 'enter' | 'exit', name: string, color = '#f00'): Chat {
  const chat = buildAdminChat({ event, name, color });
  return row({ ...chat, system: true });
}

/** 構造の無い古い行（本文の文言だけ） */
function legacy(event: 'enter' | 'exit', name: string, color = '#00f'): Chat {
  return row({
    message:
      event === 'enter'
        ? `${name} さん、Welcome to お気楽チャット☆`
        : `${name}さん、またきておくれやすぅ。`,
    system: true,
    metadata: { version: 1, kind: 'admin', userColor: color },
  });
}

function say(name: string, color = '#0a0'): Chat {
  return row({ name, color, message: 'こんにちは' });
}

describe('readAdminEvent', () => {
  it('構造のある行は metadata の event / subject で読む', () => {
    expect(readAdminEvent(structured('enter', 'ゆい'))).toEqual({
      event: 'enter',
      name: 'ゆい',
      color: '#f00',
      rest: 'さん、Welcome to お気楽チャット☆',
    });
  });

  it('構造の無い古い行は本文の正規表現で読む', () => {
    expect(readAdminEvent(legacy('exit', 'たろう'))).toEqual({
      event: 'exit',
      name: 'たろう',
      color: '#00f',
      rest: 'さん、またきておくれやすぅ。',
    });
  });

  it('構造のある行は、文言が変わっても読める', () => {
    const chat = { ...structured('enter', 'ゆい'), message: 'ゆい さんがやってきました' };
    expect(readAdminEvent(chat)).toMatchObject({ event: 'enter', name: 'ゆい' });
  });

  it('名前に「さん、」を含んでも、構造のある行は名前を取り違えない', () => {
    expect(readAdminEvent(structured('exit', 'Aさん、B'))).toMatchObject({
      name: 'Aさん、B',
      rest: 'さん、またきておくれやすぅ。',
    });
  });

  it('入退室でない管理人の発言（triage の返信）と利用者の発言は null', () => {
    expect(
      readAdminEvent(
        row({
          message: '機能要求を受け付けました（Issue #1）',
          metadata: { version: 1, kind: 'admin' },
        })
      )
    ).toBeNull();
    expect(readAdminEvent(say('ゆい'))).toBeNull();
  });
});

describe('getRecentParticipants（構造のある行と古い行が混ざったログ）', () => {
  it('構造のある行と古い行で、以前と同じ参加者になる', () => {
    const log = [
      legacy('enter', 'たろう'),
      structured('enter', 'ゆい'),
      say('はなこ'),
      structured('exit', 'たろう'),
      legacy('enter', 'じろう'),
      legacy('exit', 'じろう'),
    ];
    expect(getRecentParticipants(log, NOW)).toEqual([
      { uuid: log[1].uuid, name: 'ゆい', color: '#f00' },
      { uuid: log[2].uuid, name: 'はなこ', color: '#0a0' },
    ]);
  });

  it('新しい行は、入退室の文言を変えても参加者一覧が壊れない', () => {
    const enter = { ...structured('enter', 'ゆい'), message: 'ようこそ ゆい さん' };
    const exit = { ...structured('exit', 'ゆい'), message: 'またね' };
    expect(getRecentParticipants([enter], NOW).map((p) => p.name)).toEqual(['ゆい']);
    expect(getRecentParticipants([enter, exit], NOW)).toEqual([]);
  });
});

describe('readAdminEvent（構造の無い古い行の文言の揺れ）', () => {
  it('名前の後の空白の有無と、読点（、/ ,）の揺れを受ける', () => {
    const legacyRow = (message: string): Chat =>
      row({ message, metadata: { version: 1, kind: 'admin' } });
    expect(readAdminEvent(legacyRow('たろうさん、Welcome to お気楽チャット☆'))).toMatchObject({
      event: 'enter',
      name: 'たろう',
    });
    expect(readAdminEvent(legacyRow('たろう さん,Welcome to お気楽チャット☆'))).toMatchObject({
      event: 'enter',
      name: 'たろう',
    });
    expect(readAdminEvent(legacyRow('たろう さん、またきておくれやすぅ。'))).toMatchObject({
      event: 'exit',
      name: 'たろう',
      rest: 'さん、またきておくれやすぅ。',
    });
  });
});
