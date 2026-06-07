# IP/UA の Edge Function 移行（save-chat）

チャット発言の `ip` / `ua` を「クライアント自己申告値」から「サーバー観測値」へ切り替えた対応の記録。

- 作成日: 2026-06-02
- ステータス: 実装完了（ローカル検証・本番デプロイは別途）
- 関連: [bot-requirements.md](./bot-requirements.md)（Bot も同じ `save-chat` 系の Edge 実行モデルを踏襲）

---

## 1. 目的 / 背景

### 移行前の問題

`ip` / `ua` はクライアントが取得し、INSERT ペイロードに自己申告で詰めていた。

- **`ip`**: `src/shared/utils/clientInfo.ts` が外部サービス（ipify / httpbin / jsonip）を順に叩いて取得。
  - 外部依存で遅い・落ちる・`'unknown'` に化ける（タイムアウト 3 秒 × 3 サービス）。
  - そもそもクライアントが任意の値で INSERT できるため、`ip` は**証跡として信用できない**。
- **`ua`**: `navigator.userAgent`。これも自己申告で改竄自由。
- `chats` の RLS が `public-insert WITH CHECK (true)` で、誰でも任意の行を直接 INSERT 可能だった。

### 採用方針

**方式A: INSERT ごと Edge Function に寄せる（証跡化）** を採用。

- `save-chat` Edge Function を新設し、`ip` / `ua` を**リクエストヘッダからサーバー側で確定**する。
- RLS で anon の直 INSERT を封鎖し、全 INSERT を `save-chat` 経由に強制する。
- 結果として `ip` / `ua` は**詐称不可能なサーバー観測値**になる。

> 検討した代替案（方式B: IP 参照関数だけ Edge 化）は、値の取得元を Edge にするだけでクライアントが
> 受け取った値を INSERT に詰める形が残るため、外部依存は排除できても「詐称可能」のままだった。
> 証跡化が目的のため方式A を採用した。

---

## 2. アーキテクチャ

### 移行前

```
useChatHandlers
  → getClientIP()  // ipify 等の外部サービス
  → getUserAgent() // navigator.userAgent
  → saveChatLogOptimistic(chat{ip, ua})
  → supabase.from('chats').insert(...)   // クライアントが直接 INSERT
  → Realtime echo → 全クライアント
```

### 移行後

```
useChatHandlers
  → saveChatLogOptimistic(chat)          // ip/ua を送らない
  → supabase.functions.invoke('save-chat', { body })
      Edge: ip = x-forwarded-for（先頭ホップ）→ x-real-ip
            ua = user-agent ヘッダ
            service_role で chats へ INSERT（RLS バイパス）
      return { uuid, room_id, time }
  → Realtime echo → 全クライアント
```

- クライアントは `ip` / `ua` / `uuid` / `time` / `deleted` を**送らない**。サーバーが確定する。
- `metadata`（`optimisticNonce` 含む）はそのまま渡す。Realtime echo で同じ nonce が返り、
  楽観的更新の突合（`reduceOptimisticChat`）が維持される。
- Edge は `uuid` / `room_id` / `time` を返し、クライアントの `mergeChat` が成立する。

---

## 3. 変更ファイル

### バックエンド（新規）

| ファイル                                                             | 内容                                                                                        |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `supabase/functions/save-chat/index.ts`                              | Edge Function 本体（Deno）。CORS・最小バリデーション・`ip`/`ua` 確定・`service_role` INSERT |
| `supabase/functions/save-chat/deno.json`                             | Deno 用 import map（`@supabase/supabase-js`）                                               |
| `supabase/config.toml`                                               | `[functions.save-chat] verify_jwt = false`（匿名チャットのため）                            |
| `supabase/migrations/20250619000000_lock_insert_to_service_role.sql` | `chats` の INSERT を `service_role` のみに封鎖                                              |

### クライアント

| ファイル                                           | 変更                                                                                                                                 |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `src/features/chat/api/chatApi.ts`                 | `saveChatLogOptimistic` / `saveChatLog` / `saveChatLogFireAndForget` を `functions.invoke('save-chat')` 経由に。`ip`/`ua` を送らない |
| `src/features/chat/hooks/useChatHandlers.ts`       | `getClientIP` / `getUserAgent` 取得（入室・退室・送信の 3 箇所）を撤去                                                               |
| `src/features/chat/components/EntryForm/index.tsx` | `prefetchClientIP` のプリフェッチ配線を撤去                                                                                          |
| `src/shared/utils/clientInfo.ts`                   | **削除**（外部 IP サービス依存もろとも消滅）                                                                                         |
| `src/shared/utils/index.ts`                        | `clientInfo` の barrel export を削除                                                                                                 |

### テスト / 設定

