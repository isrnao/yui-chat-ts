// @vitest-environment node
/**
 * Compiler_Check（.kiro/specs/react-2026-refactoring Requirement 1）。
 *
 * src の本番コードを React Compiler に通し、コンパイルできなかった関数があれば失敗させる。
 * コンパイラは既定では失敗を黙って飛ばす（panicThreshold: 'none'）ため、ビルドが通っていても
 * メモ化されていないことがある。実際に @babel/core 8 と組み合わせたときは、分割代入の
 * デフォルト値を持つ関数がすべて素通りしていた（react/react#36868）。
 */
import { globSync, readFileSync } from 'node:fs';
import { transformSync } from '@babel/core';
import reactCompiler from 'babel-plugin-react-compiler';
import { expect, test } from 'vitest';

/**
 * 意図してコンパイル対象から外す関数（`path:line`）。
 * 載せる関数には 'use no memo' と、外す理由のコメントを付ける。
 */
const ALLOWLIST: readonly string[] = [];

const EXCLUDE = /\.(test|stories)\.|^src\/test\/|^src\/storybook\/|\.d\.ts$/;

type CompilerEvent = {
  kind: string;
  fnLoc?: { start?: { line?: number } } | null;
  detail?: { options?: { reason?: string }; reason?: string };
};

function collectCompileErrors(): string[] {
  const failures: string[] = [];
  const files = globSync('src/**/*.{ts,tsx}').filter((file) => !EXCLUDE.test(file));
  expect(files.length).toBeGreaterThan(0);

  for (const file of files) {
    transformSync(readFileSync(file, 'utf8'), {
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
                const line = event.fnLoc?.start?.line ?? '?';
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
  const failures = collectCompileErrors().filter(
    (failure) =>
      !ALLOWLIST.some((allowed) => failure.startsWith(`${allowed} `) || failure === allowed)
  );
  expect(failures).toEqual([]);
});
