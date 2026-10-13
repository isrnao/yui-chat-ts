# pnpm 12と安定版依存の更新（2026-10-13）

開始: develop_web-platform-first `44b3cf2`。更新は`feature/dependencies-pnpm12-stable`へ分離し、統合PR #254と別にレビューする。

## 更新方針

- pnpm 12.11.2を正確に固定。lockfileをpnpm 12で再生成し、CIのpnpm/action-setupをv6へ統一した。Node 24のCIを維持する。
- 最新stableのうち公開後24時間を経過した版を選び、minimumReleaseAge 1440・blockExoticSubdeps・ビルド許可リストを維持する。rc/beta/canaryの新規採用はしない。
- Nodeの実行条件をjsdom 30等の要求に合わせ、22.22.2以上の22系 / 24.15.0以上の24系 / 26以上に更新。ローカル22.22.3とCI24を検証対象とする。
- React / React DOMは19.3.0 stableへ。使用中のViewTransition、Activity、useEffectEventとSSG APIの動作を既存回帰で検証する。
- Vitest / UI / coverage-v8を5.0.4へ揃える。削除されたcoverage.allだけを除き、include/excludeと50% thresholdは維持。jest-domはVitest専用entryを使用する。
- VitestがVite 8を正式にpeer範囲へ含むため、Viteを強制する旧overrideを撤去。必要な互換組み合わせをpeer検査でも確認する。

## 見送り・保留

- Babel 8: React Compiler 1.0の分割代入default値に関する既知不具合が未解決。Babel 7.29.7を維持し、Compilerの全本番ファイル検査を通す。
- TypeScript 7: typescript-eslint 8.71.1のpeerはTypeScript <6.1。6.0.3を維持する。Node型定義も実行環境に合わせ24系24.19.2を採用する。
- Storybook 10.6.2、typescript-eslint 8.71.2、lefthook 2.2.2、postcss 8.5.30等は調査時点で公開後24時間未満。直前の成熟したstableへ更新し、保護を無効化しない。

## 直接依存の確認表

| パッケージ                         | 開始時                            | 採用範囲   | npm latest（調査時点） |
| ---------------------------------- | --------------------------------- | ---------- | ---------------------- |
| `@babel/core`                      | `~7.29.7`                         | `~7.29.7`  | `8.0.7`                |
| `@chromatic-com/storybook`         | `^5.2.1`                          | `^5.5.0`   | `5.5.1`                |
| `@eslint/js`                       | `^10.0.1`                         | `^10.0.1`  | `10.0.1`               |
| `@newrelic/browser-agent`          | `1.322.0`                         | `1.323.0`  | `1.323.0`              |
| `@playwright/test`                 | `^1.64.0`                         | `^1.64.0`  | `1.64.0`               |
| `@rolldown/plugin-babel`           | `^0.2.3`                          | `^0.2.4`   | `0.2.4`                |
| `@storybook/addon-docs`            | `^10.4.0`                         | `^10.6.1`  | `10.6.2`               |
| `@storybook/react`                 | `^10.4.0`                         | `^10.6.1`  | `10.6.2`               |
| `@storybook/react-vite`            | `^10.4.0`                         | `^10.6.1`  | `10.6.2`               |
| `@supabase/functions-js`           | `2.105.4`                         | `2.117.3`  | `2.117.3`              |
| `@supabase/postgrest-js`           | `2.105.4`                         | `2.117.3`  | `2.117.3`              |
| `@supabase/realtime-js`            | `2.105.4`                         | `2.117.3`  | `2.117.3`              |
| `@tailwindcss/cli`                 | `^4.1.8`                          | `^4.3.3`   | `4.3.3`                |
| `@tailwindcss/postcss`             | `^4.1.8`                          | `^4.3.3`   | `4.3.3`                |
| `@testing-library/jest-dom`        | `^6.6.3`                          | `^7.0.1`   | `7.0.1`                |
| `@testing-library/react`           | `^16.3.0`                         | `^16.3.3`  | `16.3.3`               |
| `@testing-library/user-event`      | `^14.6.1`                         | `^14.6.7`  | `14.6.8`               |
| `@types/babel__core`               | `^7.20.5`                         | `^7.20.5`  | `7.20.5`               |
| `@types/node`                      | `^24.0.1`                         | `^24.19.2` | `26.6.5`               |
| `@types/react`                     | `^19.3.0`                         | `^19.3.0`  | `19.3.0`               |
| `@types/react-dom`                 | `^19.3.0`                         | `^19.3.0`  | `19.3.0`               |
| `@typescript-eslint/eslint-plugin` | `^8.59.3`                         | `^8.71.1`  | `8.71.2`               |
| `@typescript-eslint/parser`        | `^8.59.3`                         | `^8.71.1`  | `8.71.2`               |
| `@vitejs/plugin-react`             | `^6.0.2`                          | `^6.1.2`   | `6.1.2`                |
| `@vitest/coverage-v8`              | `3.2.4`                           | `5.0.4`    | `5.0.4`                |
| `@vitest/ui`                       | `^3.2.4`                          | `^5.0.4`   | `5.0.4`                |
| `autoprefixer`                     | `^10.4.21`                        | `^10.6.1`  | `10.6.1`               |
| `babel-plugin-react-compiler`      | `^1.0.0`                          | `^1.0.0`   | `1.0.0`                |
| `chromatic`                        | `^13.2.0`                         | `^18.12.0` | `18.12.0`              |
| `dotenv-cli`                       | `^10.0.0`                         | `^11.0.0`  | `11.0.0`               |
| `eslint`                           | `^10.4.0`                         | `^10.12.0` | `10.12.0`              |
| `eslint-plugin-prettier`           | `^5.4.1`                          | `^5.5.6`   | `5.5.6`                |
| `eslint-plugin-react-hooks`        | `^7.1.1`                          | `^7.1.1`   | `7.1.1`                |
| `eslint-plugin-react-refresh`      | `^0.5.2`                          | `^0.5.7`   | `0.5.7`                |
| `eslint-plugin-storybook`          | `10.4.0`                          | `10.6.1`   | `10.6.2`               |
| `fast-check`                       | `^4.7.0`                          | `^4.10.2`  | `4.10.2`               |
| `gh-pages`                         | `^6.3.0`                          | `^6.3.0`   | `6.3.0`                |
| `globals`                          | `^16.0.0`                         | `^17.13.0` | `17.13.0`              |
| `jsdom`                            | `^26.1.0`                         | `^30.1.2`  | `30.1.2`               |
| `lefthook`                         | `^1.11.13`                        | `^2.2.1`   | `2.2.2`                |
| `lighthouse`                       | `^12.6.1`                         | `^13.5.0`  | `13.5.0`               |
| `lightningcss`                     | `^1.32.0`                         | `^1.33.0`  | `1.33.0`               |
| `postcss`                          | `^8.5.4`                          | `^8.5.29`  | `8.5.30`               |
| `prettier`                         | `^3.5.3`                          | `^3.9.10`  | `3.9.10`               |
| `react`                            | `19.3.0-canary-278794d7-20261002` | `19.3.0`   | `19.3.0`               |
| `react-dom`                        | `19.3.0-canary-278794d7-20261002` | `19.3.0`   | `19.3.0`               |
| `sass`                             | `^1.89.1`                         | `^1.105.1` | `1.105.1`              |
| `storybook`                        | `^10.4.0`                         | `^10.6.1`  | `10.6.2`               |
| `tailwindcss`                      | `^4.1.8`                          | `^4.3.3`   | `4.3.3`                |
| `typescript`                       | `~6.0.3`                          | `~6.0.3`   | `7.0.2`                |
| `typescript-eslint`                | `^8.59.3`                         | `^8.71.1`  | `8.71.2`               |
| `vite`                             | `^8.0.13`                         | `^8.3.4`   | `8.3.4`                |
| `vitest`                           | `^3.2.4`                          | `^5.0.4`   | `5.0.4`                |

