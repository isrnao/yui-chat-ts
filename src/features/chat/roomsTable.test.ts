// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAT_ROOM_IDS, CHAT_ROOMS } from './rooms';

/**
 * rooms.ts と DB の rooms 表（マイグレーションの INSERT）の ID・カテゴリが一致することを確かめる（Issue #178）。
 * 部屋を足すときは、rooms.ts とあわせて rooms に INSERT するマイグレーションを足す。
 */
const MIGRATIONS = join(__dirname, '../../../supabase/migrations');
const ROW = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(true|false)\s*\)/g;

function readRoomsTable(): Map<string, { category: string; triage: boolean }> {
  const rooms = new Map<string, { category: string; triage: boolean }>();
  for (const file of readdirSync(MIGRATIONS).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    for (const [, statement] of sql.matchAll(/INSERT INTO public\.rooms[^;]*VALUES([^;]*);/g)) {
      for (const [, id, category, triage] of statement.matchAll(ROW)) {
        rooms.set(id, { category, triage: triage === 'true' });
      }
    }
  }
  return rooms;
}

describe('rooms 表', () => {
  const table = readRoomsTable();

  // この検査は INSERT ... VALUES だけを読む。UPDATE・DELETE・UPSERT で rooms を変えるマイグレーションを足すと、
  // 実 DB と rooms.ts がずれても通ってしまうので、そうした書き込みがあれば落とす（足すときはこの検査も直す）
  it('rooms を変えるマイグレーションは INSERT ... VALUES だけ', () => {
    const unsupported = readdirSync(MIGRATIONS).filter((file) => {
      const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
        .replace(/--[^\n]*/g, '')
        // 関数の本体（$$ … $$）はマイグレーションの実行では動かないので除く
        .replace(/\$\$[\s\S]*?\$\$/g, '');
      return (
        /UPDATE\s+(public\.)?rooms\b/i.test(sql) ||
        /DELETE\s+FROM\s+(public\.)?rooms\b/i.test(sql) ||
        /TRUNCATE\s+(TABLE\s+)?(public\.)?rooms\b/i.test(sql) ||
        /INSERT\s+INTO\s+(public\.)?rooms\b[^;]*ON\s+CONFLICT/i.test(sql)
      );
    });
    expect(unsupported).toEqual([]);
  });

  it('rooms.ts の部屋がすべて同じカテゴリで入っていて、余分な部屋が無い', () => {
    expect([...table.keys()].sort()).toEqual([...CHAT_ROOM_IDS].sort());
    for (const id of CHAT_ROOM_IDS) {
      expect(table.get(id), id).toMatchObject({ category: CHAT_ROOMS[id].category });
    }
  });

  it('triage の対象は管理者チャットだけ', () => {
    expect([...table].filter(([, room]) => room.triage).map(([id]) => id)).toEqual(['com_sb']);
  });
});
