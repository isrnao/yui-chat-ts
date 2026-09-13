# 実装計画: top-and-transition-performance

## 概要

トップページの初期表示と、トップ → チャット遷移の体感を改善する。
各 PR は独立してマージでき、効果を都度ビルド実測で確認する。

## 推奨実装順序（PR 単位）

Lighthouse ベースライン（Performance 66 / LCP 8.9s / TBT 10ms）を踏まえ、
**LCP の 86% を占める Render Delay を潰す Task 8 を最優先**に組み替えた。
TBT が 10ms しかないため、JS 実行時間の削減より「描画開始を早めること」が効く。

1. ~~**PR1**: Task 1（R1）— フォント配信の最適化~~ → #97 で完了（480 KB → 89 KB）
2. **PR2**: Task 8（R8）— **静的 HTML への初期描画内容の埋め込み。LCP への効果が最大**
3. **PR3**: Task 9（R9）— サードパーティ遅延化（318 KB、うち GTM 172.7 KB）
4. **PR4**: Task 2（R2）— ルート単位 Code Splitting + Route_Error_Boundary
5. **PR5**: Task 3（R3）— トップからの supabase-js 排除。PR4 と合わせて効く
6. **PR6**: Task 4（R4）— クライアントサイド遷移。**遷移体感の本丸**
7. **PR7**: Task 5（R5）— Room_Prefetcher。PR4 + PR6 が前提
8. **PR8**: Task 6（R6）— チャット初期表示の段階化と差分取り直し
9. **PR9**: Task 7（R7）— バジェット検証と実測値の記録

## Tasks

- [x] 1. フォント配信の最適化（Requirement 1）— #97
  - [x] 1.1 `index.html` からフォントの `<link rel="preload" as="font">` を削除する
    - `font-display: swap` があるため描画は止まらない
    - _Requirements: 1.1, 1.4_
  - [x] 1.2 DotGothic16 を `unicode-range` 単位のサブセットへ分割する
    - latin / kana / jis1 / jis2 の 4 分割を基本とする
    - 生成手順をリポジトリに残す（スクリプト or 手順書）
    - _Requirements: 1.2, 1.5_
  - [x] 1.3 `src/styles/fonts.css` を複数 `@font-face` + `unicode-range` に書き換える
    - _Requirements: 1.2, 1.3_
  - [x] 1.4 合計の文字集合が分割前と一致することを確認する
    - チャット本文はユーザー入力のため、文字を削るサブセット化は不可
    - _Requirements: 1.5, 1.6_
  - [ ] 1.5 トップ / チャットで文字化け・フォールバック表示の退行がないことを目視確認する
    - _Requirements: 1.6_

- [ ] 2. ルート単位の Code Splitting（Requirement 2）
  - [ ] 2.1 `App.tsx` の各ルート import を `React.lazy` に置き換え、`Suspense` で包む
    - _Requirements: 2.1, 2.2, 2.3_
  - [ ] 2.2 Route_Error_Boundary を追加し、チャンクロード失敗時に再試行導線を出す
    - 既存 `src/shared/components/ErrorBoundary.tsx` を利用し、`key` による remount で再試行する
      （`ChatLogPage` で実績のある形）
    - `Suspense fallback` は `null` にしない
    - _Requirements: 2.4_
  - [ ] 2.3 `scripts/prerender-rooms.ts` に該当 Route_Chunk の `modulePreload` 埋め込みを追加する
    - チャンク名はビルドマニフェストから解決する
    - 動的 import による追加ラウンドトリップを消すのが目的
    - _Requirements: 2.5_
  - [ ] 2.4 リダイレクト仕様（`/chat` → `/chat/<default>`）の回帰テストが通ることを確認する
    - _Requirements: 2.6_
  - [ ]\* 2.5 `/` の依存グラフに chat feature が含まれないことをビルド検証で確かめる
    - _Requirements: 2.3_

