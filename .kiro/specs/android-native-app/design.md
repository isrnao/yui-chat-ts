# 技術設計ドキュメント: android-native-app

## 概要

お気楽チャットTS の Android ネイティブアプリの設計。要件は [requirements.md](./requirements.md)（以下 R と番号）、
調査は [research.md](./research.md)、作業の順序は [tasks.md](./tasks.md)。requirements.md の「決めること」
Q1〜Q13 は推奨どおりに決めた前提で書く。

> **2026-10-11 改訂（PR #203 の後）。** サーバーが規則の正になったので、次のように組み直した。
>
> - §7 を「これから作るサーバーの変更」から「**実装済みの契約**（アプリが呼ぶ形）と残りの作業」にした
> - データ層（§6.3〜§6.7）を、その契約（冪等な再送、400 のコード、`extra`、`clear_my_chats` の uuid 配列、
>   Author_Key の形）に合わせた。`core:common` から運勢と入退室の組み立てを外した
> - Contracts（§8）の生成元に `schema.ts` / `messages.ts` を足し、運勢を外した
> - ブロック（§4.7）を Web の「フィルタ」（`chat-ip-mute`）と同じ規則にした（Q12）
>
> **同日の決定。** リポジトリは別の `okiraku-android`（Q6、§1）。削除済みの発言は API から隠さない（Q13）。他人の
> 名前で退室の発言を出せることは受け入れる（R21.8）。§1.1 に「クリーンに作るための約束」を足した。

### 設計方針

1. **見た目は Web、骨格は 2026 年の Android。** 画面の中身（色・書体・罫線・文言・並び・ログの向き）は Web の
   コンポーネントを 1 つずつ Compose に移す。画面の外側（insets、戻る、ウィンドウの大きさ、キーボード、ライフサイクル、
   アクセシビリティ）は Android の作法に従う。両者がぶつかったら、中身は Web、外側は Android を優先する
2. **規則はサーバーが持ち、アプリは呼ぶだけ。残るものは Contracts で縛る。** 入力の上限・予約名・metadata・部屋・
   入退室・おみくじ・`clear`・look の宛先は PR #203 でサーバーが正になった（§7）。アプリはそれを書き写さない。
   クライアントに残る規則（ログの並び、楽観的表示、参加者、フィルタ、日時の表記）は、Web と同じ入力と期待値の JSON で
   両方をテストする（§8）
3. **Web と同じ部屋に同じ形で書く。** アプリ専用の列・専用の部屋・専用の文言を作らない。変えるときはサーバーの契約
   として Web と同時に変える
4. **Web の Room_Log_Store をそのまま手本にする。** 取得・購読・取り直しの規則は Web で既にテストされている。
   アプリはその規則を純粋な関数に写し、同じテストを通す（§6.2）
5. **公開の条件に安全を置く。** Safety_Kit（R12）は機能の 1 つではなく、Play に出すための前提として最初の版に入れる

### 全体構成

```text
┌──────────────────────────── app ────────────────────────────┐
│ MainActivity（enableEdgeToEdge）                             │
│  └ NavDisplay（Navigation 3）                                │
│      ├ SceneStrategy: ボトムシート → リスト・詳細 → 1 枚      │
│      └ entry ごとの ViewModel（Hilt、部屋 ID は assisted）    │
├──────────────────────── feature/* ──────────────────────────┤
│ onboarding  home  chatroom  allrooms  chanari  safety  settings │
│   UI（Compose）→ ViewModel（UiState: StateFlow）→ intent      │
├───────────────────────── core/* ────────────────────────────┤
│ designsystem（Retro_Design_System）  ui（ChatLog など）       │
│ data（RoomLogRepository / ChatSender / ChatSession / …）     │
│ network（ChatApi / RealtimeHub / SafetyApi）  datastore       │
│ model  common  contracts（生成）  analytics  testing          │
└──────────────┬───────────────────────────────┬──────────────┘
               │ HTTPS / WebSocket              │
        Supabase（PostgREST / Realtime / Edge Functions）
               │                                │
        Web_App（同じ部屋・同じログ）           Contracts（contracts/*.json）
```

### 技術スタック

版は着手時の最新安定版に固定し、Renovate か Dependabot で上げる。stable でない API（Material 3 Expressive など）は
使わない（research.md §4.3）。

| 領域           | 採用                                                                                              | Web で当たるもの                               |
| -------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| 言語           | Kotlin 2.x（K2）                                                                                  | TypeScript 6                                   |
| UI             | Jetpack Compose（BOM）。strong skipping は既定のまま                                              | React 19 + React Compiler                      |
| ナビゲーション | Navigation 3 + Material 3 Adaptive の Scene（リスト・詳細）                                       | `resolveRoute.ts` + 全ページ読み込み           |
| 状態           | ViewModel + `StateFlow` + `collectAsStateWithLifecycle`                                           | `useSyncExternalStore` / `useState`            |
| 入力           | `TextFieldState`（状態ベースのテキストフィールド）                                                | 部品の中の `useState`                          |
| DI             | Hilt（部屋 ID は assisted injection）                                                             | —                                              |
| 非同期         | Coroutines / Flow                                                                                 | Promise / Actions                              |
| 通信           | `supabase-kt`（postgrest / realtime / functions）+ Ktor（OkHttp エンジン）                        | `@supabase/*-js` + `fetch`                     |
| JSON           | kotlinx.serialization                                                                             | —                                              |
| 保存           | DataStore                                                                                         | `localStorage` / `sessionStorage`              |
| 画像           | Coil 3（GIF は `AnimatedImageDecoder`）                                                           | `<img>`                                        |
| 音             | SoundPool                                                                                         | Web Audio                                      |
| 外部リンク     | Custom Tabs                                                                                       | `target="_blank"`                              |
| 計測           | Firebase Analytics（GA4 の同じプロパティに Android のストリーム）                                 | gtag.js                                        |
| 監視           | New Relic Android agent + Play Console の Android vitals                                          | New Relic Browser                              |
| テスト         | JUnit、kotlinx-coroutines-test、Turbine、kotest-property、Robolectric、Compose UI Test、Roborazzi | Vitest、fast-check、Testing Library、Chromatic |
| 静的解析       | Android Lint、detekt、ktlint（Spotless）、Compose の Lint                                         | ESLint、Prettier、`tsc`                        |
| 性能           | Baseline Profile、Macrobenchmark、R8                                                              | Lighthouse                                     |

## 1. リポジトリとモジュール構成（Q6）

**別のリポジトリ `okiraku-android`**（`yui-chat-ts` と同じ階層、`../okiraku-android`）に置く（2026-10-11 に決定）。
Web とサーバーは `yui-chat-ts` に残り、両者をつなぐのは Contracts（§8）と §7 の API だけにする。

```text
okiraku-android/
├── settings.gradle.kts
├── gradle/libs.versions.toml     # 版はここだけで決める
├── build-logic/convention/       # jvm-library / android-library / android-application / compose / feature の convention plugin
├── contracts/                    # yui-chat-ts の contracts/ の写し（§8.1）。手で直さない
│   └── UPSTREAM                  # 写した yui-chat-ts のコミット
├── scripts/sync-contracts.sh     # ../yui-chat-ts の contracts/ を写し、UPSTREAM を書く
├── app/                          # Application、MainActivity、NavDisplay、DI の組み立て
├── core/
│   ├── model/                    # Chat、ChatMetadata、RoomId、RoomMeta、Participant（純粋な Kotlin/JVM）
│   ├── contracts/                # contracts/*.json から生成した Kotlin（部屋、選択肢、上限、文言）（純粋な Kotlin/JVM）
│   ├── common/                   # 日時の表記、URL の分割、管理人の分割表示、参加者、フィルタの一致（純粋な Kotlin/JVM）
│   ├── network/                  # ChatApi / RealtimeHub / SafetyApi と、supabase-kt・Ktor による実装（§7 の契約）
│   ├── data/                     # RoomLogRepository、ChatSender、ChatSession、RoomCounts、Ranking
│   ├── datastore/                # 設定、下書き、フィルタ、同意、端末の鍵（Author_Key）
│   ├── designsystem/             # Retro_Design_System（トークン、書体、部品、ちゃなりのテーマ）
│   ├── ui/                       # ChatLog、ChatMessageRow、ParticipantsHeader などドメインの部品
│   ├── analytics/                # analytics.ts と同じイベントの契約と送信先
│   └── testing/                  # Fake の API、テストの時計、Contracts の fixtures の読み込み
├── feature/
│   ├── onboarding/               # 18 歳以上の確認と同意（R12.1）
│   ├── home/                     # 部屋一覧（R3）
│   ├── chatroom/                 # 通常チャット・ランキング（R4〜R9）
│   ├── allrooms/                 # 全部屋まとめ（R10）
│   ├── chanari/                  # ちゃなり（R11）
│   ├── safety/                   # 通報、フィルタの確認の窓と一覧（R12）
│   └── settings/                 # 設定・ライセンス・データの消去（R18）
└── baselineprofile/              # Baseline Profile の生成と Macrobenchmark（R19）
```

