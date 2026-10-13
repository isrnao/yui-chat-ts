# 対応ブラウザと確認責任

Issue #234 / WP3 #238（2026-10-13）。対象は配信時点の最新stableのChrome Desktop/AndroidとSafari macOS/iOS。Firefoxと古い版の互換層は今回の支持対象に含めない。

## 自動ゲート

Playwrightの必須projectはChromium、Desktop WebKit、Mobile WebKit。Node.js 24、packageManagerのpnpm 12.11.2、frozen installをCIで使用する。pnpm/action-setupの別version指定を置かず、Chromatic/save-chat/two-shotも同じpinを読む。

## 実機確認と残る条件

| 対象           | 必須の手動操作                                        | 最低ブラウザ版・OS下限                    | 実機担当・結果 |
| -------------- | ----------------------------------------------------- | ----------------------------------------- | -------------- |
| Chrome Desktop | 入室、IME確定、reset、pending、フォーカス、dialog取消 | 最新stableのみ。固定下限は実機確認待ち    | 未割当・未確認 |
| Chrome Android | 同上、タッチとソフトキーボード                        | 最新stableのみ。Android下限は実機確認待ち | 未割当・未確認 |
| Safari macOS   | 同上、VoiceOverで入力名・取消後復帰                   | 最新stableのみ。macOS下限は実機確認待ち   | 未割当・未確認 |
| Safari iOS     | 同上、タッチ・VoiceOver・ソフトキーボード             | 最新stableのみ。iOS下限は実機確認待ち     | 未割当・未確認 |

この作業環境にはmacOS 26.6.2、Chrome 155.0.8059.40、Safari 26.6.2がインストールされていることを確認した。アプリの版確認は操作試験の成功証拠ではなく、配信時点の最新stableであることの証明でもない。

PR作成者（今回の自動試験はCodex）が自動ゲートの対象head・結果を記録する。リリース確認担当は実機試験前に各行の担当者を割り当て、実際のブラウザ/OS版と結果をPRに記録する。関連PRのレビュアーはその記録とCIを確認する。上表を埋めるまではWP3を完了扱いにしない。実装PR #247〜#252のdevelopへのマージ後は、main向け統合PRと#238で未確認事項を追跡する。

`es2022`はJS変換対象でありDOM APIの支持を保証しない。native dialog一本化を維持し、Safari/Chrome差への既存cancel処理・idle実行の代替を残す。PlaywrightのWebKitやiPhone emulationを実Safari・VoiceOver確認と同一視しない。
