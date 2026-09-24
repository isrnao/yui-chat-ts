import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseLobbyRows, parseTwoShotResponse } from './protocol';

// Edge Function の実際の出力から作ったフィクスチャ（handler.test.ts が一致を確かめている）
function fixture(name: string): unknown {
  const path = resolve(process.cwd(), 'supabase/functions/two-shot/fixtures', `${name}.json`);
  return JSON.parse(readFileSync(path, 'utf8'));
}

describe('Two_Shot_API の応答の検証', () => {
  it('Edge のフィクスチャをそのまま受け付ける', () => {
    for (const name of ['room', 'lobby', 'page-notice', 'pane-notice']) {
      expect(parseTwoShotResponse(fixture(name))).toEqual(fixture(name));
    }
  });

  it('形の違う応答は null（画面は通信の失敗として扱う）', () => {
    const room = fixture('room') as { room: Record<string, unknown> };
    expect(parseTwoShotResponse(null)).toBeNull();
    expect(parseTwoShotResponse({ ok: true, screen: 'room' })).toBeNull();
    expect(
      parseTwoShotResponse({ ok: true, screen: 'room', room: { ...room.room, seat: 2 } })
    ).toBeNull();
    expect(
      parseTwoShotResponse({ ok: true, screen: 'room', room: { ...room.room, roomId: '13' } })
    ).toBeNull();
    expect(
      parseTwoShotResponse({ ok: true, screen: 'room', room: { ...room.room, idleSeconds: -1 } })
    ).toBeNull();
    expect(
      parseTwoShotResponse({
        ok: true,
        screen: 'room',
        room: { ...room.room, lines: [{ at: 1, kind: 'notice', code: 'N99', params: {} }] },
      })
    ).toBeNull();
    expect(parseTwoShotResponse({ ok: false, notice: 'E10', placement: 'page' })).toBeNull();
    expect(parseTwoShotResponse({ ok: false, notice: 'E1', placement: 'top' })).toBeNull();
  });
});

describe('公開一覧の行の検証', () => {
  it('部屋 ID ごとの一覧の行にする', () => {
    expect(
      parseLobbyRows([
        { room_id: '01', status: 'waiting', sex: 'F', name: 'はなこ', profile: 'よろしく' },
        { room_id: '02', status: 'full', sex: null, name: null, profile: null },
        { room_id: '03', status: 'empty', sex: null, name: null, profile: null },
      ])
    ).toEqual({
      '01': { status: 'waiting', sex: 'F', name: 'はなこ', profile: 'よろしく' },
      '02': { status: 'full' },
      '03': { status: 'empty' },
    });
  });

  it('形の違う行があれば null', () => {
    expect(parseLobbyRows({})).toBeNull();
    expect(parseLobbyRows([{ room_id: '99', status: 'empty' }])).toBeNull();
    expect(
      parseLobbyRows([{ room_id: '01', status: 'waiting', sex: 'X', name: 'a', profile: '' }])
    ).toBeNull();
    expect(parseLobbyRows([{ room_id: '01', status: 'busy' }])).toBeNull();
  });
});
