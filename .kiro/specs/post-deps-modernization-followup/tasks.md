# 実装計画: post-deps-modernization-followup

## 概要

3 件の後処理を 3 PR に分け、低リスク・緊急 → 高リスクの順で進める。各 PR は独立に revert 可能、`git bisect` で障害原因を 1 PR まで特定できるよう、**1 PR = 1 Requirement** を原則とする。

## 推奨実装順序 (PR 単位)

1. **PR A**: Task 1 (R1) — RetroSplitter `top.type.name` 依存解消 (🔴 critical bug fix)
2. **PR C**: Task 2 (R2) — `vite-tsconfig-paths` 導入 (config SSoT)
3. **PR D**: Task 3 (R3) — Vitest 4 + coverage threshold 再設計 + Vite override 解除

Task 4 (R4: 横断検証) は各 PR の最終コミット時に共通で実施する横断タスク。

## Tasks

- [ ] 1. RetroSplitter `top.type.name` 依存解消 (Requirement 1、PR A)
  - [ ] 1.1 `src/features/chat/components/RetroSplitter/index.tsx` に `topInitialPercent?: number` prop を追加 (デフォルト 30)
    - 既存の `getTopTypeName` / `resolveInitialTopHeight` ヘルパーを削除
    - `useState<number>(topInitialPercent)` を初期値にする
    - 親で `topInitialPercent` が変わったら `useResetOnChange(topInitialPercent, setTopHeight)` で巻き戻す
    - _Requirements: 1.1_
  - [ ] 1.2 `src/routes/ChatRoute.tsx` の `<RetroSplitter>` 呼び出しで `topInitialPercent={entered ? 18 : 26}` を渡す
    - マジックナンバー 18 / 26 の意図をコメントで残す (ChatRoom 表示時 / EntryForm 表示時)
    - _Requirements: 1.5_
  - [ ] 1.3 `RetroSplitter` の他の利用箇所を `git grep "<RetroSplitter"` で網羅し、それぞれに適切な `topInitialPercent` を渡す
    - `src/features/chanari-chat/` 配下に同様の利用があれば同時更新
    - _Requirements: 1.5_
  - [ ] 1.4 `src/features/chat/components/RetroSplitter/RetroSplitter.test.tsx` の `sets initial topHeight based on top element type` ケースを prop 駆動に追従するテストへ書き換える
    - `function ChatRoom() {...}` リテラル名比較を `topInitialPercent={18}` 経由の挙動 assert へ
    - _Requirements: 1.3_
  - [ ] 1.5 `pnpm build && pnpm preview` を実行し、production minify 環境で実 DOM の topHeight を目視確認する
    - 未入室時の `EntryForm` で `topHeight ≈ 26%`
    - 入室後の `ChatRoom` で `topHeight ≈ 18%`
    - DevTools Elements で computed `height` 属性を確認 (% で表示される想定)
    - _Requirements: 1.2_
  - [ ] 1.6 `vite.config.ts` の `build.terserOptions.mangle.toplevel` を変更していないことを `git diff` で確認
    - _Requirements: 1.4_
  - [ ] 1.7 PR4 共通検収を実行する (typecheck / lint / test / build / preview)
    - _Requirements: 4.1, 4.2_

- [ ] 2. `vite-tsconfig-paths` 導入による path mapping SSoT 化 (Requirement 2、PR C)
  - [ ] 2.1 `pnpm add -D vite-tsconfig-paths@^6` を実行する
    - インストール後 `pnpm list vite-tsconfig-paths` で `^6.x` 系の最新 (spec 着手時点 6.1.1) が解決されることを確認
    - _Requirements: 2.1, 2.6_
  - [ ] 2.2 `vite.config.ts` の `plugins` 配列の先頭に `tsconfigPaths()` を追加し、ファイル末尾の `resolve.alias` ブロック全体を削除する
    - import 追加: `import tsconfigPaths from 'vite-tsconfig-paths';`
    - _Requirements: 2.2_
  - [ ] 2.3 `pnpm typecheck` / `pnpm test` / `pnpm build` / `pnpm build-storybook` を実行し、すべて緑であることを確認する
    - 特に build artifact の `vendor-react` / `vendor-supabase` chunk 命名が PR6 後と同一であること (manualChunks 関数は alias 解決に依存しないため不変を期待)
    - _Requirements: 2.3_
  - [ ] 2.4 `pnpm preview` を起動し `/` および `/chat/superbeginner` で Console エラー / module not found が出ないことを目視確認する
    - _Requirements: 2.4_
  - [ ] 2.5 `pnpm storybook` を起動し、`@features/*` を import している任意の story (例: `EntryForm.stories.tsx`) が正常描画されることを確認する
    - _Requirements: 2.5_
  - [ ] 2.6 PR4 共通検収を実行する
    - _Requirements: 4.1, 4.2_