### 1.1 クリーンに作るための約束

1. **サーバーの規則を書き写さない。** 入力の上限・予約名・metadata の作り直し・入退室の文言・運勢・`clear` の対象は
   §7 の API が決める。アプリが持つのは「画面に要る値」（Contracts）と、クライアントに残った規則（§8 の fixtures で
   縛るもの）だけ
2. **依存は一方向。** `app → feature → core`。`core:data → core:network / datastore / model / common`。feature 同士は
   依存しない。`core:model`・`core:contracts`・`core:common` は Android に依存しない純粋な Kotlin/JVM のモジュールに
   する（JVM のテストが速く、将来 Kotlin Multiplatform に移せる）
3. **モジュールは使うときに作る。** 雛形の段階で空のモジュールを並べない。Task ごとに、テストと一緒に足す
4. **外部の型を外に出さない。** supabase-kt・Ktor の型は `core:network` の中だけ。上の層はインターフェースと
   `core:model` の型だけを見る（テストでは Fake に替える）
5. **テストを先に契約で書く。** クライアントに残った規則は、Web と同じ fixtures（`contracts/fixtures/`）を通して
   から実装する。テストの名前は日本語にする
6. **版は 1 か所。** `libs.versions.toml` で固定し、Renovate で上げる。stable でない API は使わない
7. **見た目は Web_Oracle で受け入れる。** 画面の Task は Roborazzi のスクリーンショットと Web の Storybook を並べて
   確かめ、結果を Task の完了の記録に残す

## 2. Web → Android の対応表

| Web                                                         | Android                                                                                          |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `ChatRoute`（部屋のページ）                                 | `ChatRoomScreen` + `ChatRoomViewModel`                                                           |
| `RetroSplitter`                                             | `RetroSplitter`（`core:designsystem`、§5.3）                                                     |
| `EntryForm` / `ChatRoom`                                    | `EntryForm` / `ChatForm`（`feature:chatroom`）                                                   |
| `ChatLogList`（`memo`）/ `ChatMessage`（`memo`）            | `ChatLog`（`LazyColumn`、key は nonce か uuid）/ `ChatMessageRow`（不変な `ChatRowUi`）          |
| `ParticipantsList` + `useNowMinute`                         | `ParticipantsHeader` + 分の境界で進む時計（ヘッダーだけ再コンポーズ）                            |
| Room_Log_Store（`roomLogStore.ts`）                         | `RoomLogRepository`（規則は純粋な `RoomLogReducer`、§6.2）                                       |
| `useOptimistic` + `reduceOptimisticChat`                    | `OptimisticLog`（保存中の発言の `StateFlow`）+ 同じ突き合わせの関数                              |
| `useChatSession` / `useChatSender`                          | `ChatSession` / `ChatSender`（アプリの寿命の CoroutineScope で保存する）                         |
| `realtime.ts` の channel registry                           | `RealtimeHub`（部屋ごとに 1 channel、参照数で閉じる）                                            |
| `<Activity mode="hidden">`（ランキング中もログを残す）      | ログの `LazyListState` を画面の外に持ち上げて残す                                                |
| `useActionState`（送信中・エラー）                          | ViewModel の `UiState.sending` / `sendError`                                                     |
| `persistentStore`（`localStorage`）                         | DataStore                                                                                        |
| `webAudioPlayer.ts`                                         | `LookSoundPlayer`（SoundPool）                                                                   |
| `saveChat.ts`（`saveChatWithRetry`）                        | `ChatApi.save`（§7.1。応答の行で確定、400 は再試行しない）                                       |
| `chatQueries.ts` の `clearMyChats`                          | `ChatApi.clearMine`（§7.2。uuid の配列を返す）                                                   |
| `authorKey.ts`                                              | `AuthorKeyStore`（DataStore、§7.3）                                                              |
| `ipFilterStore.ts` / `ipFilter.ts`                          | `FilterStore`（DataStore）/ `FilterMatcher`（`core:common`）                                     |
| `useDoubleTap` + `FilterConfirmDialog` / `FilterListDialog` | `Modifier.pointerInput { detectTapGestures(onDoubleTap) }` + 確認の窓 / 一覧（`feature:safety`） |
| `haptics.ts`                                                | `HapticFeedbackType.Confirm`（「フィルタする」を押したとき）                                     |
| `analytics.ts`                                              | `AnalyticsEvent`（同じ名前とパラメータ）                                                         |
| Storybook + Chromatic                                       | `@Preview` + Roborazzi                                                                           |
| React Compiler に任せて手でメモ化しない                     | strong skipping に任せ、`remember` での手動の最適化は計測してから                                |

## 3. 画面とナビゲーション

### 3.1 行き先

```kotlin
@Serializable sealed interface AppRoute : NavKey
@Serializable data object Onboarding : AppRoute
@Serializable data object Home : AppRoute
@Serializable data class ChatRoom(val roomId: String) : AppRoute
@Serializable data object AllRooms : AppRoute
@Serializable data class Chanari(val roomId: String) : AppRoute
@Serializable data class Report(val chatUuid: String, val roomId: String) : AppRoute // ボトムシート
@Serializable data object Settings : AppRoute
@Serializable data object Filters : AppRoute // フィルタの一覧（Web の FilterListDialog）
@Serializable data class Document(val kind: DocKind) : AppRoute // 規約・プライバシー・安全ガイド・使い方・ルール
```

- バックスタックは `rememberNavBackStack` で持ち、プロセスが終わっても戻せる
- entry ごとに ViewModel と保存状態を持たせる（`rememberViewModelStoreNavEntryDecorator` と
  `rememberSaveableStateHolderNavEntryDecorator`）。同じ部屋を 2 回積んでも別の ViewModel になる
- 同意していなければ `Onboarding` から始め、同意したら `Home` に置き換える（R12.1）
- 部屋の ID は `ChatRoom` を作るときに App_Room_Scope で確かめる。範囲外（ディープリンクなど）は `Home` にする（R13.2）
- `Document` は Web の `/terms/` などを Custom Tabs で開く。使い方とルールだけはアプリの中に文を持つ（トップの右カラムと同じ文）

### 3.2 アダプティブな配置（R15）

`NavDisplay` に Scene の戦略を上から順に渡す。

| 戦略         | 対象                                 | Compact        | Medium   | Expanded               |
| ------------ | ------------------------------------ | -------------- | -------- | ---------------------- |
| ボトムシート | `Report`                             | 下からのシート | 同左     | 同左（幅を制限）       |
| リスト・詳細 | `Home`（リスト）と部屋の画面（詳細） | 1 枚ずつ       | 1 枚ずつ | 左に部屋一覧、右に部屋 |
| 1 枚         | それ以外                             | 全画面         | 全画面   | 全画面                 |

- Expanded で部屋を選んでいないときは、右側に Web のトップの中央・右カラム（ピックアップ、使い方、ルール）を出す。
  Web のトップが `lg` で 3 列になるのと同じ見え方になる
- 部屋の画面の中の `RetroSplitter` の初期の高さは、Expanded では Web の PC と同じ値を使う（入室前 24%）
- 向き・サイズは固定しない（Android 17 の要件。research.md §4.1）

### 3.3 戻る（Q5）

- 予測型「戻る」は Navigation 3 に任せる。部屋の画面で `BackHandler` を使って戻る操作を横取りしない（横取りすると
  予測のアニメーションが出なくなる）
- **入室中に部屋の画面を離れたら、[退室] と同じ退室の発言を出す。** 部屋の entry がバックスタックから外れると
  ViewModel の `onCleared` が呼ばれるので、そこで入室中なら `ChatSession.exit()` をアプリの寿命の CoroutineScope で
  走らせる。回転やウィンドウの大きさの変更では ViewModel は残るので呼ばれない
- Expanded で別の部屋を選ぶと詳細の entry が入れ替わるので、前の部屋から退室する（1 人が 2 部屋に同時にいる状態を
  作らない。Web で別のページへ移るのと同じ）
- プロセスが終了させられた場合は退室の発言を出せない。Web でタブを閉じた場合と同じく、参加者一覧は 5 分で外れる

### 3.4 画面の状態の持ち方