- [ ] 3. トップからの supabase-js 排除（Requirement 3）
  - [ ] 3.1 Room_Counts_Client を PostgREST への直接 `fetch` に置き換える
    - `apikey` と `Authorization: Bearer` ヘッダを付与する
    - _Requirements: 3.1, 3.2_
  - [ ] 3.2 未設定時のガードと失敗時フォールバックの既存挙動を維持する
    - _Requirements: 3.3, 3.5_
  - [ ]\* 3.3 `roomCountsApi.test.ts` を新方式に合わせて更新する
    - 問い合わせ URL とヘッダ、未設定時、失敗時を検証する
    - _Requirements: 3.2, 3.3, 3.5_
  - [ ]\* 3.4 `/` が `vendor-supabase` / `vendor-iceberg-js` を取得しないことをビルド検証で確かめる
    - _Requirements: 3.4_

- [ ] 4. クライアントサイド遷移（Requirement 4）
  - [ ] 4.1 Client_Navigator を追加し、`document` に capture 付きクリックリスナーを 1 つ張る
    - _Requirements: 4.1, 4.3_
  - [ ] 4.2 除外条件を実装する
    - 左クリック以外 / 修飾キー / `defaultPrevented` / 別オリジン / `target` 指定 /
      `download` 属性 / ハッシュのみの変更
    - _Requirements: 4.2_
  - [ ] 4.3 遷移時にスクロール位置を先頭へリセットする
    - _Requirements: 4.5_
  - [ ] 4.4 `popstate` による戻る / 進むと、シェル配色更新が従来どおり動くことを確認する
    - _Requirements: 4.4, 4.6_
  - [ ] 4.5 プリレンダ済み URL への直接アクセス時の挙動が変わらないことを確認する
    - _Requirements: 4.7_
  - [ ]\* 4.6 Client_Navigator の単体テストを追加する
    - 内部リンクで `pushState` し、ドキュメント遷移を起こさないこと
    - 除外条件それぞれで既定動作を妨げないこと
    - _Requirements: 4.1, 4.2, 4.3_

- [ ] 5. Room_Prefetcher（Requirement 5）
  - [ ] 5.1 Room_Prefetcher を追加し、hover / focus / touchstart で Route_Chunk を先読みする
    - `React.lazy` と同じモジュール指定にしてキャッシュを共有させる
    - _Requirements: 5.1_
  - [ ] 5.2 同契機で `prefetchChatLogs(roomId)` を呼ぶ
    - _Requirements: 5.2_
  - [ ] 5.3 実行済み roomId を記録し、重複実行を防ぐ
    - _Requirements: 5.3_
  - [ ] 5.4 Network_Heuristics で低速回線 / `saveData` 時の先読みを抑制する
    - _Requirements: 5.4_
  - [ ] 5.5 先読みの失敗を握りつぶし、通常遷移を妨げないようにする
    - _Requirements: 5.5_
  - [ ]\* 5.6 Room_Prefetcher の単体テストを追加する
    - 一度きり実行 / 低速回線時の抑制 / 失敗の握りつぶし
    - _Requirements: 5.3, 5.4, 5.5_

- [ ] 6. チャット初期表示の段階化（Requirement 6）
  - [ ] 6.1 初回取得を表示行数分に絞り、残りを背景で補完する
    - 補完結果は `mergeChatLogByUuid` で統合する
    - _Requirements: 6.1, 6.2_
  - [ ] 6.2 接続確立時の取り直しを差分クエリに変更する
    - `loadChatLogsByTimeRange` を使い、取得済み最新発言を含む境界で問い合わせる
    - 現状は 100 件の全件取得（#95 で追加）
    - _Requirements: 6.3, 6.4_
  - [ ]\* 6.3 段階取得と差分取り直しの回帰テストを追加する
    - 背景補完で表示中の発言が失われないこと
    - 取り直しが取得済み最新以降のみを要求すること
    - _Requirements: 6.2, 6.3, 6.4_

