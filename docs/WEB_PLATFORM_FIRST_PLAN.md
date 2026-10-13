# Web Platform First：残作業・簡素化計画（2026-10-13）

**対象：`main` `4618761e430aa052bf26fb5c1c88364e202a0e1d`（2026-10-13確認）**。 [#235](https://github.com/isrnao/yui-chat-ts/pull/235) → [#220](https://github.com/isrnao/yui-chat-ts/pull/220) → `main` のマージは完了しています。R0〜R9で実装済みのDialog・IME・ラベル・splitter・先行入力保持・CI整備を再実装しません。**このIssueは以下の未完了作業の正本**とし、旧レビュー時点の「未マージ」説明・重複した初期計画は除きます。

**最優先（P0）**：SSG/Hydration前に入室フォームの入力値が意図せずGET送信される経路を解消する。ブラウザを最新版Chrome/Safariに絞っても、この優先度は変えません。

## 方針・スコープ

- **MPA + ビルド時SSG + Reactを維持**。HTML/ブラウザに意味論・フォーム・開閉・標準フォーカスを、CSSに表示状態を、Reactにsession・Realtime・送信・同期・対象UUID・pending/error・保存/復元を担当させる。
- **対象ブラウザは最新版Chrome（Desktop/Android）とSafari（macOS/iOS）に限定する方針**。最低版・OS下限を実装PRで確定し明記する。Chromium/WebKitでのPlaywright成功を実Chrome/Safariの確認と同一視しない。
- ネイティブ`<dialog>`一本化を維持し、R8/R9で撤去した行Popover／Invoker Commands／LegacyModalShell／明示的retry UIを復活させない。**送信失敗時に新しい編集を上書きせず本文を復元する動作**、下書き復元、IME、読書位置は維持。
- React全面廃止、Next.js/RSC・全面Web Components化、Navigation APIへの移行、専用2shotの再開は対象外。公開中の通常2shotは回帰対象。CSS新機能の使用数や`useState`の削減数自体を成果としない。
- `build.target: es2022`はJSの変換対象でありDOM APIの動作保証ではない。SafariとChromeに差がある機能（Dialogのlight-dismiss、アイドル実行など）は必要な代替処理を維持する。

## 作業チェックリスト

### P0 — WP1：初期HTMLの送信安全性

- [ ] **WP1a**：通常・ChanariのSSG入室フォームをHTML出力時点から送信不可にし、フォームごとの準備完了後にだけ解禁する。入力欄とHydration前の先行入力は保持する。

### P1 — WP2：MPA / SSG / URLを一貫させる

- [ ] **WP2a**：SSG描画ルートと現在ルートを照合し、別ルートのHTMLに誤Hydrationしない。正常な`history.state`・query/hashを保持する。
- [ ] **WP2b**：静的404・別名入口を整備し、旧GitHub Pages SPA復元scriptを整理。Pages相当配信・実ホストHTTPを確認する。
- [ ] **WP2c（簡素化判定）**：MPAで不要な`App.tsx`の`resolution` state／`popstate`監視と、静的ページでの`useSEO`更新を調査。不要と立証できた責務のみ削除・縮小する。

### P1 — WP3：CI・対応ブラウザ

- [ ] `packageManager`に検証したpnpmの正確な版を固定し、`ci.yml`と`browser.yml`のNode/pnpm・frozen installを統一。clean checkoutで全品質ゲートを確認する。
- [ ] Playwright必須構成をChromium・Desktop WebKit・Mobile WebKit中心に整理し、Firefoxは対応対象外として必須から除外。実Chrome/Safari（Android/iOSを含む）の手動確認責任・最低版を記録する。
- [ ] WP1・WP2・採用したP2変更の不足する回帰試験を該当PRで追加する。既存テスト通過だけでJS未準備時の送信やGitHub Pages相当の404を保証したと見なさない。

### P2 — WP4 / UI簡素化

- [ ] 最新`main`で性能（転送JS量、LCP/INP、入力可能時刻等）を再計測。必要な場合だけHydration範囲などを最適化し、見送りの場合も根拠を残す。
- [ ] Chanariの**表示専用状態**（`effect` / `fontSize` / `disableEffect`）をネイティブSelect/Checkboxの非制御状態へ移す可否を評価し、機能が動作するように改修。ATフィールドの`aria-pressed`ボタンは現行仕様優先。
- [ ] `ReportDialog`のRadio/詳細文をFormData + HTMLバリデーションへ移し、理由依存の説明を`:has()`で表示できるか検証。通報対象UUID、送信中/結果、二重送信防止、リクエストの世代管理はReactに残す。
- [ ] `:user-invalid` / `:has()` / `:focus-within`で装飾専用stateを減らせる箇所を点検。`field-sizing: content`は固定高さ・レトロUIの体験を変えないTextareaに限り検証。
- [ ] Popover APIは**新しい非モーダル開閉要件が発生した場合にのみ**検討。削除済みUIの復活はしない。P2候補は独立PRで採否と効果を記録し、必須機能の修正より優先しない。

## 実装・受け入れ条件

### WP1a：入室フォーム（P0）

対象：[`EntryForm`](https://github.com/isrnao/yui-chat-ts/blob/4618761e430aa052bf26fb5c1c88364e202a0e1d/src/features/chat/components/EntryForm/index.tsx)、[`ChanariEntryForm`](https://github.com/isrnao/yui-chat-ts/blob/4618761e430aa052bf26fb5c1c88364e202a0e1d/src/features/chanari-chat/components/ChanariEntryForm/index.tsx)、関連する送信経路。

- SSR/SSGの送信ボタンを最初から`disabled`にする。入力フィールドは編集可能とし、送信ボタン以外の関連submitterや暗黙Enter送信、プログラムからの`requestSubmit()`を点検。`form.submit()`は使用しない。単に既定ボタンを削除して暗黙送信の仕様を変える案は採らない。
- SSRと初回クライアント描画を**同じ送信不可状態**にし、各フォームのhandler接続・保存設定読込・先行入力反映・必要なsession準備を満たした時だけ解禁。root全体のEffectでの一括解禁やdocument-wide JS guardに依存しない。JS側でも未準備/送信中を拒否する。
- JS無効／module遅延／CSP拒否／初期chunk失敗で合成した名前・メールを入力し、Enterと送信ボタンを操作しても値を含むGET/URL遷移が発生しない。JSなしでは静的説明と再読み込み・トップへの導線を残す。既存の初期表示と大きなレイアウトシフトを起こさない。
- Hydration前の先行入力が設定復元で上書きされず、準備後は入室が一度だけ実行される。IME確定、reset、キャンセル、pendingと送信失敗後の本文復元も確認する。

### WP2：MPA / SSG / 404 / SEO（P1）

対象：[`main.tsx`](https://github.com/isrnao/yui-chat-ts/blob/4618761e430aa052bf26fb5c1c88364e202a0e1d/src/main.tsx)、[`App.tsx`](https://github.com/isrnao/yui-chat-ts/blob/4618761e430aa052bf26fb5c1c88364e202a0e1d/src/App.tsx)、`prerenderHtml.ts`、`public/404.html`、`index.html`、`useSEO.ts`。

- SSG生成HTMLに正規ルート識別子（例：`data-ssg-path`）を安全に埋め込み、現在URLから解決した**同じ画面**の場合のみhydrate。異なる/欠けたマーカーの場合は誤Hydrationせず、適切な再描画・404へ分岐する。
- `replaceState`でURLを正規化する場合、`history.state`と正当なsearch/hashは保持。**ナビゲーション用URLと計測用URLは別に扱い**、未知URLをトップのSSGと誤認しない。
- `public/404.html`に本文・見出し・実リンクを持つ静的404を用意し、古い`/?/`復元スクリプトを整理。正規/別名/未知URLのリストをソースから確定。必要な別名には静的入口または実際の配信環境が許すHTTPリダイレクトを用意する。
- トップ・通常・全部屋・Chanari・公開通常2shot・別名・未知URLで、直リンク、再読込、戻る/進む、canonical/SEO、実際の404 HTTP応答、JSなしでの表示を確認。Vite fallbackの成功だけでGitHub Pagesの配信を保証しない。
- 内部`pushState`遷移がないこと、`popstate`購読に依存する動作がないことを検証できた場合のみ、`App.tsx`のルーティングstate/監視を縮小。SSGのheadが正しい静的ページは`useSEO`による重複更新を削減するが、2shot等の動的SEOは残す。Hydration mismatchや正当query/hash欠落がないことを確認する。

### WP3：再現性・ブラウザ（P1）

対象：`package.json`、`.github/workflows/ci.yml` / `browser.yml`、`playwright.config.ts`。

- pnpmの正確な版とNode条件を揃え、clean checkoutからtypecheck・lint・Vitest・公開SSGビルド・ブラウザ試験を成功させる。`pnpm install --frozen-lockfile`はCI＋lockfileがある場合に既定でもあるため、明示の目的は再現性と意図の統一。
- Chromium／Desktop WebKit／Mobile WebKitの自動試験を維持し、Firefoxは必須ゲートから除外。実Chrome Desktop/AndroidとmacOS/iOS Safariで、特にIME・フォーカス・Dialog取消・フォームを確認する。PR本文に実際のOS/ブラウザ版・担当・結果または未確認理由を記録する。
- JS読込前のEnter、CSP拒否、配信404を各PRの回帰条件として追加。既存のCI結果を新しいケースの通過証拠にはしない。

### WP4 / P2候補の評価（P2）

- 最新`main`のトップ・通常・全部屋・Chanariを、同一端末/回線・cold/warm・外部タグ条件で複数回測定。**入力可能時刻とRealtime接続完了を区別**し、最新の転送JS量・LCP・INP・操作遅延を採否の根拠とする。
- Chanariの表示専用選択値は非制御HTML化と機能有効化を検証。再入室時の既定値/見た目が変わらないことを条件とし、送信metadataの仕様変更はしない。
- 通報フォームはHTMLの`required`・`maxLength`・FormDataを使い、送信値は送信前とサーバー側の双方で検証。表示だけの理由分岐は`:has()`で代替できるか検証する。再オープン時リセットと保留中の二重送信防止は保持。
- CSS候補（`:has()`、`:user-invalid`、`field-sizing: content`）は実際にコード/状態が減り、動作・アクセシビリティを維持できるときだけ採用。`useSplitterDrag`、`useDoubleTap`、`useVisibleInterval`、外部Widget遅延読込、通信処理を無理にCSS化しない。

## 実行順・見積もり・確認

| 順序 | 単位                              | 以前の目安 |
| ---- | --------------------------------- | ---------- |
| 1    | WP1（P0）送信防止                 | 1〜2人日   |
| 2    | WP2a（P1）SSG経路照合・URL保持    | 0.5〜1人日 |
| 3    | WP2b（P1）静的404・別名・配信試験 | 1〜2人日   |
| 並行 | WP3（P1）pnpm・CI・ブラウザ方針   | 0.5〜1人日 |
| 4    | WP4（P2）最新性能計測・採否記録   | 0.5〜1人日 |

**従来の4〜8人日は上記の旧必須作業の概算**。追加したWP2c/フォーム・SEO/Chanari等のP2簡素化、通報方式決定後の実装、最適化本実装、実機確保や競合対応は**未見積もり**。追加候補は必要に応じて独立PRとし、作業・検証の工数を決めてから採否判断する。

- 変更したPRの作成者が関連自動テストを追加・実行し、レビュアーが対象コミットのCI・操作経路を確認。
- 入力/モーダル/通報に触れるPRではIME・Escape・タッチ・フォーカス復帰を記録。Safari（VoiceOverを含む）およびChrome/Androidの実機結果か未確認理由を記録。
- 404/リダイレクトの変更はGitHub Pages相当のfixtureと公開前の実ホストHTTPを確認。
- 旧CI実績（[#235での単体94ファイル724件](https://github.com/isrnao/yui-chat-ts/actions/runs/38278116110/job/114908468773)、[ブラウザ36件・164ページSSG](https://github.com/isrnao/yui-chat-ts/actions/runs/38278116150/job/114908491576)）は**マージ前head `926ef2f`の実績**。今回の未実装項目や実機確認の結果ではない。本番GAの実受信、アクセスログ、実機でのReact hydration errorも独立再検証していない。

## 完了条件

- [ ] WP1a：準備前GET送信をテストで防止できている。
- [ ] WP2a/b：誤Hydration・query/hash消失を解消し、静的404と正規/別名をGitHub Pages相当＋実ホストで確認。WP2cは調査・採否記録。
- [ ] WP3：対象ブラウザ/最低版、再現可能なCI、実機確認結果・担当を記録。
- [ ] WP4と追加P2候補は計測/比較による採否と、採用した場合の独立PR・テスト結果を記録（不要なら根拠を記して見送り可）。
- [ ] `docs/ARCHITECTURE.md` / `docs/TEST_STRATEGY.md` / `docs/NATIVE_INTERACTION_EXECUTION.md` を最終実装に合わせて更新し、Issueは根拠付きで閉じる。

## 実行タスク・ブランチ（2026-10-13着手）

ユーザー指定により **#237（計測URL保護）と#242（通報導線）は対応対象外** とし、not plannedで閉じました。P2の既存ReportDialogフォーム簡素化は残します。

main `4618761` → `develop_web-platform-first` → `feature/web-platform-wp1a-entry-safety` → `feature/web-platform-wp3-ci-browsers` → 以降のfeatureを直前featureの最終commitから作成します。PRのbaseも直前featureとします。

- [ ] #236 — P0 / WP1a：SSG入室フォームを準備完了まで送信不可にする
- [ ] #238 — P1 / WP3：Node/pnpmとChrome・Safari向け品質ゲートを統一する
- [ ] #239 — P1 / WP2a：SSGルート照合とquery/hash・history.state保持を実装する
- [ ] #240 — P1 / WP2b：静的404・別名入口とPages相当配信テストを整備する
- [ ] #241 — P1 / WP2c：MPAルーティングstateと静的SEO更新の必要性を判定する
- [ ] #243 — P2 / WP4：最新実装の性能を再計測し最適化の採否を記録する
- [ ] #244 — P2 / P2 Chanari：Chanari表示専用コントロールの非制御HTML化を評価する
- [ ] #245 — P2 / P2 通報form：通報フォームのFormData・HTMLバリデーション化を評価する
- [ ] #246 — P2 / P2 CSS：装飾専用stateとtextareaのCSS化候補を評価する

まず#236から実装し、次に#238へ進みます。P2候補は採否記録を含むタスクです。

**参考**：実装済みR0〜R9の経緯は[Native Interaction Execution](https://github.com/isrnao/yui-chat-ts/blob/4618761e430aa052bf26fb5c1c88364e202a0e1d/docs/NATIVE_INTERACTION_EXECUTION.md)と[#220](https://github.com/isrnao/yui-chat-ts/pull/220)/[#235](https://github.com/isrnao/yui-chat-ts/pull/235)を参照。

実装経過とブランチごとの検証記録は[WEB_PLATFORM_EXECUTION.md](WEB_PLATFORM_EXECUTION.md)を参照。