| 状態                               | 置き場所                                     | 回転・サイズ変更 | プロセスの終了後                       |
| ---------------------------------- | -------------------------------------------- | ---------------- | -------------------------------------- |
| ログ、接続、送信中、エラー         | ViewModel の `StateFlow`                     | 残る             | 取り直す                               |
| 入室しているか                     | ViewModel（`SavedStateHandle` には置かない） | 残る             | 入室前に戻る（Web の再読み込みと同じ） |
| 入室フォームの値                   | DataStore の値を既定にし、編集中は ViewModel | 残る             | 保存済みの値                           |
| 発言欄                             | `rememberTextFieldState`（画面の中だけ）     | 残る             | 残る                                   |
| 境界線の位置、ログのスクロール位置 | `rememberSaveable` / `LazyListState`         | 残る             | 残る                                   |

発言欄を ViewModel に置かないのは、Web で発言欄の値を `ChatRoom` の中だけで持ち、1 文字ごとにルート全体を
再レンダーしないようにしたのと同じ理由。

## 4. 画面ごとの設計

### 4.1 同意（`feature:onboarding`、R12.1 / R13）

- 初回だけ出す。レトロな配色の 1 画面に「18 歳以上です」の確認、利用規約・プライバシーポリシー・安全ガイドへの
  リンク、[同意してはじめる] を置く
- 同意した規約の版（`contracts/legal.json` の `version`）を DataStore に保存する。版が上がったら起動時にもう一度出す
- 18 歳未満を選んだら先へ進めない（Play の Restrict Minor Access と二重に守る）

### 4.2 ホーム（`feature:home`、R3）

- Web の `Header` をテキストのロゴ（「お気楽チャット」+ TS のバッジ + `www.okiraku.chat`）で描き、スクロールすると
  流れる（固定のアプリバーにしない）。タブ（`tabNav`）は横にスクロールする行にする
- 部屋一覧は `contracts/directory.json`（`chatDirectoryGroups` から生成）を App_Room_Scope で絞って並べる。
  見出し・補足・色・`circle` の行頭・「n人」のバッジは Web の `LeftColumn` / `CountBadge` と同じ
- 人数は `RoomCountsRepository` が RPC `room_participant_counts` から取る。最初は全部屋「0人」で描き、届いたら
  置き換える（Web と同じ）。前面に戻ったら、60 秒以上たっていれば取り直す
- ピックアップ、使い方、ルール・マナー、コミュニティ、フッターは Web と同じ文言。X のタイムラインは「@chat_a の
  つぶやきを X で見る」のリンクにし、広告は出さない（Q9）

### 4.3 部屋（`feature:chatroom`、R4〜R8）

Web の `ChatRoute` と同じく、上に入力、下にログを置いた `RetroSplitter` の 1 画面。

```text
┌ 部屋の題名（ピンク） ──────────────┐   ┌ [退室] [ランキング] ─────────────────┐
│ おなまえ [__________] 記入してね！ │   │ [更新] [発言] [消す] おなまえ: ゆい  │
│ [チャットに参加する] [リセット]     │   │ [発言________________________]       │
│ 名前の色 [#ff69b4] カラーナビ □こっそり│ │ ログ行数[30▾] Size[2▾] 色[black▾] □細字│
│ E-Mail/URL [任意______]            │   ├══════════ 境界線（ドラッグ） ═══════┤
│ ○なし ○🌟 ○🌟 …（アバター 14 種）  │   │ [20:10] 参加者(3): ゆい ほし つき …  │
│ 部屋の紹介・カテゴリ・ほかの部屋    │   │ ─────────────────────────────────── │
├══════════ 境界線 ══════════════════┤   │ 🌟ゆい > こんにちは (01/02(Wed) 20:10 │
│ ログ（入室前も読める）              │   │ 219.107.106.*)                       │
└────────────────────────────────────┘   └──────────────────────────────────────┘
          入室前                                        入室後
```

- **入室フォーム**: Web の `EntryForm` の行をそのまま並べる。「カラーナビ」は Web の `<input type="color">` に
  当たる、パレットと 16 進入力のダイアログを開く。アバターは GIF を 24dp で並べたラジオ。[チャットに参加する] で
  `ChatRoomViewModel.enter()` を呼び、保存を待たずに入室後の画面へ切り替える（R4.3）
- **発言フォーム**: 発言欄は `ImeAction.Send` で送る。送信の操作で発言欄をすぐ空にし（`TextFieldState.clearText()`）、
  送信が終わったらフォーカスを戻す。ほかの人の発言が届いてもフォーカスを動かさない（R5.6。Web で直した不具合と同じ）
- **select**（ログ行数・Size・色）: 凹んだ罫線の箱を押すと、レトロな枠の `DropdownMenu` で選択肢を出す。色の選択肢は
  その色の文字で描く（Web の `<option style={{ color }}>` と同じ）
- **ログ**（§4.3.1）とランキング（§4.4）は下のペインで切り替える

#### 4.3.1 ログ（R6）

```kotlin
LazyColumn(state = logListState) {
  item(key = "participants", contentType = "header") { ParticipantsHeader(participants, now) }
  item(key = "divider-top", contentType = "divider") { RetroDivider() }
  items(rows, key = { it.key }, contentType = { it.kind }) { row ->
    ChatMessageRow(row, onLongPress = { openMessageMenu(row) })
    RetroDivider()
  }
}
```

- **並び**: Room_Log_Repository が新しい順に並べたものを `take(windowRows)` するだけにする。ここで並べ直さない
  （Web の `ChatLogList` と同じ）
- **key**: 楽観的な発言は保存の前後で uuid が変わるので、`metadata.optimisticNonce` があればそれを key にする。
  確定の前後で行を作り直さないので、Web よりちらつきが少ない
- **先頭に留まる**（R6.5）: 新しい発言は index 0 に入る。`LazyColumn` は key で見えている行を保つため、そのままでは
  先頭を見ていても新着が上に隠れる。新着の前に先頭（先頭の 2 行以内）を表示していたときだけ
  `requestScrollToItem(0)` で先頭へ戻す。古い発言を読んでいるときは何もしない
- **行の組み立て**: 1 行の表示（`ChatRowUi`: `AnnotatedString`、アバター、きらめきの有無、時刻の文字列）は
  ViewModel の側で作り、不変なデータとして渡す。本文の URL は `LinkAnnotation.Url` にし、押したら Custom Tabs で開く。
  書式の `em` は `sp` に掛ける（Size 1〜5 = 0.8 / 1 / 1.2 / 1.5 / 2 倍、名前は 1.08 倍、管理人の名前は 1.3 倍）
- **管理人の発言**: Web の `AdminMessage` と同じ分割（`splitAdminMessage`）で名前と残りを分け、入室の発言には
  2 行目（UA・訪問回数・LAST LOGIN）を付ける。「Issue #N」は自リポジトリの Issue へのリンクにする
- **参加者**: 分の境界で進む時計（Web の `useNowMinute`）をヘッダーの中だけで読む。1 分ごとに再コンポーズされるのは
  ヘッダーだけにする
- **ダブルタップ**: Web の `chat-ip-mute` と同じく、行のどこでもダブルタップでフィルタの確認の窓を出す（§4.7）。
  押した場所で種類を決める（名前 → 名前、本文 → 言葉、それ以外 → IP）。リンクの上では反応しない
- **長押し**: 本文の選択（`SelectionContainer`）とは別に、行の長押しでレトロな枠のメニュー（コピー／通報する／
  フィルタする）を出す。通報は 2 操作（長押し → 通報する）で届く（R12.2）。Web は長押しを文字の選択に残して
  いるが、アプリでは通報の導線が要るのでメニューを足す（文字の選択はメニューの「コピー」と、ダブルタップの
  言葉のフィルタの窓の中で行える）
- **多い行数**: 1000 行でも `LazyColumn` は見えている行だけを作る。Web の `content-visibility: auto` に当たる工夫は
  要らない
- **状態の表示**: 読み込み中・失敗・発言なしは Web と同じ文言にする。つながっていないときはログを残したまま、上に
  「接続が切れています。つながり次第取り直します。」を出す（R8.5。Web の mock は出さない）

#### 4.3.2 分割（R7）

`RetroSplitter(top, bottom, topKind, minTop = 100.dp, minBottom = 100.dp)`。

- 境界線は Web と同じく上 4dp の灰色（`#b1b1b1`）と下 1dp の白の 2 本線。見た目は細いが、押せる範囲は上下に広げて
  48dp にする
- 位置は上のペインの割合で持ち、`rememberSaveable(topKind)` で入室前と入室後に分ける（切り替わると初期値に戻る。R7.5）
- **キーボード**: 画面全体に `WindowInsets.ime` を当てる。キーボードが開いたら、上のペインは開く前の高さ（dp）を保ち、
  下のペインだけを縮める。下が 100dp を切るときだけ上を縮める（R7.4）
