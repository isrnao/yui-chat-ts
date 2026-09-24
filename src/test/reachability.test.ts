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
    .filter((file) => /\.tsx?$/.test(file) && !EXCLUDE.test(file))
    .filter((file) => !reachable.has(join(ROOT, file)))
    .map((file) => relative(ROOT, join(ROOT, file)));
  expect(unreachable).toEqual([]);
});

/** entry から静的な import だけでたどれる src のファイルと、パッケージ（動的 import の先は別のチャンクなので含めない） */
function collectStaticImports(entry: string): { files: Set<string>; packages: Set<string> } {
  const files = new Set<string>();
  const packages = new Set<string>();
  const stack = [join(ROOT, entry)];
  while (stack.length > 0) {
    const file = stack.pop()!;
    if (files.has(file)) continue;
    files.add(file);
    if (!/\.tsx?$/.test(file)) continue;
    for (const match of readFileSync(file, 'utf8').matchAll(IMPORT_PATTERN)) {
      const specifier = match[1] ?? match[3];
      if (specifier === undefined) continue;
      const resolved = resolveImport(file, specifier);
      if (resolved) stack.push(resolved);
      else if (!/^(\.|@features\/|@shared\/)/.test(specifier)) packages.add(specifier);
    }
  }
  return { files, packages };
}

// ツーショットチャットは fetch だけで通信する（.kiro/specs/two-shot-chat Requirement 17.5）。
// SDK が静的依存に入ると、このルートで Supabase のチャンク（vendor-supabase）を先読みすることになる。
// ビルド後の検査は scripts/prerender-rooms.ts でも行う
test('ツーショットチャットのルートは、Supabase の SDK とクライアントを静的に import しない', () => {
  const supabase = (graph: ReturnType<typeof collectStaticImports>) => [
    ...[...graph.packages].filter((name) => name.startsWith('@supabase/')),
    ...[...graph.files]
      .filter((file) => file.endsWith('supabaseClient.ts'))
      .map((file) => relative(ROOT, file)),
  ];
  // 検査が空振りしていないことを、SDK を使う通常の部屋のルートで確かめる
  expect(supabase(collectStaticImports('src/routes/ChatRoute.tsx'))).not.toEqual([]);
  expect(supabase(collectStaticImports('src/routes/TwoShotRoute.tsx'))).toEqual([]);
});
