# 成長計測イベント設計

最終更新: 2026-08-20

## 目的

PVや総発言数ではなく、入室、初回発言、他参加者からの返信、会話成立までの転換を計測する。表示名、本文、メールアドレス、URLなどの自由入力はGA4へ送らない。

## 再検討した結果

- `source` はGA4の流入元と混同しやすいため、サイト内の入室文脈を表す `entry_context` に変更する。
- `seconds_bucket` は集計粒度を後から変えられないため、数値の `reply_latency_seconds` を送る。
- 入室失敗を離脱と区別するため、`room_join_failed` を追加する。
- RSVP取り消しを把握するため、`event_rsvp_cancelled` を契約へ追加する。
- `active_lobby_view` は本当の現在接続を表示できるPresence実装後に発火する。直近6時間の発言者数をオンライン人数として送らない。
- イベント、招待、通知、通報は各機能の実装時に発火する。今回のPRでは型付き契約のみを定義し、存在しない操作のイベントは送らない。

## 今回から発火するイベント

| イベント                    | 発火条件                                               | パラメータ                                           |
| --------------------------- | ------------------------------------------------------ | ---------------------------------------------------- |
| `room_join_started`         | 入室フォーム送信時                                     | `room_id`, `entry_context`                           |
| `room_join_failed`          | 名前検証または入室ログ保存失敗                         | `room_id`, `entry_context`, `reason_category`        |
| `chat_enter`                | 入室処理完了時                                         | `room_id`, `room_title`, `entry_context`             |
| `chat_first_message`        | 入室後、最初の通常発言保存成功時                       | `room_id`, `seconds_from_enter`, `prompt_id`（将来） |
| `reciprocal_reply_received` | 最初の通常発言後、同じ部屋で自分以外の通常発言を初受信 | `room_id`, `reply_latency_seconds`                   |
| `conversation_activated`    | `reciprocal_reply_received` と同時                     | `room_id`, `activation_rule`                         |

既存の `room_selected`、`chat_enter`、`message_sent`、`chat_exit`、`command_used` は維持する。

### 会話成立ルール v1

`reply_after_first_message_v1` は、入室後の最初の通常発言が保存された後、同じ部屋で別の通常発言をRealtime受信した状態とする。

- 管理人メッセージ、入退室メッセージ、おみくじ、コマンドを除外する。
- 自分の保存結果がRealtimeで返るechoは `optimisticNonce` とUUIDで除外する。
- 1回の入室につき最初の成立だけを送る。
- 現時点では返信先を示すデータがないため、厳密な発言間返信ではなく「自分の発言後に同室で他者発言を受信」の近似である。
- WRCは複数利用者・複数日を突き合わせる必要があるため、GA4標準レポートではなくSupabaseまたはBigQueryで集計する。

## 将来の機能で発火するイベント

| 機能               | イベント                                              |
| ------------------ | ----------------------------------------------------- |
| Presence稼働ロビー | `active_lobby_view`                                   |
| イベント予定       | `event_rsvp`, `event_rsvp_cancelled`, `event_join`    |
| 招待               | `invite_created`, `invite_opened`, `invite_activated` |
| リマインド         | `reminder_opt_in`, `reminder_click`                   |
| 通報               | `report_submitted`                                    |

`invite_id` はランダムな不透明IDとし、GA4のカスタムディメンションには登録しない。招待単位の厳密な成果判定はバックエンドまたはBigQueryで行う。

## GA4管理画面の設定

### カスタムディメンション

| 表示名              | イベントパラメータ | 用途                                           |
| ------------------- | ------------------ | ---------------------------------------------- |
| Room ID             | `room_id`          | 部屋別比較                                     |
| Entry context       | `entry_context`    | lobby、invite、event等の比較                   |
| Join failure reason | `reason_category`  | 入室失敗原因。通報機能追加時は用途分離を再検討 |
| Activation rule     | `activation_rule`  | 会話成立定義のバージョン管理                   |
| Prompt ID           | `prompt_id`        | 話題カード実装後の比較                         |
| Event ID            | `event_id`         | イベント企画別比較                             |

### カスタム指標

| 表示名             | イベントパラメータ      | 単位 |
| ------------------ | ----------------------- | ---- |
| Seconds from enter | `seconds_from_enter`    | 秒   |
| Reply latency      | `reply_latency_seconds` | 秒   |
| Active room count  | `active_room_count`     | 標準 |

`conversation_activated` はキーイベント候補とする。カスタム定義は過去データへ遡及しないため、リリース前にGA4側で登録する。

## 最初に作る探索レポート

1. `room_join_started` → `chat_enter` → `chat_first_message` → `conversation_activated` のファネル
2. `room_id` × `entry_context` 別の会話成立率
3. `seconds_from_enter` と `reply_latency_seconds` の分布
4. 初回訪問者の `conversation_activated` とW1再訪の比較

GA4はイベント到達とチャネル比較、Supabase／BigQueryはWRC、返信関係、重複除外の集計に使い分ける。
