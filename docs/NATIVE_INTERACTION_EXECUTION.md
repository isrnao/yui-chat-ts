# ネイティブインタラクションの実装・検証記録

開始日: 2026-10-12

起点: `develop_contracts`。統合先: `develop_native-interactions`。

[計画](INTERACTION_REFACTORING_PLAN.md)の58項目を、R0 → R1 → R4a → R4c → R2 → R3 → R4b → R5a → R5b → R6の順にstacked PRへ分割する。各PRのbaseは直前のfeatureブランチとし、最初だけdevelopをbaseとする。専用ツーショットの改修も停止flagを維持したまま検証する。

| 単位 | 実装状態                               | PR / 範囲                                                                       |
| ---- | -------------------------------------- | ------------------------------------------------------------------------------- |
| R0   | 実装済み・自動検証（手動ゲートは末尾） | [#221](https://github.com/isrnao/yui-chat-ts/pull/221) / ブラウザ基盤/互換試作  |
| R1   | 実装済み・自動検証（手動ゲートは末尾） | [#222](https://github.com/isrnao/yui-chat-ts/pull/222) / 操作/フォーム/splitter |
| R4a  | 実装済み・自動検証（手動ゲートは末尾） | [#223](https://github.com/isrnao/yui-chat-ts/pull/223) / session/要求snapshot   |
| R4c  | 実装済み・自動検証（手動ゲートは末尾） | [#224](https://github.com/isrnao/yui-chat-ts/pull/224) / projection/read        |
| R2   | 実装済み・自動検証（手動ゲートは末尾） | [#225](https://github.com/isrnao/yui-chat-ts/pull/225) / dialog/通報/transition |
| R3   | 実装済み・自動検証（手動ゲートは末尾） | [#226](https://github.com/isrnao/yui-chat-ts/pull/226) / 共通popover            |
| R4b  | 実装済み・自動検証（手動ゲートは末尾） | [#227](https://github.com/isrnao/yui-chat-ts/pull/227) / 接続/音/復帰/scroll    |
| R5a  | 実装済み・自動検証（手動ゲートは末尾） | [#228](https://github.com/isrnao/yui-chat-ts/pull/228) / Chanari/draft          |
| R5b  | 実装済み・自動検証（手動ゲートは末尾） | [#229](https://github.com/isrnao/yui-chat-ts/pull/229) / トップ/人数/widget     |
| R6   | 実装済み・自動検証（手動ゲートは末尾） | [#230](https://github.com/isrnao/yui-chat-ts/pull/230) / 停止中専用2shot        |
| R7   | 実装済み・自動検証（手動ゲートは末尾） | [#231](https://github.com/isrnao/yui-chat-ts/pull/231) / 最終補完/採用記録      |
| R8   | 実装済み・自動検証（手動ゲートは末尾） | 追加UIの撤去（下記「R8」）                                                      |

実ブラウザの結果と、実機でしか確認できない項目を区別して追記する。新機能計画F01〜F11の未実装機能は今回の58項目の実装と分離する。

## R0の採用判断

Chromium 156 / Firefox 157 / WebKit 27.2とモバイルWebKitで12テスト合格。pointer起点のfocus復帰はWebKitで補助処理が必要だったため、native dialogのfocus trapを再実装せず、論理的な復帰先だけアプリ側で保持する。popover light dismiss・320px配置・textarea・reduced motionの機能継続を確認。iPhone実機のハプティックと支援技術は自動ブラウザ試験と区別する。下限はUAの版ではなく各API/property検出で扱い、dialog非対応時の既存経路を維持する。

## R1

操作button化、picker/更新のTab順、focus/invalid/forced-colors/coarse pointer、IMEのEnter、avatar fieldset、壊れたhowtoリンク、連絡先名、skip linkを実装。選択範囲は両端/全Rangeを同じ本文に限定。splitterはCSS gridでバー厚を確保し、右/非primary pointer、取消・入退室の予約rAF、Home/End/範囲/ARIAを修正。contractsは生成で更新。型検査・lint・対象76 tests・4構成16 browser tests合格。

## R4a

入退室フェーズと世代を実装し、旧応答/計測による巻戻し・未確定中の投稿・連打を防止。入室時の本人情報を背景storeから分離し、明示的な色変更だけ反映。手動retryは本文/部屋/metadata/nonce/operation IDを保持し期限後は新規投稿に変換しない。失敗本文とavatarを復元し、全部屋の失敗を成功へ変換しない。通常routeのkeyとboundaryをscopeへ統一。120書記素/コードポイント上限を制約検証へ同期し、clearは独立。型・lint・Compiler・対象53 tests合格。

## R4c

LogSourceのprojectionをfetch/Realtime/保存応答/楽観行へ統一し、全部屋でemail/uaが一時表示される差を解消。manual連打はin-flightを共有、reconnect/expandは新世代で再取得。最後の解除と不要readへAbortSignalを伝搬し、backoffも中断可能にした。初回接続時の穴埋め・取得中INSERT/clear順・取得拡張・2,000件capを維持。全部屋の取得失敗は共通ログの再試行へ接続。型・lint・Compiler・対象50 tests合格。

## R2

常設一覧をInvoker Commands/adapterへ、動的確認と通報をcommit後のshowModalへ移行。native経路の手動inert/Tab trap/Esc監視を除去し、旧経路を隔離。終了時の対象snapshot、取消優先focus、論理的な起点消失時のログfocusを保持。背景pointer開始とclickを照合して互換clickの誤取消を防止。通報をform化し、二重送信/例外/旧対象の遅延応答を処理。transitionは一回更新・所有者cleanup・元inline値復元・scroll枠計測へ整理。型・lint・Compiler・対象63 tests、production native/fallbackを含む24 browser tests合格。

## R3

通常/全部屋の確定行に名前付き操作buttonを追加し、名前/言葉/IPフィルタと直接通報を一つのpopoverへ接続。1,000行に1,000個のpopup内容を増やさず、panelは一つだけ。ダブルタップ/本文リンク/範囲選択/楽観行の禁止を維持。native autoのlight dismiss、CSS anchor＋狭い画面の固定配置、非対応時のhidden/外側操作/Escを独立実装。行消失・Activity終了でpopupを終了。関連33 tests/Compiler/型と32 browser tests合格。1,000button/1panelと320px内の配置を実ブラウザで検査。負荷の実機p75比較は未実施。

## R8

R3の発言ごとの「操作」button/popover（C09/C10）と、R4bの「通知音を有効にする」「通知音をミュート」（A13の表示部分）を撤去した。どちらもCSS/HTMLへの移行ではなく画面への機能追加だったため。フィルタ・通報は従来どおり行のダブルタップ → 確認dialog（「通報する」）で到達する。通知音は従来どおりユーザー操作内の再生時にAudioContextをresumeする。look/unlookの共通parser、unlook後に遅れたdecodeを鳴らさない処理、resumeの時間上限、接続状態の表示は維持。browser testsはダブルタップ経由のフィルタ・通報・focus復帰へ置き換えた。

さらに、SSGのHTMLに入って初期表示を押し下げていた「接続中…」（R4b）と「人数を取得中…」（R5b）を出さないようにし（状態表示は失敗時だけ）、トップの「人数は直近6時間の公開ログの発言者数です。」とXの埋め込みの下の「Xで…を見る」（R5b）を撤去した。

## R4b

通常部屋のconnecting/disconnected表示、ランキングの古い結果＋取得時刻/再試行を追加。Activityの読書位置を維持し、通常ログ/ランキングのscroll枠と共通ログ内のoverflowを整理。極小高さはscroll stack、reduced motionはpulse/spin/transitionとGIFの静的な代替表記へ適用。通知音の有効化をuser activationへ接続し、再生可否・ミュート・失敗を分離。look/unlookのcase-sensitive parserを表示/保存後/受信で共通化し、mute/unlook後の遅れたdecodeも鳴らさない。visibility/pageshowで時計と取得鮮度を更新し、本文/読書位置を保持。hydrate前のdirty入力を保存設定で上書きしないSSGテスト合格。ブラウザ音声の実機出力・BFCache/lock・支援技術は手動ゲートとして残す。

## R5a

本文をChanariChatRoomへ局所化、初回seed/再入室空本文/明示復元を分離。300ms debounce・送信前・hidden・unmountで最後の非空draftを保存し、clear/退室で空保存しない。pending/busyと即時clear、旧画面応答無視、新しい編集を壊さない失敗回復、IME/書記素/コードポイント/説明IDを実装。schemaで型/色/部屋一致/有限時刻/期限を検査し、cache未更新でもloadDraftで再検査。名前20文字を維持しpicker/label/エラーを整備。表示のみ項目は非活性化し27/21選択肢とmetadata不変を維持、仕様/storiesを更新。上段containerの折返し、切断中だけのpollingにhidden停止/復帰一回を追加。型・lint・Compiler・関連22 tests・contracts生成・44 browser tests合格。

## R5b

人数sourceにready/partial/failed/unavailableを設け、成功の0件と未取得を区別。UIでloading/前回値/取得時刻/明示retryを公開し、同じ指標をオンライン人数と扱わない。トップはfetchだけで取得しSupabase bundleを追加しない。旧辞書APIは互換adapterとして保持。ナビの現在地をaria-current CSSへ統一、nowrapを削除、紹介textareaの毎click全選択を除去。X loaderはpending Promiseを共有し、load/error/timeoutと明示retry、接続中vendor containerだけの初期化へ整理。Adringの専用DOM分離/空白を作らない既存方式を維持。参照を調べて旧.okiraku-\*規則を削除、windowRowsは保存データ互換欄として明記して30初期値を維持。型・lint・Compiler・関連46 tests・contracts生成合格。

## R6

公開停止flagを維持した専用UIの独立改修。close/kick/leaveは共通dialogで具体的な操作を確認し、取消は通信なし・確定一回。RoomScreenのpending/terminalをUIへ公開、radioはfieldset/change＋選択済みclickでキーと再押下を一回扱う。IME/初回だけのfocus/コードポイントとUTF-16上限差を整備し、requiredでE1等を遮断しない。FrameLayoutは245px固定/20%可変を維持し、バー厚clampを共有、primary pointer/rAF取消/Home/End/実寸ARIA/coarse24px/極小高さstackを追加。all:revertからnative dialogを除外してfocus/forced colorsを専用指定、通知見出しfocus/一覧の短いstatusを追加。関連164 testsとCompiler/型/停止flag回帰合格。

## 最終補完（R7）

最終の網羅確認で、GIFのreduced motionはCSS animation停止だけでは成立しないため実際の非表示＋静的表記へ修正。popoverの任意開閉transitionとWordPickerのform/required、旧closeイベントのcounter消費と演出取消/cleanup例外も補完した。

Chanariにも同じoperation IDの明示retryを接続し、本文を戻す操作/新規投稿と分離。退出中と専用Lobby入室中のpending表示を補完。requestClose/小さなcancel adapterで必須入力と独立して閉じ、古いcloseイベントが新しいキー操作のfocusを奪わないよう、論理invokerとブラウザの直前focusを区別した。decode後のunlook/mute、backoff abort、期限cacheと固定clockを検証。Linux Firefoxの音声デバイス不可では成功表示を強制せず、失敗表示/再試行/ミュートを検査する。resumeが未解決のときも2秒で有効化操作へ復帰するsource修正/音声テスト修正をR4b以降、期限テストの固定clockをR5a以降へ戻す。

## 58項目の実装対応表

「実装済み」はソースと自動検証を意味する。OS/支援技術/実機の受け入れ条件を合格扱いにする意味ではない。任意CSS機能は必須操作から独立し、未対応でも操作を維持する。

| 計画ID | 実装PR       | 確認                                                          |
| ------ | ------------ | ------------------------------------------------------------- |
| C01    | R1           | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C02    | R2/R7        | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C03    | R2           | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C04    | R1/R4a/R4b   | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C05    | R1           | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C06    | R1/R4a       | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C07    | R4a          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C08    | R4b          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C09    | R3/R8        | R8で撤去 / 既存のダブルタップ導線を維持                       |
| C10    | R3/R8        | R8で撤去 / C09の撤去に伴い不要                                |
| C11    | R1/R2/R7     | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C12    | R2/R7        | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C13    | R2/R7        | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C14    | R1/R6        | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| C15    | R4a/R4c/R4b  | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| N01    | R5a/R7       | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| N02    | R5a/R7       | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| N03    | R5a          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| N04    | R5a/R7       | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| N05    | R5a          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| N06    | R5a          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| N07    | R5a          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| H01    | R1/R5b       | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| H02    | R5b          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| H03    | R5b          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| H04    | R5b          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| H05    | R5b          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| H06    | R1/R4a       | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| T01    | R6/R7        | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| T02    | R6           | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| T03    | R6           | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| T04    | R6           | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| T05    | R6           | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| T06    | R6           | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| X01    | R4b/R7       | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| X02    | R4a          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| X03    | R1/R5b/R6    | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| X04    | R2/R3/R4b/R7 | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| X05    | R4c/R4b      | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| X06    | R1/R6        | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| X07    | R0/R4b/R5b   | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A01    | R4a          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A02    | R4a          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A03    | R4a/R7       | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A04    | R4c          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A05    | R4b/R5b      | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A06    | R1           | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A07    | R2           | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A08    | R1/R6        | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A09    | R4a          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A10    | R1           | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A11    | R5a/R7       | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A12    | R4c/R4b      | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A13    | R4b/R7/R8    | R8で許可・ミュートUIを撤去 / 他は維持                         |
| A14    | R5b          | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A15    | R1/R5b       | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A16    | R0/R4b/R7    | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |
| A17    | R2/R7        | 実装済み / 関連Vitest・Compiler・ブラウザ。環境別ゲートは下記 |

## 全体最適の再確認

- 開閉はnative dialog/popover、validity/checked/disabled/focusはHTML/CSSへ渡す。非対応経路だけに旧focus trap/外側操作/Escの補助を隔離。動的対象・送信snapshot・保存/復元・取得世代・権限はReact/storeに残す。
- UIの取消と通信の取消を分離する。readにはAbortSignal、保存済み投稿/通報には取消の成功を主張しない。同じ送信retryは同じ要求IDを保ち、期限後に新規へ変換しない。
- source別projectionとUUID/nonce、INSERT/clear/取得中の順序、2,000件cap、全部屋の返信先、Activityの読書位置を維持。更新/音/計測をCSSの表示状態から推測しない。
- 静的コンテンツ/MPAリンク/元のURL/SSG、既存の入室エラーと専用token/terminalを維持。未提供FAQ/DND/認証/Push/添付/リアクションなどF01〜F11を追加していない。
- Chanari上段と専用2shotのscopeを分離し、通常ログへスタイルを漏らさない。未定義色/死んだhash/未参照CSSを整理し、保存windowRowsは互換を維持。全CSS layer化・全React state削除・browser下限の一律切上げは行わない。
- 仕様/stories/生成contractsと実装を対応させた。全契約はexporterで確認し、JSONを手で変更していない。

## 最終の検証と採用ゲート

ローカル: 型/lint/React Compiler、全712 Vitest、production build/SSG（トップ＋82通常部屋＋81Chanari、専用2shot停止維持）、Storybook buildを確認。全64 browser tests（native/fallback/実際のGIF/未解決audio/起点消失/SSG）を検証。ブラウザはChromium 156/Firefox 157/WebKit 27.2/mobile WebKitのproduction componentとfallback、1,000行/1panel、320px/縦200px、音声成功または失敗復帰、専用radio/確認/splitter、本番SSGのJS遅延中編集を検査する。最終件数とCIはPRの最新headのchecksと照合する。

production/SSG検証はVITE_SUPABASE_URL=https://native-fixture.invalid、VITE_SUPABASE_ANON_KEY=fixture-onlyの検証用設定。未設定でのRealtime初期化エラーは既存の環境条件であり、検証用buildを本番配信に流用しない。CI browser jobもこの設定でビルドし、外部保存をしないsynthetic fixture/API応答で検証する。既存CIのcontinue-on-errorなVitest成功だけを根拠にせず、ローカル全テストとbrowser jobを採用根拠とする。

残る手動ゲート: 実機iOS Safari/Android WebViewのソフトキーボード・回転・200%拡大・OSハプティック/音声出力、VoiceOver/NVDA、実機forced colors、実BFCache/画面lock、外部X/広告の配信制限、1,000行の同一実機p75/メモリ前後比較。自動webkitやmobile emulationをこれらの実機合格と記録しない。browser下限/端末比率が未確定なのでfallbackは削除しない。これらの確認と各PRレビューを完了してから公開採用する。専用2shot再開は今回に含めない。

統合PRはdevelop_native-interactions → develop_contractsの#220。コードはR0→R1→R4a→R4c→R2→R3→R4b→R5a→R5b→R6→R7に積み、レビュー後、R7→R6→R5b→R5a→R4b→R3→R2→R4c→R4a→R1→R0の順に各PRの親baseへ取り込み、最後に統合PR #220をdevelop_contractsへ取り込む。各featureの変更がdevelopへ到達するまでは、develop branchだけを本番成果として扱わない。全PRはレビュー/手動ゲートのためdraft、未merge・未deploy。

CIの実ログ確認で、旧continue-on-errorがCompiler全ファイル検査の5秒timeoutを隠すケースを検出した。検査内容/対象/opt-out規則は変更せず、このproject全体検査だけ30秒へ変更してR4a以降へ反映。新browser jobは型/lint/全Vitestを必須化してからSSG/browserを実行する。表示上の緑だけで採用しない。

reduced motionの最終確認では、入室前のavatar選択画像もログと同じ静的表記へ切替え、実際のlook/GIFをfixtureへ置いて非表示/代替表示をブラウザで検査する。

Legacy dialogの起点がフィルタで消えた場合も、接続解除/元inert復元後にログ領域へfocusを戻す。dialog APIを無効化した実ブラウザで行消失とfocusを確認する。
