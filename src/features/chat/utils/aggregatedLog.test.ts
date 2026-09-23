import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Chat } from '@features/chat/types';
import { mergeChatLogByUuid } from './aggregatedLog';

/** 時刻（ms）と連番から UUID v7 の形の文字列を作る（先頭 48 ビットが時刻） */
function v7(ms: number, seq: number): string {
  const hex = ms.toString(16).padStart(12, '0');
  const tail = seq.toString(16).padStart(12, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-7000-8000-${tail}`;
}

function chat(uuid: string, time: number, message = ''): Chat {
  return { uuid, time, name: 'n', color: '#000', message, ip_masked: '', ua: '' };
}

/**
 * 以前の実装（Map で重複を除き、全体を localeCompare で並べ直す）。
 * 1 件の合流を二分探索にしても、結果がこれと同じであることを確かめる
 */
function referenceMerge(state: Chat[], incoming: Chat[]): Chat[] {
  const map = new Map<string, Chat>();
  for (const c of state) map.set(c.uuid, c);
  for (const c of incoming) map.set(c.uuid, c);
  const isV7 = (id: string) => id.length === 36 && id.charAt(14) === '7';
  return [...map.values()]
    .sort((a, b) => (isV7(a.uuid) && isV7(b.uuid) ? b.uuid.localeCompare(a.uuid) : b.time - a.time))
    .slice(0, 2000);
}

const uuids = (list: Chat[]) => list.map((c) => c.uuid);

describe('mergeChatLogByUuid', () => {
  const older = chat(v7(1000, 1), 1000);
  const middle = chat(v7(2000, 2), 2000);
  const newer = chat(v7(3000, 3), 3000);

  it('1 件の発言を、新しい順の正しい位置に入れる', () => {
    expect(uuids(mergeChatLogByUuid([newer, older], middle))).toEqual(
      uuids([newer, middle, older])
    );
    expect(uuids(mergeChatLogByUuid([middle, older], newer))).toEqual(
      uuids([newer, middle, older])
    );
    expect(uuids(mergeChatLogByUuid([newer, middle], older))).toEqual(
      uuids([newer, middle, older])
    );
  });

  it('同じ uuid の発言は置き換える', () => {
    const edited = { ...middle, message: 'edited' };
    const merged = mergeChatLogByUuid([newer, middle, older], edited);
    expect(uuids(merged)).toEqual(uuids([newer, middle, older]));
    expect(merged[1]!.message).toBe('edited');
  });

  it('入力の配列を書き換えない', () => {
    const state = [newer, older];
    mergeChatLogByUuid(state, middle);
    expect(state).toEqual([newer, older]);
  });

  it('2000 件を超えた分は古いものから捨てる', () => {
    const state = Array.from({ length: 2000 }, (_, i) => chat(v7(10_000 - i, i), 10_000 - i));
    const merged = mergeChatLogByUuid(state, chat(v7(20_000, 9999), 20_000));
    expect(merged).toHaveLength(2000);
    expect(merged[0]!.time).toBe(20_000);
    expect(merged[merged.length - 1]).toBe(state[1998]);

    // いちばん古いものより古い発言は入らない
    const tooOld = mergeChatLogByUuid(state, chat(v7(1, 9998), 1));
    expect(uuids(tooOld)).toEqual(uuids(state));
  });

  // 同じ種類の ID どうし（すべて UUID v7、またはすべてそれ以外）で、以前の実装と一致すること。
  // 以前の比較関数も、v7 とそれ以外が混ざると推移律を満たさないので、混在は比べない
  const v7Chat = fc
    .record({ ms: fc.integer({ min: 0, max: 50 }), seq: fc.integer({ min: 0, max: 2 ** 16 }) })
    .map(({ ms, seq }) => chat(v7(ms, seq), ms));
  const otherChat = fc
    .record({ id: fc.integer({ min: 0, max: 40 }), time: fc.integer({ min: 0, max: 10 }) })
    .map(({ id, time }) => chat(`temp-${id}`, time));

  for (const [label, arbitrary] of [
    ['UUID v7', v7Chat],
    ['UUID v7 以外（time で並ぶ。同じ time が多い）', otherChat],
  ] as const) {
    it(`1 件の合流の結果が、全体を並べ直す以前の実装と一致する（${label}）`, () => {
      fc.assert(
        fc.property(
          fc.uniqueArray(arbitrary, { selector: (c) => c.uuid, maxLength: 60 }),
          arbitrary,
          fc.integer({ min: 0, max: 10 }),
          (items, incoming, shift) => {
            const state = referenceMerge([], items); // 並んだ状態から始める
            // 既存の uuid と同じで time だけが違う発言（置き換えで位置が変わる場合）も試す
            const replaced =
              state.length > 0
                ? { ...state[shift % state.length]!, time: incoming.time }
                : incoming;
            for (const next of [incoming, replaced]) {
              expect(uuids(mergeChatLogByUuid(state, next))).toEqual(
                uuids(referenceMerge(state, [next]))
              );
            }
          }
        )
      );
    });
  }

  it('複数件の合流も、以前の実装と一致する', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(v7Chat, { selector: (c) => c.uuid, maxLength: 40 }),
        fc.array(v7Chat, { maxLength: 10 }),
        (items, incoming) => {
          const state = referenceMerge([], items);
          expect(uuids(mergeChatLogByUuid(state, incoming))).toEqual(
            uuids(referenceMerge(state, incoming))
          );
        }
      )
    );
  });
});