| ファイル                                | 変更                                                         |
| --------------------------------------- | ------------------------------------------------------------ |
| `src/test/setup.ts`                     | `supabase.functions.invoke` の既定モックを追加               |
| `src/features/chat/api/chatApi.test.ts` | 「`ip`/`ua` を送らない」「Edge エラーの伝播」の 2 ケース追加 |
| `src/App.test.tsx`                      | 不要になった `clientInfo` モックを削除                       |
| `eslint.config.js`                      | `supabase/functions`（Deno）を lint 対象から除外             |
| `CLAUDE.md`                             | データフロー・Supabase Integration の記述を更新              |

---

## 4. CORS（ブラウザからの invoke 対応）

`save-chat` はブラウザ（GitHub Pages / `localhost` の dev）から `supabase.functions.invoke`
で呼ばれるため、CORS プリフライト（OPTIONS）に応答する必要がある。

ハマりどころとして、`src/shared/supabaseClient.ts` のグローバル設定が **全リクエストに
カスタムヘッダ `X-My-Custom-Header` を付与**する。これによりブラウザのプリフライトは
`Access-Control-Request-Headers: ..., x-my-custom-header` を要求するが、Edge 側の許可リストに
これが無いとプリフライトが失敗し、`supabase-js` は
`Failed to send a request to the Edge Function`（`FunctionsFetchError`）を投げる。

> curl では `x-my-custom-header` を送らないため通ってしまい、ブラウザだけで再現する点に注意。

対策として、**プリフライトが要求したヘッダをそのまま許可に反映**する実装にした
（`buildCorsHeaders(req)`）。今後クライアント側のグローバルヘッダが増えても壊れない。

```ts
function buildCorsHeaders(req: Request): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers':
      req.headers.get('access-control-request-headers') ??
      'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
```

`Access-Control-Allow-Origin: *` は全レスポンス（プリフライト・正常・エラー）に付与する。
匿名チャットのため認証クッキーは使わず、`verify_jwt = false` 運用なので `*` で問題ない。

---

## 5. RLS の封鎖

`chats` の INSERT ポリシーを差し替えた。

```sql
DROP POLICY IF EXISTS "public-insert" ON "public"."chats";

CREATE POLICY "service-role-insert" ON "public"."chats"
  FOR INSERT TO "service_role"
  WITH CHECK (true);
```

- SELECT（`public-select`）/ UPDATE（`public-update`、論理削除）は**従来どおり anon 可**。
- 将来の Bot 機能も `service_role` で INSERT するため、本ポリシーと両立する。

---

## 6. デプロイ手順（段階・順序が重要）

本対応は「関数デプロイ」と「RLS 封鎖」を**別タイミング**で行う。順序を誤ると本番の発言が
止まるため、以下の段階を守る。

### 段階1: Edge Function のデプロイ（今すぐ可・本番影響なし）

```bash
supabase functions deploy save-chat
```

- 本番の旧クライアントは直 INSERT のままで `save-chat` を呼ばないため、関数を足しても**挙動は変わらない**。
- `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は Edge に自動付与されるため、追加の secret 設定は不要。
- これで新クライアント（dev 含む）の Edge 経由 INSERT が機能する。

### 段階2: 新クライアントを本番反映

```bash
pnpm deploy   # GitHub Pages へ新クライアント（Edge 経由 INSERT 版）を公開
```

### 段階3: RLS で直 INSERT を封鎖（証跡化の仕上げ）

> ⚠️ **段階2 より前に封鎖すると、本番の旧クライアントの発言が全て失敗する**。必ず新クライアント
> 公開後に実施する。

```bash
# baseline は本番 DB に適用済みのため「適用済み」として登録（再実行・衝突を防ぐ）
supabase migration repair --status applied 20250618000000
# 未適用の lock_insert マイグレーションだけが流れる
supabase db push
```

- `migration repair` は**履歴台帳のみ**を更新（SQL 実行なし／データ不変）。
- `db push` で流れる lock_insert は **RLS ポリシーの差し替えのみ**で、`chats` の行データは削除しない。
- ⚠️ `supabase db reset`（全消去・流し直し）は**本番で使わない**こと。`db push` は差分適用で別物。

### ローカル検証

`supabase start` → `supabase functions serve save-chat` で Edge 経由フローを実機確認できる。
ポート競合（他プロジェクトの Supabase スタック）や docker context（Docker Desktop 未起動）に注意。

---

## 7. 検証結果

- `pnpm typecheck` ✅
- `pnpm lint` ✅
- `pnpm test` ✅（198 件）
- `pnpm build` ✅

---

## 8. 留意点 / 今後

- **トレードオフ**: 楽観的更新フローに Edge 1 ホップが追加される。表示自体は楽観 INSERT で即時のため
  体感影響は小さいが、保存確定までのレイテンシは増える。
- **なりすまし**: `metadata.kind`（`admin`/`fortune`/将来の `bot`）は引き続きクライアント値をそのまま保存する。
  本対応は `ip`/`ua` の証跡化が目的で、`kind` はセキュリティ境界として扱わない（[bot-requirements.md](./bot-requirements.md) §7 と同方針）。
- **将来**: `save-chat` に NG ワード / レート制限 / `system`・`kind` の僭称防止を載せる余地がある（本対応ではスコープ外）。
