# ネイティブインタラクションの実装・検証記録

開始日: 2026-10-12

起点: `develop_contracts`。統合先: `develop_native-interactions`。

[計画](INTERACTION_REFACTORING_PLAN.md)の58項目を、R0 → R1 → R4a → R4c → R2 → R3 → R4b → R5a → R5b → R6の順にstacked PRへ分割する。各PRのbaseは直前のfeatureブランチとし、最初だけdevelopをbaseとする。専用ツーショットの改修も停止flagを維持したまま検証する。

| 単位 | 状態   | 検証・PR                   |
| ---- | ------ | -------------------------- |
| R0   | 実装中 | ブラウザ検証基盤と互換試作 |
| R1   | 未着手 | 操作・フォーム・splitter   |
| R4a  | 未着手 | sessionと送信要求          |
| R4c  | 未着手 | ログsourceと取得           |
| R2   | 未着手 | dialog・通報・transition   |
| R3   | 未着手 | 行アクションpopover        |
| R4b  | 未着手 | 接続・音・復帰・motion     |
| R5a  | 未着手 | Chanariとdraft             |
| R5b  | 未着手 | トップ・人数・埋め込み     |
| R6   | 未着手 | 停止中の専用ツーショット   |

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


## R4b

通常部屋のconnecting/disconnected表示、ランキングの古い結果＋取得時刻/再試行を追加。Activityの読書位置を維持し、通常ログ/ランキングのscroll枠と共通ログ内のoverflowを整理。極小高さはscroll stack、reduced motionはpulse/spin/transitionとGIFの静的な代替表記へ適用。通知音の有効化をuser activationへ接続し、再生可否・ミュート・失敗を分離。look/unlookのcase-sensitive parserを表示/保存後/受信で共通化し、mute/unlook後の遅れたdecodeも鳴らさない。visibility/pageshowで時計と取得鮮度を更新し、本文/読書位置を保持。hydrate前のdirty入力を保存設定で上書きしないSSGテスト合格。ブラウザ音声の実機出力・BFCache/lock・支援技術は手動ゲートとして残す。

## R5a

本文をChanariChatRoomへ局所化、初回seed/再入室空本文/明示復元を分離。300ms debounce・送信前・hidden・unmountで最後の非空draftを保存し、clear/退室で空保存しない。pending/busyと即時clear、旧画面応答無視、新しい編集を壊さない失敗回復、IME/書記素/コードポイント/説明IDを実装。schemaで型/色/部屋一致/有限時刻/期限を検査し、cache未更新でもloadDraftで再検査。名前20文字を維持しpicker/label/エラーを整備。表示のみ項目は非活性化し27/21選択肢とmetadata不変を維持、仕様/storiesを更新。上段containerの折返し、切断中だけのpollingにhidden停止/復帰一回を追加。型・lint・Compiler・関連22 tests・contracts生成・44 browser tests合格。


## R5b

人数sourceにready/partial/failed/unavailableを設け、成功の0件と未取得を区別。UIでloading/前回値/取得時刻/明示retryを公開し、同じ指標をオンライン人数と扱わない。トップはfetchだけで取得しSupabase bundleを追加しない。旧辞書APIは互換adapterとして保持。ナビの現在地をaria-current CSSへ統一、nowrapを削除、紹介textareaの毎click全選択を除去。X loaderはpending Promiseを共有し、load/error/timeoutと明示retry、接続中vendor containerだけの初期化へ整理。Adringの専用DOM分離/空白を作らない既存方式を維持。参照を調べて旧.okiraku-*規則を削除、windowRowsは保存データ互換欄として明記して30初期値を維持。型・lint・Compiler・関連46 tests・contracts生成合格。


## R6

公開停止flagを維持した専用UIの独立改修。close/kick/leaveは共通dialogで具体的な操作を確認し、取消は通信なし・確定一回。RoomScreenのpending/terminalをUIへ公開、radioはfieldset/change＋選択済みclickでキーと再押下を一回扱う。IME/初回だけのfocus/コードポイントとUTF-16上限差を整備し、requiredでE1等を遮断しない。FrameLayoutは245px固定/20%可変を維持し、バー厚clampを共有、primary pointer/rAF取消/Home/End/実寸ARIA/coarse24px/極小高さstackを追加。all:revertからnative dialogを除外してfocus/forced colorsを専用指定、通知見出しfocus/一覧の短いstatusを追加。関連164 testsとCompiler/型/停止flag回帰合格。

## 最終補完（R7、実装中）

最終の網羅確認で、GIFのreduced motionはCSS animation停止だけでは成立しないため実際の非表示＋静的表記へ修正。popoverの任意開閉transitionとWordPickerのform/required、旧closeイベントのcounter消費と演出取消/cleanup例外も補完した。
