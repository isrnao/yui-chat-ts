// @vitest-environment node
/**
 * Compiler_Check（.kiro/specs/react-2026-refactoring Requirement 1）。
 *
 * src の本番コードを React Compiler に通し、コンパイルできなかった関数があれば失敗させる。
 * コンパイラは既定では失敗を黙って飛ばす（panicThreshold: 'none'）ため、ビルドが通っていても
 * メモ化されていないことがある。実際に @babel/core 8 と組み合わせたときは、分割代入の
 * デフォルト値を持つ関数がすべて素通りしていた（react/react#36868）。
 */
import { readdirSync, readFileSync } from 'node:fs';
import { transformSync } from '@babel/core';
import reactCompiler from 'babel-plugin-react-compiler';
import { expect, test } from 'vitest';

const EXCLUDE = /\.(test|stories)\.|^src\/test\/|^src\/storybook\/|\.d\.ts$/;

/** src の本番の TypeScript ファイル。Node 20 には fs.globSync がないので readdirSync で走査する */
function productionFiles(): string[] {
  return readdirSync('src', { recursive: true, encoding: 'utf8' })
    .map((file) => `src/${file.split('\\').join('/')}`)
    .filter((file) => /\.tsx?$/.test(file) && !EXCLUDE.test(file))
    .sort();
}

const USE_NO_MEMO = /^\s*['"]use no memo['"];?\s*$/;
const COMMENT = /^\s*\/\/\s*\S/;

/**
 * CompileError を出した関数が、意図してコンパイル対象から外したものか。
 * 本体の先頭（関数の開始行から 3 行以内）に 'use no memo' があり、その直前の行が
 * 外す理由のコメントであることを求める。'use no memo' を付けてもコンパイラは CompileError を
 * 報告するので、位置だけを並べた許可リストで扱うと、リストに足すだけで失敗を隠せてしまう。
 */
function isDocumentedOptOut(lines: readonly string[], fnStartLine: number): boolean {
  const head = lines.slice(fnStartLine - 1, fnStartLine + 3);
  const at = head.findIndex((line) => USE_NO_MEMO.test(line));
  return at > 0 && COMMENT.test(head[at - 1]!);
}

type CompilerEvent = {
  kind: string;
  fnLoc?: { start?: { line?: number } } | null;
  detail?: { options?: { reason?: string }; reason?: string };
};

function collectCompileErrors(): string[] {
  const failures: string[] = [];
  const files = productionFiles();
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split('\n');
    transformSync(source, {
      filename: file,
      babelrc: false,
      configFile: false,
      parserOpts: { plugins: ['typescript', 'jsx'] },
      plugins: [
        [
          reactCompiler,
          {
            panicThreshold: 'none',
            logger: {
              logEvent(_filename: string, event: CompilerEvent) {
                if (event.kind !== 'CompileError') return;
                const line = event.fnLoc?.start?.line ?? 0;
                if (isDocumentedOptOut(lines, line)) return;
                const reason = event.detail?.options?.reason ?? event.detail?.reason ?? '';
                failures.push(`${file}:${line} ${reason}`.trim());
              },
            },
          },
        ],
      ],
    });
  }
  return failures;
}

test('src の本番コードに React Compiler がコンパイルできない関数がない', () => {
  expect(collectCompileErrors()).toEqual([]);
});

test('opt-out は理由のコメントが直前にある場合だけ認める', () => {
  const lines = ['function A() {', '  // 理由', "  'use no memo';", '}'];
  expect(isDocumentedOptOut(lines, 1)).toBe(true);
  expect(isDocumentedOptOut(['function B() {', "  'use no memo';", '}'], 1)).toBe(false);
  expect(isDocumentedOptOut(['function C() {', '  return 1;', '}'], 1)).toBe(false);
});