- **支援技術と物理キーボード**: semantics に「上の領域を広げる」「上の領域を狭める」のカスタムアクションを付け、
  上下の矢印キーでも動かす（Web の `role="separator"` と矢印キーに当たる）

#### 4.3.3 通知音（R8.4）

- `LookSoundPlayer` は `rin`（Web の `rin.webm` を Ogg Opus に移したもの）を SoundPool に一度だけ読み込む
- 鳴らすのは、アプリが前面にあり、端末がマナーモードでなく、設定の「音を鳴らす」が有効なときだけ。Web と違い、
  音を鳴らすための操作（解錠）は要らない
- 自分の `look` は保存が終わったら鳴らし、`unlook` で止める。ほかの人の `look` / `unlook` は、Realtime で届いた
  INSERT の本文で鳴らす・止める（Web も #198 で同じ形にした。broadcast は無い）。取得で入った
  過去の発言と自分の発言では鳴らさない

### 4.4 ランキング（R9）

- [ランキング] で下のペインをログからランキングに切り替える。ログの `LazyListState` は画面の外に持ち上げて残すので、
  戻ったときに同じ位置から続く（Web の `<Activity>` と同じ結果）
- 開閉は `AnimatedContent` のフェードにする。Web の `<ViewTransition>` と同じく、開閉のときだけ動かし、ログの
  読み込み完了では動かさない。端末でアニメーションを切っていれば動かさない

### 4.5 全部屋まとめ（R10）

- `RoomLogRepository` を全部屋の対象で作る（取得は 200 件から。Realtime は部屋を絞らない 1 channel）
- 取得は `room_id=in.(App_Room_Scope)` で絞り、Realtime で届いた範囲外の部屋の発言はクライアントで捨てる（R10.4）
- 返信先の表示と切り替えは Web の `useReplyTarget` と同じ。発言の部屋名は押せるリンクにする

### 4.6 ちゃなり（R11）

- `core:designsystem` に `ChanariTheme`（`chanari.css` の色・罫線・ヘッダー）を置き、画面をその中で描く。
  データ・Session・コマンドは通常チャットの部品を使う（Web と同じ構成）
- リロード秒は Realtime が切れている間だけ取り直す（`useReloadInterval` と同じ条件）
- 下書きは部屋ごとに DataStore へ保存し、Web の `draftStore.ts` と同じ検証（版、更新時刻が未来でない・1 年以内、
  本文 1000 文字以内）で読み込む

### 4.7 通報とブロック（`feature:safety`、R12）

- **通報**: `Report` のボトムシート。理由（児童の安全に関わる／性的な内容／嫌がらせ・脅し／個人情報・連絡先の要求／
  スパム・宣伝／その他）を選び、任意の説明（500 文字）を足して送る。送ったら「通報を受け付けました」を出す。
  児童の安全に関わる理由を選んだときは、緊急時の相談先（警察の窓口など）も示す
- **ブロック（フィルタ、Q12）**: Web の `chat-ip-mute` の Filter_List をそのまま持ち込む。種類は IP（伏せ字。
  `{ ip, names }`）・名前・言葉で、3 種類で最大 50 件。確認の窓の見出しと説明、一致の規則（名前は完全一致で入退室の
  `subject` にも当てる、言葉は NFKC・大文字小文字を区別しない 50 文字まで、管理人の定型文には当てない）、一覧の
  並び（追加した順、隠れている件数）は Web と同じ。「フィルタする」を押したら `HapticFeedbackType.Confirm` で震わせる。
  伏せ字の IP は別人と同じ値になりうることを一覧の画面で説明する（Web と同じ文言）
- フィルタはログの切り出し（`take(windowRows)`）の**前**に取り除く（Web の Requirement 5.1 と同じ）
- **連絡先の警告**（P1）: 発言に電話番号・メールアドレス・SNS の ID らしい文字列があれば、送る前に
  「連絡先を書き込むのは危険です」と確かめる（成長戦略 §7.1）

### 4.8 設定（`feature:settings`、R17 / R18）

音を鳴らす、計測を送る、フィルタの一覧、端末のデータを消す、利用規約・プライバシーポリシー・安全ガイド、
お問い合わせ（管理者チャットを開く）、ライセンス（DotGothic16 の SIL OFL と OSS）、版。

## 5. Retro_Design_System（R14）

### 5.1 トークン

Web の `src/styles/theme.css` を唯一の定義にし、`contracts/theme.json` に書き出して Kotlin の `RetroColors` を
生成する（手で写さない）。`docs/ARCHITECTURE.md` の古い値（`#a1fe9f`）ではなく `theme.css` の `#c1fc92` を使う。

| トークン       | 値        | 使う場所                     |
| -------------- | --------- | ---------------------------- |
| `yuiGreen`     | `#c1fc92` | 部屋の画面の背景             |
| `yuiPink`      | `#ff69b4` | 部屋の題名、名前の色の既定   |
| `yuiPinkLight` | `#ffe4ef` |                              |
| `ieGray`       | `#b1b1b1` | 立体の罫線の暗い側、境界線   |
| `ieBlue`       | `#4a90e2` | フォーカスした入力欄の罫線   |
| `ieBg`         | `#f3f3f3` | ボタンのグラデーションの上側 |
| `entryNameRow` | `#feb6c1` | 入室フォームのおなまえの行   |
| `buttonBottom` | `#e4e4e4` | ボタンのグラデーションの下側 |

`FONT_COLOR_CSS`（15 色）、`FONT_SIZE_CSS`、アバターの一覧、ログ行数の選択肢も同じく `contracts/` から生成する。

### 5.2 書体

- DotGothic16（SIL OFL）の TTF を `res/font` に同梱し、Web と同じく DotGothic16 → 端末の日本語書体の順で使う。
  Web は 100 以上の分割した woff2 を読み込むが、アプリは 1 ファイルでよい。同梱する大きさを測り、R19.4 の目安に
  収まらなければ、Google Fonts のダウンロード可能フォント（初回だけ取得）に切り替える
- 文字の大きさは `sp` で指定する。Web の `px` は同じ数の `sp` にする（12px → 12sp）

### 5.3 部品

`foundation` の上に作り、Material の見た目を持ち込まない。

| 部品                           | Web                                | 描き方                                                                                  |
| ------------------------------ | ---------------------------------- | --------------------------------------------------------------------------------------- |
| `RetroButton`                  | `Button`（outset、グラデーション） | `drawBehind` で左上を明るく右下を暗く 2px。押している間は逆にし、グラデーションも替える |
| `RetroTextField`               | `Input`（inset、フォーカスで青）   | `BasicTextField(TextFieldState)` + 凹んだ罫線。フォーカスで `ieBlue`、背景 `#f8fafd`    |
| `RetroSelect`                  | `<select>`（inset）                | 凹んだ箱 + 「▾」。押すとレトロな枠の `DropdownMenu`                                     |
| `RetroCheckbox` / `RetroRadio` | 標準のチェックボックス・ラジオ     | 13dp の四角と丸。押せる範囲は 48dp                                                      |
| `RetroLink`                    | `[退室]` などの緑の下線リンク      | `text-green-700` の色と下線。押せる範囲は 48dp                                          |
| `RetroDivider`                 | `Divider`（上 2px 灰・下 1px 白）  | 2 本の線                                                                                |
| `RetroSplitter`                | `RetroSplitter`                    | §4.3.2                                                                                  |
| `LegacyAvatar`                 | `<img src=avatars/*.gif>`          | Coil の GIF。アニメーションを減らす設定では最初のコマ                                   |

- 各部品は `@Preview` と Roborazzi のテストを持つ（Web の各部品が Storybook のストーリーを持つのと同じ）
- 押せる範囲は `Modifier.minimumInteractiveComponentSize()` で広げ、見た目の大きさは Web のまま保つ（R14.5）

### 5.4 edge-to-edge と insets

- `enableEdgeToEdge()` を呼び、ステータスバーの裏まで各画面の背景色で塗る。背景が明るいので、システムバーのアイコンは
  暗い色にする
- 各画面は `WindowInsets.safeDrawing` を避けて部品を置く。ログのペインは下のナビゲーションバーの分だけ余白を足し、
  最後の行がジェスチャーの領域に隠れないようにする
- `windowSoftInputMode` は `adjustResize` 相当（insets で扱う）

### 5.5 文字の大きさ・押しやすさ・コントラスト

- 端末の文字の大きさ（非線形の拡大、200% まで）に従う。拡大しても発言フォームは折り返して全部の操作に届く
  （Web で入力欄に `min-w-0` / `max-w-full` を付けて SP ではみ出さないようにしたのと同じ考え）