- [ ] 8. 静的 HTML への初期描画内容の埋め込み（Requirement 8）
  - [ ] 8.1 トップページの初期描画内容をビルド時に生成し、`#root` に埋め込む
    - 現状 `scripts/prerender-rooms.ts` は meta タグのみ書き換えており、`#root` は空。
      トップも部屋ページも JS 到着まで一文字も描画されない
    - 方式は 2 案。採用前に比較する
      - (a) `react-dom/server` で SSG し、`createRoot` を `hydrateRoot` に変える。正攻法だが
        hydration mismatch（`useState(() => localStorage...)` 等）の対処が要る
      - (b) 静的スケルトンを HTML に埋め、`createRoot` がそのまま置換する。実装は軽いが
        マークアップの二重管理になる
    - _Requirements: 8.1, 8.2_
  - [ ] 8.2 置換時にレイアウトシフトが出ないことを確認する
    - _Requirements: 8.3_
  - [ ] 8.3 既存の meta / OGP / JSON-LD 生成を壊さないことを確認する
    - _Requirements: 8.4_
  - [ ] 8.4 JS 無効時にトップページの内容が表示されることを確認する
    - _Requirements: 8.5_
  - [ ]\* 8.5 ビルド成果物の `#root` が空でないことを検証する
    - _Requirements: 8.1_

- [ ] 9. サードパーティスクリプトの遅延化（Requirement 9）
  - [ ] 9.1 Google Tag Manager を初回描画後の読み込みに変える
    - 実測 172.7 KB。現状 `index.html` で `async` 読み込みしており、帯域を早期に奪う
    - _Requirements: 9.1, 9.5_
  - [ ] 9.2 X タイムライン埋め込みをビューポート到達まで遅延する
    - 実測 135.1 KB（widgets.js 27.5 + iframe ドキュメント 103.4）
    - _Requirements: 9.2_
  - [ ] 9.3 広告ウィジェットをビューポート到達まで遅延する
    - 実測 16.5 KB
    - _Requirements: 9.3_
  - [ ] 9.4 サードパーティの読み込み失敗時も本文が使えることを確認する
    - _Requirements: 9.4_

- [ ] 7. 計測と退行防止（Requirement 7）
  - [ ] 7.1 トップ初期 JS 転送量のバジェット検証スクリプトを追加する
    - 超過で非ゼロ終了。CI から呼べる形にする
    - _Requirements: 7.1, 7.2_
  - [ ] 7.2 改善前後の実測値を `design.md` の記録表に反映する
    - _Requirements: 7.3_
  - [ ] 7.3 Lighthouse の実測値を改善前後で記録する
    - ベースライン: Performance 66 / FCP 3.7s / LCP 8.9s / TBT 10ms / CLS 0
    - _Requirements: 7.4_

## 注記: 旧 spec との関係

[`spa-performance-optimization`](../spa-performance-optimization/tasks.md) の後継。旧 spec は
現行コードと乖離しているため、着手前に状態を実態へ合わせた。

| 旧 Task                           | 旧表記 | 実態                                                                 |
| --------------------------------- | ------ | -------------------------------------------------------------------- |
| Task 1 ルート単位 Code Splitting  | `[x]`  | **未反映**。成果物が現行 main に存在しない → 本 spec Task 2 で再実施 |
| Task 6 chatLogResource dedupe     | `[ ]`  | **実装済み**（in-flight Map あり）                                   |
| Task 7 realtimeChannelRegistry    | `[ ]`  | **実装済み**（refcount registry あり）                               |
| Task 8 useChatHandlers 参照安定化 | `[ ]`  | React Compiler 導入により**不要化**                                  |
| Task 11 TopPage 段階描画 + 先読み | `[ ]`  | 本 spec Task 5 / Task 6 が引き継ぐ                                   |
