/**
 * Contracts（contracts/）が Web とサーバーのソースから作り直した結果と同じかを確かめる
 * （.kiro/specs/android-native-app design.md §8、Requirement 21.5）。
 *
 * - 違えば落ちる。部屋・型・schema.ts・messages.ts などを変えたら `pnpm contracts:export` で書き出し直す
 * - `UPDATE_CONTRACTS=1` のときは比べずに書き出す
 *
 * contracts/ を変えたら、okiraku-android でも scripts/sync-contracts.sh を走らせる（写しの古さは向こうの
 * contracts-drift が毎日確かめる）。
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildContracts, FIXTURE_TIME_ZONE, parseThemeCss } from '../contracts/buildContracts';

const ROOT = resolve(__dirname, '../..');
const CONTRACTS_DIR = join(ROOT, 'contracts');
/** 手で書くファイル（生成物ではない） */
const HANDWRITTEN = new Set(['README.md']);

function serialize(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function listFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? listFiles(path) : [relative(CONTRACTS_DIR, path)];
  });
}

describe('Contracts', () => {
  const previousTz = process.env.TZ;
  let files: Record<string, string>;

  beforeAll(() => {
    // fixtures の日時の表記はこのゾーンで作る（Android のテストも同じゾーンで比べる）
    process.env.TZ = FIXTURE_TIME_ZONE;
    const themeCss = readFileSync(join(ROOT, 'src/styles/theme.css'), 'utf8');
    files = Object.fromEntries(
      Object.entries(buildContracts(themeCss)).map(([path, value]) => [path, serialize(value)])
    );
  });

  afterAll(() => {
    process.env.TZ = previousTz;
  });

  it('theme.css の色と書体を読める', () => {
    const { colors, fontFamily } = parseThemeCss(
      readFileSync(join(ROOT, 'src/styles/theme.css'), 'utf8')
    );
    expect(colors['yui-green']).toBe('#c1fc92');
    expect(fontFamily[0]).toBe('DotGothic16');
  });

  it('fixtures の日時はタイムゾーンを合わせて作る', () => {
    const fixture = JSON.parse(files['fixtures/legacy-date-time.json']!) as {
      cases: { expected: string }[];
    };
    expect(fixture.cases[0]!.expected).toBe('10/11(Sun) 20:10');
  });

  if (process.env.UPDATE_CONTRACTS === '1') {
    it('contracts/ に書き出す', () => {
      for (const path of listFiles(CONTRACTS_DIR)) {
        if (!HANDWRITTEN.has(path)) rmSync(join(CONTRACTS_DIR, path));
      }
      for (const [path, content] of Object.entries(files)) {
        const target = join(CONTRACTS_DIR, path);
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, content);
      }
    });
  } else {
    it('contracts/ のファイルの一覧が作り直した結果と同じ', () => {
      const onDisk = listFiles(CONTRACTS_DIR)
        .filter((path) => !HANDWRITTEN.has(path))
        .sort();
      expect(onDisk, 'pnpm contracts:export で書き出し直してください').toEqual(
        Object.keys(files).sort()
      );
    });

    it('contracts/ の中身が作り直した結果と同じ', () => {
      for (const [path, content] of Object.entries(files)) {
        const target = join(CONTRACTS_DIR, path);
        expect(
          existsSync(target) ? readFileSync(target, 'utf8') : null,
          `${path} が古い。pnpm contracts:export で書き出し直してください`
        ).toBe(content);
      }
    });
  }
});