- 灰色の時刻（`text-gray-400`）など、Web の配色でコントラストが足りないものは、Web の値のまま出し、アクセシビリティの
  確認（Task 3.7）で問題になったら Web と同時に直す（アプリだけ色を変えない）

### 5.6 Material との関係（Q8）

- レトロの部品で描けない「システムの面」（ダイアログ、スナックバー、ボトムシート、権限の説明）は stable の
  Material 3 を使い、`RetroColors` から作った明るい配色の `ColorScheme` を渡す。動的カラーは使わない
- 夜間の配色は作らない。端末がダークテーマでも、Web と同じ明るい配色で描く
- Material 3 Expressive は `material3` 1.5.0 が stable になったら、システムの面（ボトムシート・ダイアログ・
  読み込み中の表示）にだけ取り込む（tasks.md Phase 5）

### 5.7 動き

- 画面の移動は Navigation 3 の既定（予測型「戻る」を含む）。Web のドキュメント間 View Transitions に合わせ、
  部屋一覧と部屋の間はフェードにする
- 端末でアニメーションを切っていれば（`ANIMATOR_DURATION_SCALE` が 0）、移動・ランキングの開閉・GIF を止める

## 6. データ層

### 6.1 モデル

`core:model` に Web の `types.ts` と同じ形を持つ。JSON の名前は Web と同じ（`room_id`、`ip_masked`、`metadata` の
`fontStyle` など）にし、kotlinx.serialization で読む。未知の項目は無視し、無い項目は既定値にする（Web の
`normalizeMetadata` と同じ）。

```kotlin
@Immutable @Serializable
data class Chat(
  val uuid: String,
  @SerialName("room_id") val roomId: String? = null,
  val name: String,
  val color: String,
  val message: String,
  val time: Long,
  val system: Boolean = false,
  val email: String? = null,
  @SerialName("ip_masked") val ipMasked: String = "",
  val ua: String = "",
  val metadata: ChatMetadata? = null,
  @Transient val optimistic: Boolean = false,
  @Transient val clientTime: Long? = null,
)
```

一覧は `kotlinx.collections.immutable` の `PersistentList` で持つ（Compose が安定と見なし、差分だけ描く）。

### 6.2 RoomLogRepository（Web の Room_Log_Store）

規則は Web の `roomLogStore.ts` と同じにする（`docs/ARCHITECTURE.md` §6.2）。

| 契機                 | 処理                                                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 最初の購読           | Realtime を張ってから取得する（部屋は 10 件、全部屋まとめは 200 件）                                                     |
| Realtime の INSERT   | uuid で確定行に合流する（二分探索で挿入位置を探す）。取得中は、保存の応答や `clear` の書き換えと同じ列に発生順で記録する |
| 取得の完了           | 取得結果を正とし（拡張なら取得を始めたときの行と合流）、取得中に記録した新着と書き換えを発生順に適用し直す               |
| `connected` への遷移 | 取り直す                                                                                                                 |
| `expand(n)`          | 件数を増やして取得する（減らさない）                                                                                     |
| 最後の購読の解除     | 5 秒たってもまだ誰もいなければ止める（最後の状態は残し、次の購読ではすぐ出してから取り直す）                             |

- **純粋な reducer に分ける。** `RoomLogReducer.reduce(state, event): state` に上の規則を全部入れ、Repository は
  イベントを 1 本の列（`Channel`）に積んで 1 つずつ reducer に通すだけにする。JavaScript の 1 スレッドと同じく、
  イベントの順番が決まる
- `state` は `stateIn(scope, SharingStarted.WhileSubscribed(5_000), …)` で公開する。画面は
  `collectAsStateWithLifecycle` で読むので、アプリが裏に回ると購読が外れ、5 秒後に Realtime も閉じる（R8.3）
- 部屋ごとに 1 つの Repository を `RoomLogRepositoryRegistry` が持つ（Web の `getRoomLogStore(roomId)`）
- テストは Web の `roomLogStore.test.ts` の場面を Contracts のイベント列（§8）に書き出し、Kotlin でも同じ期待値を
  確かめる

### 6.3 楽観的表示と送信（ChatSender）

```text
send(message)
  ├ 1. 楽観的な発言を作る（uuid: temp-…、metadata.optimisticNonce: ランダム、optimistic: true）
  ├ 2. OptimisticLog に足す → UI は combine(repository.state, optimisticLog) で先頭に重ねる
  ├ 3. ChatApi.save（§7.1。操作 ID は全試行で共通、x-chat-attempt、5xx と通信の失敗だけ 1 秒 → 2 秒で最大 3 回）
  ├ 4a. 成功: 応答の行（色・metadata もサーバーの値）を repository.applySaved → extra があれば同じく合流
  │        → OptimisticLog から nonce で外す
  ├ 4b. 400: 再試行せず OptimisticLog から外し、コードに応じた文言（chat-options.json）を出す
  └ 4c. 5xx・通信: 3 回で諦めて外し、「発言を送信できませんでした。…」を出す
```

- 再送はサーバーが操作 ID で冪等にするので、アプリは「保存されたか分からない」場合を区別しなくてよい
  （同じ ID で送り直せば、保存済みなら 1 回目の行が返る）
- 重ね方は Web の `reduceOptimisticChat` と同じ（nonce が確定行にあれば重ねない。nonce が無い古いデータだけ
  `client_time` で比べる）。Contracts の例で両方をテストする
- 入退室も同じ流れで、楽観的な行は `server-messages.json` の文言で作り、`op` と `nonce` だけを送る
- 保存はアプリの寿命の CoroutineScope で走らせる。送信した直後に画面を離れても保存は続く（Web ではページを
  離れると止まる。アプリでは失わない方を選ぶ）
- User-Agent は `Mozilla/5.0 (Linux; Android <版>; K) OkirakuChatApp/<版>` にする。入室の発言の 2 行目に UA が
  公開で出るため、Chrome の UA 削減と同じく端末の機種を出さない

### 6.4 ChatSession とコマンド

Web の `useChatSession` と同じ分け方にする（部屋単位と全部屋まとめの違いも同じ）。送るものはすべて §7 の契約。

| 操作       | 送るもの                                                       | 画面                                                                           |
| ---------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| 入室       | こっそりでなければ `save-chat` の `op: "enter"`                | 保存を待たずに入室後の画面。失敗したら戻す（`reserved_name` などの文言）       |
| 退室       | `op: "exit"`                                                   | 先に入室前の画面へ戻してから送る                                               |
| 発言       | `op: "say"`（`system` は送らない）                             | 楽観的表示                                                                     |
| `おみくじ` | `op: "say"`。巫女の返事はサーバーが作り、応答の `extra` で届く | 自分の発言は楽観的表示。巫女は `extra` で即時（Realtime と uuid で重ならない） |
| `clear`    | RPC `clear_my_chats`（§7.2）                                   | 返った uuid をログから外す。全部屋まとめで空なら「削除対象の発言がありません」 |
| `look`     | `op: "say"`（受け手は INSERT で鳴らす）                        | 保存が終わったら自分の通知音                                                   |
| `unlook`   | 同上                                                           | 通知音を止める                                                                 |
| `cut`      | 何も送らない                                                   | 分析のイベントだけ                                                             |

訪問回数は Web の「タブのセッションごとに 1 回」に合わせ、プロセスの起動時と、裏に 30 分以上いてから前面に戻った
ときに 1 回数える。

### 6.5 参加者

Web の `getRecentParticipants` を `core:common` に写す（時刻を引数で受け取る純粋な関数）。名前のフィルタに当たる人は
ここで外す。入退室は、サーバーが `metadata` に書く `event` / `subject`（#197 で実装済み）で判定し、それが無い古い行
だけ Web と同じ正規表現（`adminMessage.ts`）で読む。

### 6.6 RealtimeHub

- 部屋ごとに `chats-postgres-<roomId>`（全部屋まとめは `chats-postgres-all`）の channel を 1 つ持ち、購読の参照数が
  0 になったら閉じる（Web の `postgresEntries`）。look / unlook も同じ channel の INSERT で受ける（Web も #198 で
  broadcast をやめた）
- Realtime は UPDATE を流さないので、`clear` で消えた行は `clear_my_chats` の戻り値で外す。ほかの人の `clear` は
  次の取り直しで消える（Web と同じ）
- 接続の状態を `connecting` / `connected` / `disconnected` で流し、RoomLogRepository が `connected` への遷移で
  取り直す
- supabase-kt の型は `core:network` の外に出さない。`RealtimeHub` のインターフェースだけを `core:data` に見せ、
  テストでは Fake に替える

### 6.7 端末に保存するもの（DataStore）

