# bot-respond デプロイ・運用チェックリスト

> **これらはすべて手動(ops)操作です。** コードの変更ではなく、Supabase ダッシュボード / CLI での設定作業です。

---

## 前提

- `supabase link --project-ref <ref>` でローカル CLI がプロジェクトに接続済みであること。
- `OPENAI_API_KEY` が取得済みであること。
- 既存マイグレーション(`baseline_schema` / `lock_insert_to_service_role`)は本番 DB 適用済み。

---

## 1. マイグレーション履歴の整合

Bot 機能は**新規テーブル・カラムなし**。ただし、CLI が未適用と誤認識する場合は以下で修正する。

```bash
supabase migration repair --status applied 20250618000000  # baseline_schema
supabase migration repair --status applied 20250619000000  # lock_insert_to_service_role
supabase migration list                                    # local/remote 整合確認
```

---

## 2. シークレットの設定

```bash
# 必須
supabase secrets set OPENAI_API_KEY=sk-...
supabase secrets set BOT_WEBHOOK_SECRET=<ランダムな文字列>  # secret 未設定だと関数が全リクエストを拒否する

# 必要に応じてカスタマイズ
supabase secrets set BOT_MODEL=gpt-4o-mini
supabase secrets set BOT_SYSTEM_PROMPT="あなたはゆいちゃっとのアシスタントです。"
supabase secrets set BOT_NAME="ゆいボット"
supabase secrets set BOT_GREETINGS="こんにちは\nよろしくね"
supabase secrets set BOT_COOLDOWN_MIN_MS=8000
supabase secrets set BOT_COOLDOWN_MAX_MS=15000
supabase secrets set BOT_RESPONSE_DELAY_MIN_MS=2000
supabase secrets set BOT_RESPONSE_DELAY_MAX_MS=6000
supabase secrets set BOT_HISTORY_MESSAGE_CAP=20
supabase secrets set BOT_TARGET_ROOM=superbeginner
```

`SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` は Edge Function 実行環境に自動注入されるため不要。

---

## 3. Edge Function のデプロイ

```bash
supabase functions deploy bot-respond
```

---

## 4. Database Webhook の作成

Supabase ダッシュボード → **Database → Webhooks → Create a new hook** で以下を設定する。

| 設定項目 | 値 |
|---------|-----|
| Name | `chats-insert-bot-respond` |
| Table | `public.chats` |
| Events | `INSERT` のみ |
| Type | Supabase Edge Functions |
| Edge Function | `bot-respond` |
| HTTP Headers | `Authorization: Bearer <anon key>` (必須) |
| HTTP Headers | `x-bot-webhook-secret: <BOT_WEBHOOK_SECRET>` (必須) |

> **重要**: Webhook は**全ルームの全 INSERT** で発火する。`bot-respond` は `record.room_id !== 'superbeginner'` を DB アクセス前に弾くため、他ルームのコスト影響は最小限。

---

## 5. OpenAI の予算上限設定(推奨)

OpenAI ダッシュボード → **Settings → Limits** でハード予算上限を設定することを強く推奨する。

- 月次ハード上限: 運用コストの上限として設定(例: $10/月)
- `bot-respond` は 429 エラーを握りつぶして `200` を返すため、上限超過時は自動的に Bot が沈黙する(チャット自体は継続)。

---

## 6. ローカル検証

```bash
supabase start
supabase functions serve bot-respond

# Webhook ペイロード相当の JSON を POST して挙動確認
curl -X POST http://localhost:54321/functions/v1/bot-respond \
  -H "Content-Type: application/json" \
  -H "x-bot-webhook-secret: <secret>" \
  -d '{"type":"INSERT","table":"chats","record":{"uuid":"test","room_id":"superbeginner","name":"alice","color":"#fff","message":"こんにちは","time":1700000000000,"metadata":{"version":1,"kind":"normal"}}}'
```

---

## 7. ESLint の分離確認

`eslint.config.js` は `supabase/functions/**` を app lint から除外済み。`bot-respond` と `_shared` もこの除外に含まれるため追加設定不要。

Deno 側の型チェックは `deno check supabase/functions/bot-respond/index.ts` で別系統実施（任意）。