- [ ] 3. Vitest 4 + coverage threshold 再設計 + Vite override 解除 (Requirement 3、PR D)
  - [ ] 3.1 `pnpm up vitest@^4 @vitest/coverage-v8@^4 @vitest/ui@^4` を実行する
    - _Requirements: 3.1_
  - [ ] 3.2 `pnpm-workspace.yaml` から `overrides: { vite: ^8.0.0 }` ブロックを削除する
    - 削除後 `CI=true pnpm install` を実行し、`ls node_modules/.pnpm | grep ^vite@` の出力が `vite@8.0.13` 1 件のみであることを確認
    - _Requirements: 3.3_
  - [ ] 3.3 Vitest 4 の deprecated 警告 / 設定スキーマ変更を確認する
    - `pnpm test 2>&1 | grep -iE 'deprecat|warning'` で警告ゼロ
    - `vite.config.ts` の `test.coverage.exclude` / `test.environment` 等で rename / 削除があれば追従修正
    - _Requirements: 3.4_
  - [ ] 3.4 `pnpm test` の coverage `branches` が `vite.config.ts` の `test.coverage.thresholds.branches: 50` をクリアすることを確認する
    - クリアした場合: 3.5 / 3.6 はスキップ
    - 割っている場合: 3.5 に進む
    - _Requirements: 3.2_
  - [ ] 3.5 (条件付き) Coverage_Threshold_Strategy 案 (a) を実装する: `@vitest/coverage-v8` → `@vitest/coverage-istanbul` に切替
    - `pnpm remove @vitest/coverage-v8`
    - `pnpm add -D @vitest/coverage-istanbul@^4`
    - `vite.config.ts` の `test.coverage.provider: 'v8'` → `'istanbul'` に変更
    - `pnpm test` で再計測し threshold クリアを確認
    - _Requirements: 3.2 (a)_
  - [ ] 3.6 (条件付き) (a) でも threshold を割る場合のフォールバック: (b) 意味のあるテスト追加 / (c) threshold 引き下げ のいずれかを採用
    - 採用した案 (a/b/c) と理由を design.md の「Coverage_Threshold_Strategy 採択結果」セクションに 1 段落で追記
    - _Requirements: 3.2 (b)(c)_
  - [ ] 3.7 PR4 共通検収を実行する (typecheck / lint / test / build / build-storybook / preview)
    - Vitest 4 への移行で `pnpm-lock.yaml` に大規模 diff が出ることを許容
    - _Requirements: 4.1, 4.2_

- [ ] 4. 横断検証 (Requirement 4、横断タスク)
  - [ ] 4.1 各 PR の最終コミット時点で以下を緑にする
    - `pnpm typecheck`
    - `pnpm lint`
    - `pnpm test` (Req 3 で再設計した threshold をクリア)
    - `pnpm build`
    - `pnpm preview` (Req 1 では実 DOM で topHeight も目視確認)
    - `pnpm build-storybook` (Req 2 では viteFinal の挙動も確認)
    - _Requirements: 4.1_
  - [ ] 4.2 `lefthook` の pre-commit / pre-push フックを変更せずに緑で通過することを確認する
    - _Requirements: 4.2_
  - [ ] 4.3 全 PR マージ後、Node `v22 LTS` のクリーン環境で `rm -rf node_modules && pnpm install && pnpm build:prod` が完走することを 1 回確認する
    - _Requirements: 4.3_

## 切り戻し方針

- 各 PR は **完全に独立に revert 可能** であることが原則
- Req 1 (RetroSplitter) は runtime 挙動変更を含むため、本番投入後 7 日間は監視期間とする。dev では関数名が保持されるため、production minify でのみ顕在化していたバグの修正であり、dev/preview/production すべてで topHeight 挙動を確認後にマージする。
- 切り戻し時は `package.json` / `pnpm-lock.yaml` / `vite.config.ts` / `pnpm-workspace.yaml` / 変更した src/ ファイルを同一コミットで revert する

## 他 spec との衝突回避

- 本 spec は [[spec-deps-modernization-vite8]] の後処理として、その全 PR が main に取り込まれた状態を起点とする
- 将来の [[spec-react-19-api-adoption]] (仮称、`useEffectEvent` / `<Activity />` / Supabase Realtime V2 metadata 等) は本 spec とは独立に進められる
- [[spec-spa-perf]] の未完了 PR との衝突可能性は低い (本 spec は `vite.config.ts` の `manualChunks` 関数を変更しないため)