| 名前        | 中身                                                                 | バックアップ | 消去（R18.4） |
| ----------- | -------------------------------------------------------------------- | ------------ | ------------- |
| `settings`  | 名前、色、メール、アバター、訪問回数、今回・前回のログイン、音、計測 | 含めない     | 消す          |
| `consent`   | 同意した規約の版、18 歳以上の確認                                    | 含めない     | 消す          |
| `drafts`    | ちゃなりの部屋ごとの下書き                                           | 含めない     | 消す          |
| `filters`   | Filter_List（IP・名前・言葉。Web の `ipFilterStore` と同じ形）       | 含めない     | 消す          |
| `authorKey` | Author_Key（32 バイトの乱数の base64url、43 文字。§7.3）             | 含めない     | 作り直す      |

- ログは端末に保存しない（初版はメモリだけ。R18.3）。すぐに開きたい要望が強ければ、直近 100 件・24 時間の
  キャッシュを Phase 5 で検討する
- `data_extraction_rules.xml` / `full_backup_content` で上の全部をバックアップと端末間の移行から外す

### 6.8 通信

- PostgREST・Realtime・Edge Functions は `supabase-kt` を `core:network` の中で使う。anon key と URL は
  `BuildConfig` に入れる（Web の `VITE_*` と同じく公開値）
- 人数の RPC、通報、（将来の）ツーショットは Web と同じく SDK を通さず Ktor で直接呼べる
- 取得の再試行は Web の `retry.ts` と同じ（最大 3 回、1 秒 → 2 秒）。3 秒を超えた呼び出しは監視に記録する
- すべての要求に `x-client: android/<versionName>` を付け、サーバーが古い版を見分けられるようにする（§14）

## 7. サーバーの契約（R21）

PR #203（Issue #175〜#188）で、Web が持っていた規則は `save-chat` と DB に移った。アプリが呼ぶのは次の形で、
**アプリのためにサーバーを変えるところは §7.5 だけ**。規則の中身（上限の値・文言・運勢）は
`supabase/functions/save-chat/schema.ts` と `messages.ts` が正で、どちらも import を持たない TypeScript なので
Contracts（§8）の生成元にする。計画との違いは
[`docs/SERVER_SIDE_LOGIC_REFACTORING.md`](../../../docs/SERVER_SIDE_LOGIC_REFACTORING.md)「実施の結果」。

### 7.1 `save-chat`

```jsonc
// 発言（op を省くと say）
{ "op": "say", "room_id": "superbeginner", "name": "ゆい", "color": "#ff69b4",
  "message": "おみくじ", "email": null,
  "metadata": { "version": 1, "fontStyle": { "bold": true }, "avatar": "hoshi1", "optimisticNonce": "…" } }
// 入室（こっそりのときは呼ばない）
{ "op": "enter", "room_id": "superbeginner", "name": "ゆい", "color": "#ff69b4",
  "visit_count": 49, "last_login": 1735806900000, "nonce": "…" }
// 退室
{ "op": "exit", "room_id": "superbeginner", "name": "ゆい", "color": "#ff69b4", "nonce": "…" }
```

| 項目     | 契約                                                                                                                                                                                 |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| ヘッダ   | `x-chat-operation-id`（送信操作ごとの UUID。全試行で同じ）、`x-chat-attempt`（1〜9）、`x-chat-author-key`（§7.3）、`traceparent`、`x-client`（§7.5）                                 |
| 入力     | 名前は前後の空白を除いて 1〜24 コードポイント・制御文字なし・予約名でない。発言は 1〜120 grapheme（かつ 2000 コードポイント以内）。メールは 64 以内。`system`・`ip`・`ua` は読まない |
| 色       | `#rgb`・`#rrggbb`・CSS の色名は小文字にして保存、それ以外は拒否せず `#ff69b4`                                                                                                        |
| metadata | `version: 1`・`fontStyle`（`fontSize` 1〜5、`fontColor` 15 色、`bold`）・`avatar`（13 種）・`optimisticNonce`（64 以内）だけに作り直す。ほかは落とす（拒否しない）                   |
| 応答 200 | 保存した行（`uuid`・`room_id`・`time`・`ip_masked`・`ua`・`name`・`color`・`message`・`system`・`metadata`）。おみくじなら巫女の行を `extra` に入れる                                |
| 応答 400 | `{ "error": { "code": … } }`。`invalid_room_id`・`invalid_name`・`reserved_name`・`invalid_message`・`invalid_email`・`invalid_op`・`invalid_json`。**再試行しない**                 |
| 応答 5xx | 本文は形を約束しない。1 秒 → 2 秒で最大 3 回再試行する                                                                                                                               |
| 冪等     | 同じ `x-chat-operation-id` の 2 回目以降は新しく入れず、1 回目の行を返す（24 時間）。保存の直後に通信が切れて再送しても二重にならない                                                |
| 入退室   | 文言と metadata（`kind: "admin"`、名前「管理人」、`hoshi1`、`userColor`、`event`、`subject`、`visitCount`、`lastLogin`）はサーバーが作る。`nonce` は本文の最上位に置く               |

- アプリは**応答の行で楽観的な行を確定する**（色と metadata もサーバーが直した値にする。Web の `saveChatWithRetry` と同じ）
- 入退室の楽観的な行は、`messages.ts` の `enterMessage` / `exitMessage` と同じ文言で作る（Contracts の
  `server-messages.json`）。保存される内容はサーバーが決め、`nonce` で突き合わせる

### 7.2 `clear_my_chats`

`POST /rest/v1/rpc/clear_my_chats { p_room_id, p_name, p_author_key }` → 消した行の uuid の配列。

- 書いた端末の鍵・部屋・名前が一致し、まだ消していない行だけを消す。鍵の無い移行前の発言、別の端末で書いた発言は消えない
- アプリは返った uuid を手元のログから外す（Realtime は UPDATE を流さないため）。全部屋まとめで空なら
  「削除対象の発言がありません」
- anon の `UPDATE` は閉じたので、PostgREST の PATCH の経路は無い

### 7.3 Author_Key

- 32 バイトの乱数を base64url（パディングなし、43 文字）にしたもの。サーバーは `^[A-Za-z0-9_-]{43}$` に合わない鍵を
  黙って捨てる（保存は成功するが、その発言は後で消せない）。**形を Contracts の fixtures で縛る**
- DataStore に持ち、バックアップから外す（§6.7）。アプリを消す・データを消すと、それより前の発言は消せなくなる。
  [消す] の説明の文言は Web と同じにする

### 7.4 読むもの

| 用途       | 経路                                                                                              |
| ---------- | ------------------------------------------------------------------------------------------------- |
| ログ       | `GET chats`（`deleted=eq.false`、`uuid` 降順）。全部屋まとめは `deleted` を問わない（Web と同じ） |
| 新着・look | Realtime `chats-postgres-<roomId>` / `chats-postgres-all` の INSERT。`ip` は届かない（#190）      |
| 部屋       | `rooms`（`id`・`category`）。アプリは Contracts の一覧を正にし、`rooms` は CI の照合だけに使う    |
| 人数       | RPC `room_participant_counts`                                                                     |
| ランキング | `chat_ranking` ビュー                                                                             |

### 7.5 アプリのために残るサーバーの作業（Phase 0）

| 作業                       | 内容                                                                                                                                                              |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 通報（R21.4）              | 表 `chat_reports` と Edge Function `report-chat`。§7.6                                                                                                            |
| `x-client` の記録（R21.7） | `save-chat` がスパンの属性 `client.app` に記録する。CORS は要求されたヘッダをそのまま許すので変更は要らない                                                       |
| Contracts の生成（R21.5）  | `yui-chat-ts` の `scripts/export-contracts.ts` と `contracts/`（§8）。アプリの Task 1.2 の前提                                                                    |
| 削除済みの発言（Q13・D1）  | **決定済み: 隠さない**（2026-10-11）。`public-select` は `USING (true)` のまま。[消す] の説明は「表示から消す（内容はサーバーに残る）」にそろえる（Web とアプリ） |
| 退室の偽装（R21.8）        | **決定済み: 受け入れる**（2026-10-11）。`op: exit` は名前を確かめない（本人確認の無い匿名チャットとして、入室と同じ扱い）。サーバーは変えない                     |
| 制約の `VALIDATE`          | `chats_*_check` と `chats_room_id_fkey`（`NOT VALID`）。アプリとは独立だが、Phase 0 の締めでまとめて片付ける                                                      |
| 公開するページ（§7.7）     | `/terms/`・`/privacy/`・`/safety/`                                                                                                                                |
| `assetlinks.json`（§7.8）  | 配信の設定                                                                                                                                                        |

### 7.6 通報

