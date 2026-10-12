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
