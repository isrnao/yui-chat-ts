# Web Platform First 実行記録

親Issue: [#234](https://github.com/isrnao/yui-chat-ts/issues/234)。更新されたIssue本文を設計の正本とする。

## ブランチ構成

開始main: `4618761e430aa052bf26fb5c1c88364e202a0e1d`（#235/#220マージ済み）。

`main` → `develop_web-platform-first` → 下表のfeatureを順に作成する。各featureは直前featureの最終commitを含み、PRのbaseも直前featureとする。後続の未着手ブランチは前段が確定してから作成する。featureを順番に統合してからdevelop→mainをレビューする。

## タスク

| 順序 | 優先度・タスク                                                            | 予定ブランチ                                   | 状態                                                                               |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1    | [WP1a #236](https://github.com/isrnao/yui-chat-ts/issues/236) (P0)        | `feature/web-platform-wp1a-entry-safety`       | [PR #247](https://github.com/isrnao/yui-chat-ts/pull/247) / draft・実機確認待ち    |
| 2    | [WP3 #238](https://github.com/isrnao/yui-chat-ts/issues/238) (P1)         | `feature/web-platform-wp3-ci-browsers`         | [PR #248](https://github.com/isrnao/yui-chat-ts/pull/248) / 全CI成功・実機確認待ち |
| 3    | [WP2a #239](https://github.com/isrnao/yui-chat-ts/issues/239) (P1)        | `feature/web-platform-wp2a-ssg-route`          | 実装・自動確認済み / PR作成中                                                      |
| 4    | [WP2b #240](https://github.com/isrnao/yui-chat-ts/issues/240) (P1)        | `feature/web-platform-wp2b-static-404`         | 未着手                                                                             |
| 5    | [WP2c #241](https://github.com/isrnao/yui-chat-ts/issues/241) (P1)        | `feature/web-platform-wp2c-mpa-seo`            | 未着手                                                                             |
| 6    | [WP4 #243](https://github.com/isrnao/yui-chat-ts/issues/243) (P2)         | `feature/web-platform-wp4-performance`         | 未着手                                                                             |
| 7    | [P2 Chanari #244](https://github.com/isrnao/yui-chat-ts/issues/244) (P2)  | `feature/web-platform-chanari-native-controls` | 未着手                                                                             |
| 8    | [P2 通報form #245](https://github.com/isrnao/yui-chat-ts/issues/245) (P2) | `feature/web-platform-report-native-form`      | 未着手                                                                             |
| 9    | [P2 CSS #246](https://github.com/isrnao/yui-chat-ts/issues/246) (P2)      | `feature/web-platform-css-presentation-state`  | 未着手                                                                             |

ユーザー指定により#237（計測URL保護）と#242（通報導線）は対象外とし、not plannedでクローズ。作業順・現在のfeatureは上表と各Issueで追跡する。P2の既存ReportDialogフォーム簡素化は残す。P2候補は比較と採否記録を含む。対応方針は最新版Chrome（Desktop/Android）とSafari（macOS/iOS）。自動試験と実機確認を区別する。

## WP1a：入室フォームの送信安全性

- 通常・ChanariのSSG submitをdisabledにし、入力は編集可能に保つ。フォーム内のuseSyncExternalStoreのserver snapshotはfalse、client snapshotはtrueとし、hydration中のHTMLを一致させる。root全体の解禁フラグは使わない。
- 先行入力をlayout effectで取り込み、同じhydration境界で保存設定に追随する。Chanariにも同じ保持処理を追加。
- submit handlerは未準備・pending・同一tickの二重送信を拒否。同期例外/Promise rejectionを親の失敗表示へ委ね、IME中のEnterも抑止。
- 静的detailsに説明・再読込・トップへのリンクを置き、hydration前後で表示領域を変えない。送信失敗時の本文復元・下書き・dialog構造は既存仕様を維持。

### 検証

検証結果は実装PRとここに記録する。Chrome/Safariの実機（VoiceOver、Android/iOS含む）は現在未確認。最低版/OS下限と実機確認担当はWP3 #238で確定し、実機結果を得るまで子Issueを完了扱いにしない。

WP1aのローカル結果（2026-10-13）：

- typecheck・全体lint成功。公開ビルド成功、164ページSSG。
- 全Vitest初回は729/730成功。失敗した新hookのReact Compiler `finally`未対応を同じ処理の書換えで解消し、Compiler全ファイル検査とhook試験4件が成功。
- Chromium/Desktop WebKit/Mobile WebKitの51ケース成功（うち送信安全性24ケース）。初回の並列実行では負荷下の既存Chromium 3ケースがtimeout。単体試験と競合しない1 workerで全ケースを再実行して成功。
- 実Chrome/Safari、実Android/iOS、VoiceOverは未確認。自動結果だけで#236を閉じない。

WP1a最終自動確認: pnpm 10.34.6を別のclean checkoutでfrozen installし、全Vitest（coverageあり）成功。同じソースの[PR #247 CI](https://github.com/isrnao/yui-chat-ts/actions/runs/38316880395/job/115035516878)でもtypecheck/lint・**95ファイル730件成功**を確認（Node 24.21.0、旧workflowは未固定pnpm 12.11.2）。新しいpnpm固定の検証は次のWP3で追跡する。

## WP3：CI・ブラウザ条件の統一

#236の最終commit `db3c06f16efe5e9b5072341fcef4db9ffc5eee60`からfeatureを作成。`packageManager`をpnpm 10.34.6に固定し、ci/browserはNode 24・frozen install・pnpm cacheを揃える。別version指定がpinと衝突しないようChromatic/save-chat/two-shotのpnpm導入も同じpackageManagerへ合わせる。lockfileと依存バージョンは変更しない。

必須PlaywrightはChromium/Desktop WebKit/Mobile WebKitとし、FirefoxのprojectとCIでのブラウザ取得を除外。実機の最低版・OS下限・担当者の未確認事項は[BROWSER_SUPPORT.md](BROWSER_SUPPORT.md)に明示する。

別checkoutに元のnode_modulesをコピーせず、pnpm 10.34.6で649パッケージをfrozen installした。全Vitest、typecheck、lint、公開ビルド（164ページSSG）が成功。ローカルNodeは22.22.3であり、Node 24の最終保証は対象PRのCIで確認する。

WP3のclean checkoutでも、変更後の3 projectで**51ブラウザケース成功**。Node/pnpm/frozenのYAML整合とPlaywrightのproject一覧を確認。実機・VoiceOver、ブラウザ最低版/OS下限の確定は未完了として残す。

## WP2a：SSGルート照合・URL保持

#248のhead `4514236a7c777851dcbd3080b08866976edb5b16`からfeatureを作成。SSRビルドから共有の`getSsgPathname`を公開し、描画と同じ経路解決規則で`data-ssg-path`を生成する。HTML属性値はエスケープする。

起動時はSSGマーカーと現在URLが同じ既知画面の場合だけhydrate。別画面・未知ルート・旧成果物のマーカー欠落はcreateRootで現在の画面を描く。preload後のURLを照合する。Appと旧404復元scriptのreplaceStateはhistory.state・query/hashを保持する。

ローカル確認：typecheck/lint、Compilerを含む関連5ファイル71件、Chromium/Desktop WebKit/Mobile WebKitの関連45ブラウザケース成功。公開ビルドの164 SSGページの全マーカーが出力先と一致。トップHTMLの誤配信、マーカー欠落、旧別名復元、再読込・戻る/進む、先行入力・送信安全性を検証した。

旧404経路のトップ初期表示とJSなしの空404は、WP2bで置き換える。実Chrome/Safari・実Android/iOSの確認は未完了。