- 表 `chat_reports`: `id`（uuid v7）、`chat_uuid`、`room_id`、`reason`、`detail`（500 文字）、`snapshot`
  （通報の時点の名前・本文・時刻・マスク済み IP。後で `clear` されても残す）、`reporter_author_key_hash`、`ip`、`ua`、
  `created_at`、`status`（`open` / `reviewing` / `resolved` / `rejected`）、`handled_at`、`handled_note`。
  RLS を有効にしてポリシーを作らず、`service_role` だけが読み書きする
- 鍵のハッシュは `insert_chat` と同じ `author_key_hash()` を使う（形の合わない鍵は NULL）
- Edge Function `report-chat`（`verify_jwt = false`）: 入力の検証は `save-chat` と同じく依存の無い `schema.ts` に置き、
  エラーは `{ "error": { "code" } }` の形にそろえる。同じ IP と同じ author key からの通報を 1 時間に 10 件までにする。
  児童の安全に関わる理由は、New Relic のイベントからアラートを出し、PagerDuty で運営に知らせる。それ以外は運営が毎日確かめる
- 通報の本文と対象の発言は公開の GitHub Issue に載せない（`save-chat` の triage とは別の経路にする）
- Web にも同じ通報の導線を足す（成長戦略 §7.1 の P0。アプリだけに通報があるのは不自然なため）

### 7.7 公開するページ

`/terms/`（利用規約）、`/privacy/`（プライバシーポリシー。外部送信の公表を含む）、`/safety/`（安全ガイド。CSAE を
禁じる基準、通報の方法、対応の流れ、相談先）を Web に足し、トップのフッターとアプリからリンクする。文面は運営が書き、
版と URL を `contracts/legal.json` に置く。

### 7.8 `assetlinks.json`（R16）

- `public/.well-known/assetlinks.json` にアプリの署名証明書（Play App Signing の鍵）の SHA-256 を載せる
- `gh-pages` は既定でドットファイルを公開しないので、`deploy` を `gh-pages -d dist --dotfiles` にし、`public/.nojekyll`
  を置く。公開後に `curl https://www.okiraku.chat/.well-known/assetlinks.json` と
  `adb shell pm get-app-links chat.okiraku.app` で確かめる

## 8. Contracts

`scripts/export-contracts.ts`（既存の `generate-sitemap.ts` と同じく `node --experimental-strip-types` で動かす）が
Web とサーバーのソースから生成する。生成物はリポジトリに入れる。規則の多くがサーバーへ移ったので、Contracts の
役目は「**画面に要る値**」と「**クライアントに残った規則の期待値**」の 2 つになった。

```text
contracts/
├── README.md
├── rooms.json            # rooms.ts: id、title、description、category、appScope（"all" | "web-only"）
├── directory.json        # top/data.ts の chatDirectoryGroups（見出し・補足・色・部屋 ID）
├── theme.json            # theme.css の色と書体の並び
├── chat-options.json     # schema.ts: 上限（名前 24・発言 120・メール 64）、FONT_SIZES、FONT_COLOR_NAMES、AVATAR_IDS、
│                         #   エラーのコードと画面の文言（saveChat.ts の INPUT_ERROR_MESSAGES）。ログ行数（windowRows.ts）
├── server-messages.json  # messages.ts: 入退室の文言の型、ADMIN_* / FORTUNE_* の名前・色・アバター
├── legal.json            # 規約の版と URL
└── fixtures/
    ├── chat-rows/          # PostgREST の行 → 期待する表示（日時の文字列、管理人の分割、参加者）
    ├── room-log-events/    # Room_Log_Store のイベント列 → 期待する並び
    ├── optimistic/         # 保存中の発言と確定行 → 期待する重ね方
    ├── filters/            # Filter_List と行 → 隠れる行（ipFilter.ts）
    ├── author-key/         # 鍵の形（合う・合わない）
    └── save-chat/          # 要求と応答（§7.1。handler.test.ts の場面から）
```

- 運勢の 12 通りは**持たない**（サーバーだけが使う）
- `appScope` は `rooms.ts` に `appScope` を足して持つ（Q2: `elementary`・`juniorhighschool`・`juniorhighschool3`・
  `highschool`・`10generations`・`2shot` を `web-only`）。Web の動きは変えない。`rooms` 表には足さない（アプリの
  表示の都合で、サーバーの規則ではないため）
- Vitest（`src/test/contracts.test.ts`）が、生成し直した結果とリポジトリの中身が同じことと、fixtures を Web の関数に
  通して期待値になることを確かめる。`fixtures/save-chat/` は Deno の `handler.test.ts` でも読み、サーバーの応答が
  fixtures と同じことを確かめる。Android は Gradle のタスクで JSON から Kotlin を生成し、JUnit で同じ fixtures を通す
- `schema.ts`・`messages.ts`・`rooms.ts`・`types.ts`・`windowRows.ts` などを変えたのに `contracts/` を生成し直して
  いなければ、Web の CI が落ちる。`contracts/` が変わると Android の CI も走る（§12）

### 8.1 `okiraku-android` への写し

- `yui-chat-ts` の `contracts/` が正。`okiraku-android` は `scripts/sync-contracts.sh ../yui-chat-ts` で丸ごと写し、
  写したコミットを `contracts/UPSTREAM` に書く。写しを手で直さない
- `core:contracts` は写しの JSON をビルドのときに読み、Kotlin の定数（部屋、選択肢、上限、エラーの文言、入退室の文言）を
  生成する。fixtures は `core:testing` がテストのリソースとして読む
- 写しが古いと `contracts-drift`（§12）が Issue を開く。互換の無い変更（キーの削除・意味の変更）は `contracts/README.md`
  の版を上げ、アプリは知らない版を読んだらビルドを落とす

## 9. 計測と監視（R17）

- GA4 の同じプロパティに Android のデータストリームを足し、Firebase Analytics で `analytics.ts` と同じイベント名と
  パラメータを送る。イベントの型は Kotlin の sealed class に写し、送ってよい項目だけを持たせる（本文・名前・メール・
  URL を型の上で持てないようにする）
- New Relic Android agent で HTTP・クラッシュ・ANR を集める。OkHttp の計装が W3C `traceparent` を付けるので、
  `save-chat` のトレース（observability-new-relic）とつながる。`x-chat-operation-id` は Web と同じく送信の操作ごとに
  発行する
- 設定で「計測を送る」を切ると、Firebase Analytics の収集と New Relic の送信を止める

## 10. セキュリティとプライバシー（R18）

| 項目           | 対応                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------- |
| 秘密の値       | アプリに入れるのは anon key と URL だけ（Web と同じ公開値）。service role key は入れない |
| 通信           | HTTPS / WSS のみ（cleartext を許さない）                                                 |
| IP / UA        | 送らない。表示は `ip_masked`。UA は機種を出さない形（§6.3）                              |
| 端末の保存     | DataStore。バックアップと端末間の移行から外す。ログは保存しない                          |
| Author_Key     | 乱数 32 バイト。サーバーはハッシュだけを、Realtime に流れない表（`chat_authors`）に持つ  |
| リンク         | Custom Tabs で開く。本文から作るリンクは `http` / `https` / `mailto` だけ                |
| 難読化         | R8（full mode）                                                                          |
| 年齢           | Play の Restrict Minor Access + アプリ内の確認（§4.1）                                   |
| Play Integrity | 使わない。同じ API を Web が無認証で使うため、アプリだけ確かめても防げない               |

**確かめたこと**: Realtime の `postgres_changes` の INSERT のペイロードに `ip` は含まれない（#190 で実測し、CI で
毎回確かめている）。`email` と `ua` は含まれる（Web と同じく公開の値として扱う）。

## 11. テスト戦略（R20）

### 11.1 Web_Oracle との比較

- 画面の状態（入室前、入室後、管理人の発言、look、おみくじ、ランキング、読み込み失敗、1000 行、ちゃなり）ごとに、
  Storybook のストーリーと同じデータを Compose の `@Preview` に渡し、Roborazzi で撮る
- 同じ状態を Web_Oracle（Storybook）で、幅 412 CSS px（Compact）と 1280 CSS px（Expanded）で撮り、並べたページを
  作って見比べる。見るのは部品の並び・文言・色・罫線・ログの向き。字形の細部とアンチエイリアスは比べない
- 比べた結果は tasks.md の各 Task の完了の記録に残す（two-shot-chat の Oracle と同じやり方）

### 11.2 単体テスト（JVM、PR ごと）

- `RoomLogReducer`、楽観的表示、参加者、日時の表記、URL の分割、入力の検証、管理人の分割を、Contracts の fixtures で
  テストする
- ログの性質（並びが常に uuid の降順、同じ uuid が 2 回出ない、取得中の新着を失わない）を、任意のイベント列で
  kotest-property で確かめる（Web の `aggregatedLog.test.ts` が fast-check で行っているのと同じやり方）
