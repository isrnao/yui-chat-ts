# Web Platform First 実行記録

親Issue: [#234](https://github.com/isrnao/yui-chat-ts/issues/234)。更新されたIssue本文を設計の正本とする。

## main向け統合（2026-10-13）

#247〜#252はすべてdevelop_web-platform-firstへマージ済み。取得した統合headは`7199771e177456d494c6f7c2077773350a614a9e`、mainは`4618761e430aa052bf26fb5c1c88364e202a0e1d`。統合headのtreeは最終feature head `a3d508e17cc095405cf70cc521ce99069b9c09a0`と一致し、入室安全性・CI条件・SSG/URL照合・静的404/別名・MPA/SEO簡素化・性能比較を含む。main向けPRで差分全体の設計と回帰をレビューする。

最終featureのCIは単体96ファイル757件、167 SSG、3 projectの108ブラウザケースが成功。統合PRのheadに対するCIは別に確認する。マージ済みという状態を実機・公開後HTTP・実ユーザーINPの確認完了には読み替えない。実機/最低版/OS/担当はBROWSER_SUPPORT.md、公開後HTTPは#240、実環境性能は#243で追跡し、#244〜#246は未着手の後続タスクとして残す。

## ブランチ構成

開始main: `4618761e430aa052bf26fb5c1c88364e202a0e1d`（#235/#220マージ済み）。

`main` → `develop_web-platform-first` → 下表のfeatureを順に作成する。各featureは直前featureの最終commitを含み、PRのbaseも直前featureとする。後続の未着手ブランチは前段が確定してから作成する。featureを順番に統合してからdevelop→mainをレビューする。

## タスク

| 順序 | 優先度・タスク                                                            | 予定ブランチ                                   | 状態                                                                               |
| ---- | ------------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1    | [WP1a #236](https://github.com/isrnao/yui-chat-ts/issues/236) (P0)        | `feature/web-platform-wp1a-entry-safety`       | [PR #247](https://github.com/isrnao/yui-chat-ts/pull/247) / developへマージ済み・実機確認待ち    |
| 2    | [WP3 #238](https://github.com/isrnao/yui-chat-ts/issues/238) (P1)         | `feature/web-platform-wp3-ci-browsers`         | [PR #248](https://github.com/isrnao/yui-chat-ts/pull/248) / developへマージ済み・実機確認待ち |
| 3    | [WP2a #239](https://github.com/isrnao/yui-chat-ts/issues/239) (P1)        | `feature/web-platform-wp2a-ssg-route`          | [PR #249](https://github.com/isrnao/yui-chat-ts/pull/249) / developへマージ済み・実機確認待ち |
| 4    | [WP2b #240](https://github.com/isrnao/yui-chat-ts/issues/240) (P1)        | `feature/web-platform-wp2b-static-404`         | [PR #250](https://github.com/isrnao/yui-chat-ts/pull/250) / developへマージ済み・公開後HTTP/実機確認待ち |
| 5    | [WP2c #241](https://github.com/isrnao/yui-chat-ts/issues/241) (P1)        | `feature/web-platform-wp2c-mpa-seo`            | [PR #251](https://github.com/isrnao/yui-chat-ts/pull/251) / developへマージ済み・実機確認待ち |
| 6    | [WP4 #243](https://github.com/isrnao/yui-chat-ts/issues/243) (P2)         | `feature/web-platform-wp4-performance`         | [PR #252](https://github.com/isrnao/yui-chat-ts/pull/252) / developへマージ済み・実環境計測待ち                                               |
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

## WP2b：静的404・別名入口・配信試験

#249のhead `504efcec94d2de8318db6f52258b1ae66836ec6c`からfeatureを作成。public/404.htmlをJS不要のmain・見出し・本文・トップリンク・noindexを持つページに置換し、index.htmlの旧`/?/`復元scriptを撤去した。

別名は共有ルート規則から`/chat/`→`/chat/superbeginner/`、`/chanari/`→`/chanari/superbeginner/`、`/chanari/all/`→`/chat/all/`を生成。移動先と同じSSG/headを配信するのでトップへ迂回しない。専用2shotが有効な場合だけ`/chanari/2shot/`の別名を追加し、停止中の通常Chanari 2shotはそのまま配信する。

JS使用時は同じSSGをhydrateしてquery/hash/history.stateを保持しながら正規化する。JS無効時は別名URLのquery/hashと同じ部屋本文を残し、noscript内の実リンクで正規入口へ移動できる。そのリンクは通常のページリンクであり、任意のquery/hashを別文書へ引き継がない。旧`/?/`URLは通常のトップのqueryとして扱い、復元しない。

静的成果物は164正規SSG＋3別名SSG＝167ページ、別途404と既存のドメイン所有確認HTML。Pages相当fixture（4181）はdirectory index、slash 301、未知URLのHTTP404を再現し、Vite fallbackに依存しない。最初の4190ではWebKitが最小HTTP応答へも到達しないことを確認し、4181で全対象試験を再実行した。

ローカル：Compilerを含む関連74件、typecheck/lint、公開ビルド、関連66ブラウザケース成功。JS無効、HTTP status、head/canonical、別名、query/hash/state、再読込・戻る/進む、旧誤SSG、入室安全性を検証。

実ホストの公開前基準（2026-10-13、HEADのみ・JS実行なし）：トップ200、/chatは301→/chat/、正規通常部屋200、未知URL404。これは未公開の変更を確認した結果ではない。マージ・公開後の本文/別名/HTTP確認担当は未割当、実機確認も未完了として残す。[GitHub Pagesのcustom 404仕様](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-custom-404-page-for-your-github-pages-site)に合わせて配信ルートの404.htmlを用意する。

WP2bの対象head `7caafb1`のCIでtypecheck/lint・96ファイル752件、167 SSG・90ブラウザケースが成功。WP2aのhead `504efce`でも96ファイル749件・164 SSG・69ブラウザケースの成功を確認済み。

## WP2c：MPAルーティング・静的SEOの簡素化

#250のhead `7caafb1f37c53e421e7dbfe6819befb0964ee63f`からfeatureを作成。src全体のpushState/popstateと入口リンクを調査した。アプリのpushState呼び出しはなく、唯一のpopstate購読はAppのルートstate更新だった。RoomAnchorはpreventDefaultせず実リンクを使用し、index.htmlのSpeculation Rulesも文書のprefetchだけを行う。文書間の履歴はブラウザが担当し、同文書のhash移動はルートを変更しない。別途のpageshowによる通信復帰等は維持する。

採用：Appのresolution useStateとpopstate effectを撤去し、現在文書のルート解決・URL正規化・shell色だけを残した。静的ページは描画元のssgPathnameをuseSEOへ渡し、同じSSGマーカーを持つ文書のhead更新を省く。SSRと同じメタ生成元・build markerが契約であり、headの不正配信まで一般的に検出する仕組みは増やさない。旧/欠落/誤ルートマーカーでは従来のuseSEOが補正する。

継続：専用2shotのsessionに応じた動的SEO、NotFoundのcanonical/noindex更新。ChanariのSSG識別子はChanariのパスを使い、通常チャットcanonicalと混同しない。公開通常2shotは通常部屋の静的SEOとして検証する。入室・Realtime・下書き・履歴復帰の責務は変更しない。

回帰：useSEOの同一SSG head保持・旧/誤マーカー補正・動的更新を単体試験へ追加。mpa-seo.specはJavaScript解禁前からheadを観測し、トップ・通常・全部屋・Chanari・公開通常2shotのSEO書き込みが0であることと、実リンクの新規文書生成・戻る/進むでURL/headが復元されることを確認する。Chromiumのprefetch利用時には新規リクエストが観測されないため、文書生成を成功条件にした。実機/VoiceOverは未確認として残す。

ローカル（2026-10-13）：typecheck/lint、Compilerを含む関連5ファイル91単体テスト、167 SSG、Chromium/Desktop WebKit/Mobile WebKitで関連84ブラウザケースが成功。静的SEO DOM書き込み0、誤配信時のcanonical補正、native文書履歴、別名のstate/query/hash、初期入室安全性を確認済み。

WP2cの対象head `d195a14`のCIでtypecheck/lint・96ファイル757件、167 SSG・108ブラウザケースが成功。

## WP4：性能の再計測・採否

#251のhead `d195a14650278f7d059814637acb14ccb338b277`からfeatureを作成。最新main `4618761`とこの積み上げを、同一端末・CPU/回線・監視無効・空バックエンドの条件でcold/warm各3回測定した。計48サンプルのraw JSONと再現スクリプト・採否は[WEB_PLATFORM_PERFORMANCE.md](WEB_PLATFORM_PERFORMANCE.md)に記録する。

cold LCP中央値は約0.8〜2.1秒、操作後JS増加は0.17〜0.90KiB、warm JS転送は全件0。入力可能と安全な入室ボタンの有効化を分け、lab操作遅延とinput delayを記録した。実ユーザーINP p75・実Chrome/Safari/Android/iOS・実ログ・監視有効条件・Realtime接続時間は未測定。Realtimeを入力可能時刻から推定しない。

追加Hydration分割は今回見送り。この小さいlabサンプルには境界追加を正当化する操作上のボトルネックがなく、先行入力・session・Realtime・下書き同期の保守負担を増やす根拠がない。実環境で問題が再現した際に独立PRで該当部分を試作する。今回のlab結果を実機/実ユーザーの確認完了とは扱わない。
