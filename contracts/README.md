# contracts

Web（このリポジトリ）と Android 版（`okiraku-android`）が共有する JSON。設計は
[`.kiro/specs/android-native-app/design.md`](../.kiro/specs/android-native-app/design.md) §8。

**このディレクトリの JSON は生成物なので、手で直さない。** 生成元は `src/contracts/buildContracts.ts` で、
`pnpm contracts:export` で書き出す。`src/test/contracts.test.ts` が、作り直した結果とここの中身が同じことを確かめる
（違えば `pnpm test` が落ちる）。

| ファイル                    | 生成元                                                            | 中身                                                       |
| --------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------- |
| `manifest.json`             | —                                                                 | 版（`contractsVersion`）、fixtures のタイムゾーン、一覧    |
| `rooms.json`                | `src/features/chat/rooms.ts`、`windowRows.ts`                     | 部屋の ID・題名・紹介文・カテゴリ・`appScope`・ログ行数    |
| `directory.json`            | `src/features/top/data.ts` の `chatDirectoryGroups`               | トップの部屋一覧（見出し・補足・色の系統・部屋）           |
| `theme.json`                | `src/styles/theme.css`、`types.ts`                                | 色、書体の並び、文字の色 15 色、Size の倍率                |
| `chat-options.json`         | `supabase/functions/save-chat/schema.ts`、`inputErrorMessages.ts` | 入力の上限、選択肢、エラーのコードと文言、Author_Key の形  |
| `server-messages.json`      | `supabase/functions/save-chat/messages.ts`                        | 管理人・巫女の名前と色、入退室の文言の型（楽観的な表示用） |
| `fixtures/*.json`           | Web の関数に入力を通した結果                                      | クライアントに残った規則の期待値                           |
| `fixtures/save-chat/*.json` | `schema.ts` / `messages.ts` の関数に入力を通した結果              | サーバーの判定と作る発言（Android の Fake の API に使う）  |

- `fixtures/` の日時は `manifest.json` の `fixtureTimeZone`（Asia/Tokyo）で作る
- 互換の無い変更（キーの削除・意味の変更）では `src/contracts/buildContracts.ts` の `CONTRACTS_VERSION` を上げる
- ここを変えたら、`okiraku-android` で `scripts/sync-contracts.sh ../yui-chat-ts` を走らせ、写しを更新する PR を出す
