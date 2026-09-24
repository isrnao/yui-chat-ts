// @vitest-environment node
/**
 * 本番のエントリ（main.tsx / entry-server.tsx / scripts）から import をたどり、
 * どこからも使われていない src の本番モジュールがないことを確かめる
 * （.kiro/specs/react-2026-refactoring Requirement 5）。
 *
 * テストと stories だけから参照されるモジュールも「使われていない」とみなす。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { expect, test } from 'vitest';

const ROOT = process.cwd();
/**
 * dir の下のファイルを `dir/…` の相対パスで列挙する（Node 20 には fs.globSync がないので readdirSync を使う）
 */
function listFiles(dir: string, recursive: boolean): string[] {
  return readdirSync(dir, { recursive, encoding: 'utf8' }).map(
    (file) => `${dir}/${file.split('\\').join('/')}`
  );
}

const ENTRIES = [
  'src/main.tsx',
  'src/entry-server.tsx',
  ...listFiles('scripts', false).filter((file) => file.endsWith('.ts')),
];
const EXTENSIONS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];
const IMPORT_PATTERN =
  /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|^import\s+['"]([^'"]+)['"]/gm;
const EXCLUDE = /\.(test|stories)\.|^src\/test\/|^src\/storybook\/|\.d\.ts$/;
/**
 * ツーショットチャットの画面は、/chat/2shot/ の切り替え（.kiro/specs/two-shot-chat の Task 8）の PR まで
 * どこからも import しない（それまでの PR を利用者から到達させないため）。切り替えの PR でこの例外を消す。
 */
const NOT_YET_ROUTED = /^src\/features\/two-shot-chat\//;

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith('@features/')) base = join(ROOT, 'src/features', specifier.slice(10));
  else if (specifier.startsWith('@shared/')) base = join(ROOT, 'src/shared', specifier.slice(8));
  else if (specifier.startsWith('.')) base = resolve(dirname(from), specifier);
  else return null; // パッケージ

  for (const extension of EXTENSIONS) {
    const candidate = base + extension;
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function collectReachable(): Set<string> {
  const seen = new Set<string>();
  const stack = ENTRIES.map((entry) => join(ROOT, entry));
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)) {
      const resolved = resolveImport(file, match[1] ?? match[2] ?? match[3]);
      if (resolved) stack.push(resolved);
    }
  }
  return seen;
}

test('本番のエントリから到達しない src のモジュールがない', () => {
  const reachable = collectReachable();
  const unreachable = listFiles('src', true)
    .filter((file) => /\.tsx?$/.test(file) && !EXCLUDE.test(file) && !NOT_YET_ROUTED.test(file))
    .filter((file) => !reachable.has(join(ROOT, file)))
    .map((file) => relative(ROOT, join(ROOT, file)));
  expect(unreachable).toEqual([]);
});