- ViewModel は Fake の `ChatApi` / `RealtimeHub` と Turbine で、状態の流れを確かめる
- テストの名前は日本語にする（リポジトリの方針）

### 11.3 画面のテスト（Robolectric + Compose UI Test、PR ごと）

- 入室の検証、発言で発言欄が空になること、ほかの人の発言でフォーカスが動かないこと、ランキングから戻ってもスクロール
  位置が残ること、長押しから 2 操作で通報に届くこと、ダブルタップした場所でフィルタの種類が決まり、フィルタした行が切り出しの前に消えること
- 押せる範囲が 48dp 以上であること、支援技術の名前（Web の `aria-label` と同じ文言）が付いていること

### 11.4 Web とアプリの相互の確認

- ローカルの Supabase（`supabase start` + `supabase functions serve`）に、アプリの `ChatApi` で発言し、PostgREST で
  読み返した行が、Web の `saveChat.ts` で保存した行と同じ形であることを確かめる（JVM のテスト、専用の CI）
- 同じテストで §7 の契約を確かめる: 同じ操作 ID の再送で行が増えないこと、`reserved_name` などの 400 で再試行しないこと、
  おみくじの `extra`、別の Author_Key では `clear_my_chats` が空を返すこと、アプリの鍵で Web と同じく消せること
- 手動: 実機のアプリと Web で同じ部屋に入り、入退室・発言・look・おみくじ・clear・通報を交互に行う

### 11.5 性能

Macrobenchmark で、冷えた起動、ホームのスクロール、部屋を開く、1000 行のログのスクロールを測る。実機か Gradle
Managed Device で、PR ごとではなく週に 1 回と公開の前に走らせる。

## 12. CI/CD とリリース（R20.4 / R24）

- `okiraku-android` の `.github/workflows/ci.yml`: すべての PR で、JDK 21 と `gradle/actions/setup-gradle` の
  キャッシュを使って次を走らせる: `spotlessCheck`・`detekt`・`lint`・`test`・`verifyRoborazziDebug`・`assembleRelease`
- `okiraku-android` の `.github/workflows/contracts-drift.yml`（毎日と手動）: `isrnao/yui-chat-ts` の `main` の
  `contracts/` と、写した `contracts/`（`UPSTREAM`）を比べ、違えば Issue を開く。Web の変更がアプリを黙って壊さない
  ようにするため（§14）
- `yui-chat-ts` 側: `src/test/contracts.test.ts` が生成物の古さを落とす（§8）。`contracts/` を変える PR は、
  `okiraku-android` で `scripts/sync-contracts.sh` を走らせる PR と対にする（CLAUDE.md に書く）
- `.github/workflows/release.yml`（手動）: 署名した App Bundle を作り、Play の内部テストのトラックに上げる。
  アップロード鍵と Play のサービスアカウントは GitHub Actions の Secrets に置く
- versionCode は CI の実行番号、versionName は semver
- 公開の流れ: 内部テスト → クローズドテスト（12 人以上・14 日間）→ 本番の段階的な公開（10% → 50% → 100%）。
  Android vitals のクラッシュ率と ANR 率が Play の閾値を超えたら止める

## 13. 性能の目標（R19）

| 指標                          | 目標                          | 測り方                               |
| ----------------------------- | ----------------------------- | ------------------------------------ |
| 冷えた起動 → 部屋一覧         | 中央値 1.5 秒以内（中位機種） | Macrobenchmark `StartupTimingMetric` |
| 1000 行のログのスクロール     | 遅れたフレーム 1% 未満        | Macrobenchmark `FrameTimingMetric`   |
| 発言 → 自分の発言がログに出る | 100ms 以内                    | 計装したテスト                       |
| ダウンロードの大きさ          | 15MB 以内（フォント込み）     | Play Console                         |

起動を軽くするため、Firebase と New Relic と Supabase のクライアントは最初に使うときに作る。Baseline Profile は
起動・ホーム・部屋・ログのスクロールの道筋で生成する。

## 14. リスクと対策

| リスク                                          | 対策                                                                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Play の審査で匿名チャットとして拒否される       | 18 歳以上、Restrict Minor Access、Safety_Kit、未成年を想定した部屋を出さない、ツーショットを出さない                                                                                              |
| 通報に人が対応できない                          | 公開の前に運用の手順と初動の時間を決め、テストの通報で確かめる（Gate 2）。対応できないなら公開しない                                                                                              |
| Web とアプリで規則がずれる                      | 規則はサーバーが正（§7、PR #203 で済）。残りは Contracts と CI（§8）                                                                                                                              |
| Web の変更がアプリを壊す（`metadata` の形など） | Contracts の生成を Web の CI で必須にし、`okiraku-android` の `contracts-drift` が毎日 `yui-chat-ts` と比べる（§12）。CLAUDE.md に書く                                                            |
| サーバーの変更に古いアプリが追いつかない        | `x-client` で版を見分け、互換を保てない変更は In-App Updates の即時更新で古い版を止める。Web は閉塞中の一括配信で済んだが、アプリは古い版が残るので、`save-chat` の変更は「足してから外す」に戻す |
| `supabase-kt` の保守が止まる・大きく変わる      | `core:network` の中に閉じ込める。PostgREST と Functions は Ktor で直接呼べる                                                                                                                      |
| 削除済みの発言が API から読める                 | 受け入れる（Q13）。[消す] の説明で「表示から消す」と示し、運営の削除（通報の対応）は別に行う                                                                                                      |
| 他人の名前で退室の発言を出せる                  | 受け入れる（R21.8）。荒らしに使われたら、言葉・名前のフィルタと通報で扱う                                                                                                                         |
| レトロの見た目とアクセシビリティがぶつかる      | 見た目の比率は保ち、文字の拡大と押せる範囲は Android に従う（§5.5）                                                                                                                               |
| 成長戦略の「今はしない」と合わない              | Gate 1 / Gate 2 で指標と準備を見て決め直す（research.md §3）                                                                                                                                      |
| ツーショットや部屋の名前が日本の法令に触れる    | Phase 0 で法務の確認をしてから範囲を決める                                                                                                                                                        |

## 15. 検討したが採らなかった案

| 案                                               | 採らなかった理由                                                                                                                                                                        |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| TWA（Web をそのまま包む）                        | 最も安く見た目も同じになるが、依頼の「ネイティブ」に当たらず、戻る・キーボード・insets・大画面は Web 任せになる。需要を測るだけなら、PWA の manifest とホーム画面への追加で測る方が安い |
| React Native / Expo                              | TypeScript の hooks とストアは流用できるが、画面は DOM と Tailwind なので結局作り直す。Android の作法（Navigation 3、Scene）からも離れる。iOS も同時に要るなら再検討する                |
| Capacitor などの WebView                         | Play の「最低限の機能」に触れるおそれがあり、ネイティブの操作感にもならない                                                                                                             |
| Flutter                                          | 新しい言語で、流用できるものが無い。Android の設計の作法から離れる                                                                                                                      |
| Material 3 に合わせて見た目を作り直す            | Web と同じ見た目という要件に反する。Web の利用者と同じ部屋で話すので、見た目の違いは混乱を招く                                                                                          |
| ログを新しい発言が下に来る向きにする             | 今のチャットアプリの作法だが、Web と逆になり、同じ部屋の Web の利用者との会話で「上」「下」が通じなくなる。入力が上にあるので、新しい発言が上にある方が目の動きも短い                   |
| foreground service で裏でも接続を保つ            | Android 14 以降の型に合う用途が無く、電池も使う。戻ったときに取り直せば足りる                                                                                                           |
| 発言者ごとの不透明な ID を公開してブロックに使う | 名前を変えても同じ人と分かるので、匿名のチャットの性質を変え、発言の名寄せにも使えてしまう。Web と同じく伏せ字の IP・名前・言葉で隠す（Q12）                                            |
| 名前だけのブロック（改訂前の案）                 | Web に IP・名前・言葉のフィルタが入ったので、アプリだけ違う規則にすると、同じ人が Web とアプリで違って見える                                                                            |
| 規則を Kotlin にも書いて二重に持つ               | PR #203 でサーバーが正になった。書き写すとずれたときにアプリだけ拒否される                                                                                                              |
| オフラインで mock のログを見せる（Web と同じ）   | 本物の会話と見分けがつかず、アプリでは誤解を招く。取得済みのログとつながっていない表示で足りる                                                                                          |
| ログを Room に全部保存するオフライン優先         | Web はキャッシュを持たず、チャットの価値は「今」の会話にある。まずはメモリだけにし、必要なら直近だけ保存する                                                                            |
| Play Integrity で API を守る                     | 同じ API を Web が無認証で使うので、アプリだけ確かめても効かない                                                                                                                        |
