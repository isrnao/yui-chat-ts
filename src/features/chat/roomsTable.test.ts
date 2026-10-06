// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CHAT_ROOM_IDS, CHAT_ROOMS } from './rooms';

/**
 * rooms.ts と DB の rooms 表（マイグレーションの INSERT）が一致することを確かめる（Issue #178）。
 * 部屋を足すときは、rooms.ts とあわせて rooms に INSERT するマイグレーションを足す。
 */
const MIGRATIONS = join(__dirname, '../../../supabase/migrations');
const ROW = /\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(true|false)\s*,\s*(true|false)\s*\)/g;

function readRoomsTable(): Map<string, { category: string; enabled: boolean; triage: boolean }> {
  const rooms = new Map<string, { category: string; enabled: boolean; triage: boolean }>();
  for (const file of readdirSync(MIGRATIONS).sort()) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8');
    for (const [, statement] of sql.matchAll(/INSERT INTO public\.rooms[^;]*VALUES([^;]*);/g)) {
      for (const [, id, category, enabled, triage] of statement.matchAll(ROW)) {
        rooms.set(id, { category, enabled: enabled === 'true', triage: triage === 'true' });
      }
    }
  }
  return rooms;
}

describe('rooms 表', () => {
  const table = readRoomsTable();

  it('rooms.ts の部屋がすべて同じカテゴリ・enabled で入っていて、余分な部屋が無い', () => {
    expect([...table.keys()].sort()).toEqual([...CHAT_ROOM_IDS].sort());
    for (const id of CHAT_ROOM_IDS) {
      expect(table.get(id), id).toMatchObject({
        category: CHAT_ROOMS[id].category,
        enabled: CHAT_ROOMS[id].enabled,
      });
    }
  });

  it('triage の対象は管理者チャットだけ', () => {
    expect([...table].filter(([, room]) => room.triage).map(([id]) => id)).toEqual(['com_sb']);
  });
});