## セキュリティ監査

更新前のpnpm auditは51件（critical 3 / high 26 / moderate 21 / low 1）。互換範囲内の間接依存も再解決し、更新後は本番依存0件、全依存ではhigh 1件のみ。

New Relic 1.323.0がfflate 0.8.2をexact pinしているため、`@newrelic/browser-agent>fflate`に限り公式修正版0.8.3へoverrideした。全パッケージに対する強制置換は行わない。

残るbraces 3.0.3は、gh-pages→globby→fast-glob→micromatch、およびTailwind CLI→@parcel/watcher→micromatchの開発/公開ツール依存。修正版は公開されていない。監査から除外せず、`pnpm audit`の非zero終了を既知の残存指摘として記録する。本番依存の監査成功を開発依存も0件であるという意味に読み替えない。

## 検証

型検査・lint、全96ファイル757テスト（coverage 50% threshold、Compiler全本番ファイル検査を含む）、167ページの公開SSGビルド、Storybook静的ビルドが成功。Vitest 5のASTベースcoverageでlines 93.79%、statements 91.69%。元のVitest 3の測定と同じ計測実装ではないため単純比較しない。

ブラウザ3構成108ケースとstrict peerを含むfrozen installも成功。node_modulesや.envをコピーしないclean sourceでもfrozen install・strict peer・型検査が成功。通常のpnpmコマンドも12.11.2のproject pinを使用することを確認済み。対象headのCIを継続確認する。Prettierの更新による2ファイルの整形以外に、アプリ機能の再設計は含めない。実Chrome/Safari/Android/iOS/VoiceOverの確認は自動試験とは区別する。

## 根拠

- [pnpmの公式インストール要件](https://pnpm.io/installation/) / [pnpm 11移行の設定・保護変更](https://pnpm.io/blog/releases/11.0) / [pnpm 12リリース](https://github.com/pnpm/pnpm/releases/tag/v12.0.0)
- [React 19.3安定版と関連修正](https://react.dev/blog/2026/09/09/react-19-3) / [CompilerとBabel 8の未解決修正](https://github.com/react/react/pull/37492)
- [Vitest 5移行](https://vitest.dev/guide/migration/) / [Vitest 4でのcoverage.all撤去](https://v4.vitest.dev/guide/migration.html)
- [fflateの修正版](https://github.com/advisories/GHSA-px8p-9vwx-vf98) / [bracesの未修正指摘](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
- 各version/engine/peerと公開時刻は公式npmレジストリで確認。採用した正確な解決版はpnpm-lock.yamlを参照。
