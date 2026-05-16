# Test Strategy

## 1. テストの目的

- 本プロジェクトの主要機能の品質を自動テストで継続的に保証する
- バグや破壊的変更の早期検知、回帰テストの自動化
- 楽観的更新・キャッシュ・ルーティングといった「壊れたら気づきづらい」ロジックを保護する

---

## 2. テストの種類と方針

| 種別             | ファイル例                                                            | 主なカバー範囲                                                        |
| ---------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------- |
| ユニット         | `*.test.ts`                                                           | 純関数 / ユーティリティ（例: `format.test.ts`, `countChars.test.ts`） |
| コンポーネント   | `*.test.tsx`                                                          | React 部品の描画や UI 操作（例: `ChatLogList.test.tsx`）              |
| カスタムフック   | `*.test.ts`                                                           | `useChatLog` / `useNowMinute` / `useParticipants` 等                  |
| API / リソース層 | `chatLogResource.test.ts`, `chatApi.test.ts`, `roomCountsApi.test.ts` | キャッシュ / dedupe / paging / hasMore 等                             |
| ルーティング     | `routing.test.ts`（chat / chanari）                                   | top / chat / chanari / unknown ルート解決                             |
| 統合             | `src/App.test.tsx`                                                    | 各ルートが即時描画されること                                          |
| ビジュアル       | Storybook stories + Chromatic                                         | UI のリグレッション                                                   |
| E2E (将来)       | （未実装）                                                            | Playwright 等                                                         |

- テストは **Testing Library** 中心、ユーザー目線重視
- 外部 API（Supabase 等）・Web API（`localStorage`, `BroadcastChannel`, `requestIdleCallback`）は必要に応じてモック
- 時刻に依存するロジック（`useNowMinute`, `getRecentParticipants`）は `vi.useFakeTimers` + `vi.setSystemTime` で固定

---

## 3. テスト命名・配置規則

- ファイル名:
  - コンポーネント: `ComponentName.test.tsx`
  - ユーティリティ・フック: `name.test.ts`
  - ページ: `PageName.test.tsx`
- テスト対象と**同じディレクトリ**に配置（コロケーション）

例:

```
src/features/chat/api/
├── chatLogResource.ts
├── chatLogResource.test.ts
├── chatApi.ts
└── chatApi.test.ts
```

---

## 4. テストケース命名・記述ガイド

- `describe` / `it` は**期待動作や条件を簡潔に日本語で**
  - OK: `it('正しいメッセージが表示される', ...)`
  - NG: `it('1', ...)` / `it('test', ...)`
- 失敗系・分岐・例外も明確に
  - 例: `it('invalid JSON なら空配列になる', ...)`
- `describe` で「機能」「パターン」単位に整理
- Arrange → Act → Assert の流れで

---

## 5. テストスタイルと品質管理

- UI 要素取得は role / label / placeholder を活用
- 副作用（`localStorage`, グローバル stub 等）は `beforeEach` / `afterEach` で初期化
- 時刻依存テストは `vi.useFakeTimers()` を導入し、`afterEach` で `vi.useRealTimers()` に戻す
- カバレッジは `vite.config.ts` の `test.coverage.thresholds` で管理
  - 現在の閾値: **lines / functions / branches / statements それぞれ 50%**
  - 除外: `src/test/**`, `*.stories.*`, `src/main.tsx`, `src/shared/supabaseClient.ts`, `index.ts`（再 export のみ）, `*.d.ts`, `src/features/chat/types.ts`, `src/shared/utils/clientInfo.ts`
- バグ修正時は**再現テスト追加を必須**

---

## 6. CI / CD 連携

- PR トリガーで `pnpm test`（Vitest）を実行
- Chromatic は push / PR（main, develop）で Storybook をビルドしビジュアル差分を検出
  - Node.js 24 / pnpm 10 / `actions/checkout@v6`, `actions/setup-node@v6`, `pnpm/action-setup@v6`
  - `onlyChanged: true` で差分のみ検証

---

## 7. モック・スナップショット指針

- 外部 API や重い UI 部品は `vi.mock` / `vi.stubGlobal` でモック
- Supabase 呼び出しは `chatLogResource` / `chatApi` モジュールごとモックするか、`supabase.from(...)` のチェイン全体をスタブする
- `localStorage` を扱うテストは `beforeEach` で `localStorage.clear()` し、テスト間漏洩を防ぐ
- スナップショットテストは UI 表示中心にとどめ、ロジックには使わない

---

## 8. テストで保護している主な不変条件

実装と doc がずれやすい挙動は、以下のテストで縛っています。修正時は対応するテストを必ず確認してください。

| 不変条件                                                                | 主な保護テスト                                     |
| ----------------------------------------------------------------------- | -------------------------------------------------- |
| 同一 `roomId` への並行 `loadChatLogs` で Supabase は 1 回しか呼ばれない | `chatLogResource.test.ts`                          |
| `loadChatLogsWithPaging(roomId, 0, n)` は snapshot からスライスする     | 同上                                               |
| キャッシュは `MAX_CHAT_LOG = 100` 件に trim される                      | 同上                                               |
| `useOptimistic` の reducer が temp と saved の重複を抑制する            | `useChatLog.test.ts`                               |
| `useParticipants` は同一 `chatLog` 参照では再計算しない                 | `useParticipants.test.ts`                          |
| `ChatLogList` は同一 `chatLog` 参照では `sort/slice` を再実行しない     | `ChatLogList.test.tsx`                             |
| `useNowMinute` は 1 分境界で更新される                                  | `useNowMinute.test.ts`                             |
| `/chat/:roomId` / `/chanari/:roomId` / unknown が正しく解決される       | `routing.test.ts` / `chanari-chat/routing.test.ts` |
| 各ルートが即時描画される（ローディング fallback を挟まない）            | `App.test.tsx`                                     |
| Supabase 未設定でもトップが破綻しない                                   | `roomCountsApi.test.ts` / `TopPage.test.tsx`       |

---
