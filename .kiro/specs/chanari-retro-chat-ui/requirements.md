# Requirements Document

## Introduction

本機能 (chanari-retro-chat-ui) は、既存の `src/features/chat/` チャット UI とは独立した「もう 1 つの UI」を新規に追加し、2012 年当時の chanari.com「なりきりチャット」の入室前フォーム (f4 / `id="main2"`) と入室後フォーム (f1 / `id="main"`) をピクセルに近いレベルで再現することを目的とする。

バックエンド層 (Supabase 連携、Realtime、`chatApi`、`rooms.ts`、`types.ts`) と共有フック (`useChatLog`, `useParticipants`, `useChatHandlers`, `useLookSound`, `useSettings`) に加え、**既存ログ関連コンポーネント (`ChatLogList`, `ChatMessage`, `ParticipantsList`, `Divider`, `RetroSplitter`) も無編集で再利用する**。本機能で新規に作るのは「チャット画面の上部」（`ChanariTopHeader` + 入室前フォーム `ChanariEntryForm` / 入室後フォーム `ChanariChatRoom`）だけで、下部（チャットログ表示）は既存 `ChatLogList` を `RetroSplitter` の bottom slot にそのまま流す。

エフェクト select（27 種）、文字サイズ select（21 種）、エフェクト無効、AT フィールドは、**UI 上には残すが本実装ではどこの描画にも接続しない**。これは「既存 `ChatLogList` / `ChatMessage` を無編集で再利用する」というハード制約と最も素直に整合する選択である。select の `<option>` 描画のため `EFFECT_OPTIONS` / `FONT_SIZE_OPTIONS` 定数だけ用意し、`effectToStyle` / `fontSizeToStyle` のような CSS 変換関数は本 spec では実装しない（呼び出し箇所が無いため）。文字数カウンタ、発言復元、カラーピッカー、リロード秒数、ログ消去、更新、退室は既存フック (`useChatHandlers` / `useChatLog`) と既存 `chatApi` を呼ぶ形で**有効に機能する**。

ルーティングは新たに `/chanari/:roomId` を追加し、既存 `/chat/:roomId` は無変更で維持する。これにより新旧 UI は完全に共存し、既存 `features/chat` の動作・UI は一切変更されない。Supabase スキーマに列追加は行わない。

## Glossary

- **Chanari_App**: 本機能 (chanari-retro-chat-ui) によって追加される新 UI レイヤー全体 (`src/features/chanari-chat/`)。チャット画面の「上部」だけを chanari 独自マークアップで、「下部」は既存 `ChatLogList` を再利用する。
- **Legacy_Chat_UI**: 既存の `src/features/chat/` が提供する現行チャット UI。本機能では一切変更を加えない。
- **Chanari_Router**: `src/features/chanari-chat/routing.ts` に追加される新ルーティング (`matchChanariRoute`, `buildChanariRoomPath`)。既存 `matchRoute` とは独立。
- **Chanari_Page**: `ChanariChatPage` コンポーネント。新 UI のページ全体コンテナ。`RetroSplitter` で画面を上下に割り、上を chanari 専用、下を既存 `ChatLogList` にする。
- **Chanari_Top_Header**: `ChanariTopHeader` コンポーネント。2012 年版 HTML の `#chat-topheader` と `#header` を再現する。
- **Chanari_Entry_Form**: `ChanariEntryForm` コンポーネント。入室前フォーム (`<form name="f4" id="main2">` 相当)。
- **Chanari_Chat_Room**: `ChanariChatRoom` コンポーネント。入室後フォーム (`<form name="f1" id="main">` 相当)。
- **Shared_Chat_Log_List**: 既存 `src/features/chat/components/ChatLogList/` コンポーネント。本機能では **無編集で** `RetroSplitter` の bottom slot に再利用する。
- **Shared_Retro_Splitter**: 既存 `src/features/chat/components/RetroSplitter/` コンポーネント。本機能の `Chanari_Page` で上下分割に利用する。
- **Chanari_Color_Picker**: `ChanariColorPicker` コンポーネント。rainbow.png アイコン経由の `<input type="color">`。
- **Chanari_Char_Counter**: `ChanariCharCounter` コンポーネント。`#wdcnt` / `#wderr` 相当の文字数カウンタ表示。
- **Char_Counter**: `countChars` 純関数。grapheme 単位での文字数を返す。
- **Color_Normalizer**: `normalizeColorCode` 純関数。色文字列を `#rrggbb` 形式に正規化する。
- **Draft_Store**: `saveDraft` / `loadDraft` ユーティリティ。`localStorage` 経由で発言復元用 draft を保存／読込する。
- **Reload_Interval_Hook**: `useReloadInterval` フック。リロード秒数 select に連動して `handleReload` を定期実行する。
- **Chanari_Settings_Hook**: `useChanariSettings` フック。name / nameColor / speechColor / lastMessage を `localStorage` から読み書きする。
- **Shared_Chat_Handlers**: 既存 `useChatHandlers` が返す `handleEnter` / `handleExit` / `handleSend` / `handleReload`。本機能ではこれらを**無変更で**流用する。
- **Chanari_Scope**: 新 UI の top 領域ルート `<div>` に付ける `className="chanari-scope"`。`chanari.css` の ID セレクタはすべてこの class の配下にスコープされる。bottom 領域（`ChatLogList`）は包まない。
- **Rainbow_Icon**: `public/chanari/rainbow.png` に配置されるカラーピッカー用虹アイコン画像。
- **EffectId**: エフェクト select の識別子型。`EFFECT_OPTIONS` で定義された 27 種のいずれか。本機能では `<option>` 描画のみに使用。
- **LegacyFontSize**: 文字サイズ select の識別子型。`FONT_SIZE_OPTIONS` で定義された 21 種のいずれか。本機能では `<option>` 描画のみに使用。
- **ReloadSeconds**: リロード秒数の型。`RELOAD_SECONDS_OPTIONS` (`2,3,4,5,6,7,8,9,10,20,30,45,60,95,120`) のいずれか。
- **RoomId**: `src/features/chat/rooms.ts` で定義された既存のルーム ID 型。本機能は無変更で流用する。
- **Chat**: `src/features/chat/types.ts` で定義された既存のチャットメッセージ型。本機能は無変更で流用する。

## Requirements

### Requirement 1: 新ルーティング `/chanari/:roomId` の追加と既存ルーティングの保全

**User Story:** 利用者として、既存 `/chat/:roomId` URL と並行して `/chanari/:roomId` でも同じルームにアクセスできるようにしたい。新旧 UI を URL で明確に切り替えられるようにするため。

#### Acceptance Criteria

1. WHEN ブラウザが `/chanari/<有効な RoomId>` パスにアクセスする, THE Chanari_Router SHALL `{ type: 'chanari-room', roomId }` を返し、THE Chanari_App SHALL `Chanari_Page` を描画する
2. WHEN ブラウザが `/chanari` (roomId なし) にアクセスする, THE Chanari_Router SHALL `{ type: 'redirect', to: buildChanariRoomPath(DEFAULT_ROOM_ID) }` を返す
3. WHEN ブラウザが `/chanari/<無効な roomId>` にアクセスする, THE Chanari_Router SHALL `null` を返す
4. WHEN Chanari_Router が `null` を返す, THE Chanari_App SHALL 既存 `matchRoute` に委譲し、最終的に適切なページ (既存 `TopPage` / `ChatPage` / `NotFoundPage`) が描画される
5. WHEN ブラウザが `/` または `/chat/:roomId` にアクセスする, THE Chanari_App SHALL 既存 `matchRoute` の結果のみを用いて既存 `TopPage` または `ChatPage` を描画し、Chanari_App による干渉は発生しない
6. THE `matchChanariRoute` 関数 SHALL `import.meta.env.BASE_URL` の prefix を考慮してパスを解釈する
7. THE `buildChanariRoomPath(roomId)` 関数 SHALL BASE_URL prefix 付きで `/chanari/<roomId>` 形式の文字列を返す
8. IF `matchChanariRoute` へ渡された文字列が `/chanari` プレフィックスを含まない, THEN THE `matchChanariRoute` 関数 SHALL `null` を返す
9. THE Chanari_Router SHALL 既存 `isEnabledRoomId` 関数を再利用して roomId のホワイトリスト検証を行い、独自にホワイトリストを複製しない

### Requirement 2: 既存 `features/chat` UI の後方互換性保全

**User Story:** 既存利用者として、自分が使っている `/chat/:roomId` の UI と挙動が、本機能の追加によって一切変わらないことを保証してほしい。既存の利用体験を壊さないため。

#### Acceptance Criteria

1. THE Chanari_App SHALL `src/features/chat/components/**` 配下のコンポーネントファイルを編集しない
2. THE Chanari_App SHALL 既存共有フック (`useChatLog`, `useParticipants`, `useChatHandlers`, `useLookSound`, `useSettings`) の Props / 戻り値の shape を変更しない
3. THE Chanari_App SHALL 既存 `src/features/chat/routing.ts` (`matchRoute`, `buildChatRoomPath`) を編集しない
4. THE Chanari_App SHALL 既存 `src/features/chat/rooms.ts` および `src/features/chat/types.ts` を編集しない
5. THE Chanari_App SHALL 既存 `src/features/chat/api/chatApi.ts` の関数シグネチャを変更しない
6. WHEN `/chat/<RoomId>` に直接アクセスする, THE Legacy_Chat_UI SHALL 本機能追加前と同一の DOM 構造・同一のスタイルで描画される
7. THE Chanari_App SHALL Supabase の `chats` テーブルに新たな列を追加しない
8. THE Chanari_App SHALL 既存 `ChatMetadata` 型のフィールドを追加・削除・変更しない

### Requirement 3: `ChanariTopHeader` による 2012 年版ヘッダー再現

**User Story:** 利用者として、入室前／入室後いずれでも、2012 年版 chanari.com なりきりチャットと同等のヘッダー（戻りリンク・ヘルプリンク・タイトル・紹介文）を見たい。当時の雰囲気を忠実に再現するため。

#### Acceptance Criteria

1. THE Chanari_Top_Header SHALL `<div id="chat-topheader">` 要素を描画し、その中に `#chat-topheader-left` と `#chat-topheader-right` の 2 つの子 `<div>` を含める
2. THE Chanari_Top_Header SHALL `#chat-topheader-left` 内に `backHref` プロパティを `href` とする「なりりきりチャにもどる」アンカーを描画する
3. WHERE `sloganLabel` プロパティが指定される, THE Chanari_Top_Header SHALL `#chat-topheader-left` 内に当該文字列を描画する
4. THE Chanari_Top_Header SHALL `#chat-topheader-right` 内に `helpHref` プロパティを `href` とする「ヘルプ」アンカーを描画する
5. THE Chanari_Top_Header SHALL ヘルプアンカーに `target="_blank"` と `rel="noreferrer noopener"` 属性を付与する
6. THE Chanari_Top_Header SHALL `<div id="header">` 要素を描画し、その中に `<h1 id="ctitle">{title}</h1>` と `<p id="desc">{description}</p>` を含める
7. THE Chanari_Top_Header SHALL 自身のルート要素に `clearfix` 相当のクラスを付与し、2012 年版の左右フロートレイアウトを再現する

### Requirement 4: `ChanariEntryForm` による入室前フォーム (f4 / id="main2") の再現

**User Story:** 利用者として、2012 年版の入室前フォームと同じ見た目（おなまえ入力、名前色・発言色のカラーピッカー、参加ボタン）で入室したい。当時の入室体験を再現するため。

#### Acceptance Criteria

1. THE Chanari_Entry_Form SHALL ルート要素として `<form name="f4" id="main2">` を描画し、`Chanari_Scope` の配下に配置する
2. THE Chanari_Entry_Form SHALL 隠し `<input type="hidden" name="sid">` を描画し、その `value` に `sid` プロパティを渡す
3. THE Chanari_Entry_Form SHALL おなまえ用 `<input type="text" size="10" maxLength="20">` を描画し、value は `name` プロパティと双方向バインドする
4. THE Chanari_Entry_Form SHALL 名前色用 `<input type="text">` と `Chanari_Color_Picker` を並べて描画し、value は `nameColor` プロパティと連動する
5. THE Chanari_Entry_Form SHALL 発言色用 `<input type="text">` と `Chanari_Color_Picker` を並べて描画し、value は `speechColor` プロパティと連動する
6. THE Chanari_Entry_Form SHALL 「チャットに参加する」ボタンを `<input type="submit">` として描画する
7. WHEN 利用者が「チャットに参加する」ボタンを押下する, THE Chanari_Entry_Form SHALL `event.preventDefault()` を実行した上で `onEnter({ name, nameColor, speechColor })` を呼ぶ
8. IF `name.trim() === ''`, THEN THE Chanari_Entry_Form SHALL `onEnter` を呼ばない
9. THE Chanari_Entry_Form SHALL 内部で Shared_Chat_Handlers の `handleEnter` を `handleEnter({ name, color: nameColor, email: '', silent: false })` の形で呼び出す
10. WHERE `isPending === true`, THE Chanari_Entry_Form SHALL 参加ボタンを `disabled` にする
11. WHERE `error` プロパティが非空文字列, THE Chanari_Entry_Form SHALL エラーメッセージを表示する

### Requirement 5: `ChanariChatRoom` による入室後フォーム (f1 / id="main") の再現

**User Story:** 利用者として、2012 年版の入室後フォームと同じ要素（リロード秒数・色設定・エフェクト・文字サイズ・エフェクト無効・発言入力・文字数カウンタ・各種ボタン群）を、同じ順序・同じ配置で操作したい。当時の入室後の操作感を再現するため。

#### Acceptance Criteria

1. THE Chanari_Chat_Room SHALL ルート要素として `<form name="f1" id="main">` を描画し、`Chanari_Scope` の配下に配置する
2. THE Chanari_Chat_Room SHALL 隠し `<input type="hidden" name="sid">` を描画し、その `value` に `sid` プロパティを渡す
3. THE Chanari_Chat_Room SHALL リロード秒数 `<select>` を描画し、options は `RELOAD_SECONDS_OPTIONS` (`2, 3, 4, 5, 6, 7, 8, 9, 10, 20, 30, 45, 60, 95, 120`) の 15 種、初期値は `DEFAULT_RELOAD_SECONDS` (`7`) とする
4. THE Chanari_Chat_Room SHALL 名前色用 `<input type="text">` と `Chanari_Color_Picker` を並べて描画する
5. THE Chanari_Chat_Room SHALL 発言色用 `<input type="text">` と `Chanari_Color_Picker` を並べて描画する
6. THE Chanari_Chat_Room SHALL エフェクト `<select>` を描画し、options は `EFFECT_OPTIONS` (全 27 種) とする
7. THE Chanari_Chat_Room SHALL 文字サイズ `<select>` を描画し、options は `FONT_SIZE_OPTIONS` (全 21 種) とする
8. THE Chanari_Chat_Room SHALL 「エフェクト無効」`<input type="checkbox">` を描画し、value は `disableEffect` プロパティと双方向バインドする
9. THE Chanari_Chat_Room SHALL 発言入力用 `<input type="text" size="60">` を描画し、その直後に `Chanari_Char_Counter` を配置する
10. THE Chanari_Chat_Room SHALL 以下のボタン群を原典の順序で描画する: 「チャットで発言する」, 「更新」, 「発言復元」, 「ログ消去」, 「AT フィールド」, 「チャットから退室する」
11. WHEN 利用者が「チャットで発言する」ボタンを押下する, THE Chanari_Chat_Room SHALL `event.preventDefault()` を実行した上で `onSend(message)` を呼ぶ
12. THE Chanari_Chat_Room SHALL `onSend` 呼び出し時に、エフェクト／文字サイズ／色等の UI 状態を `metadata` 引数として渡さない (Shared_Chat_Handlers の `handleSend(msg)` を metadata 無しで呼ぶ)
13. WHEN 利用者が「更新」ボタンを押下する, THE Chanari_Chat_Room SHALL `onReload()` を呼ぶ
14. WHEN 利用者が「発言復元」ボタンを押下する, THE Chanari_Chat_Room SHALL `onRestoreDraft()` を呼ぶ
15. WHEN 利用者が「ログ消去」ボタンを押下する, THE Chanari_Chat_Room SHALL `onClearMyLogs()` を呼び、この関数は内部で Shared_Chat_Handlers の `handleSend('clear')` を呼び出す
16. WHEN 利用者が「AT フィールド」ボタンを押下する, THE Chanari_Chat_Room SHALL `setAtField(!atField)` を呼んで `atField` 状態をトグルする
17. WHEN 利用者が「チャットから退室する」ボタンを押下する, THE Chanari_Chat_Room SHALL `onExit()` を呼ぶ
18. IF `message.trim() === ''`, THEN THE Chanari_Chat_Room SHALL 「チャットで発言する」ボタンを押下しても `onSend` を呼ばない
19. IF `countChars(message) > 120`, THEN THE Chanari_Chat_Room SHALL 「チャットで発言する」ボタンを `disabled` にし、`Chanari_Char_Counter` の `#wderr` に「文字数オーバー」を表示する

### Requirement 6: 上下分割レイアウトと既存 `ChatLogList` のログ表示再利用

**User Story:** 利用者として、画面上半分は 2012 年版を忠実に再現した UI、下半分はこれまで通りのチャットログ表示、という構成で使いたい。原典の雰囲気は上部で楽しみつつ、ログの視認性や既存機能（URL 自動リンク・アバター・フォントスタイル等）はそのまま使いたいため。

#### Acceptance Criteria

1. THE Chanari_Page SHALL 既存 `Shared_Retro_Splitter` (`src/features/chat/components/RetroSplitter/`) を無編集で import し、画面を `top` / `bottom` の 2 スロットに分割する
2. THE Chanari_Page SHALL `top` slot に `Chanari_Top_Header` と、入室状態に応じて `Chanari_Entry_Form` または `Chanari_Chat_Room` を配置する
3. THE Chanari_Page SHALL `top` slot の内容をルート `<div className="chanari-scope">...</div>` で**のみ**ラップし、`bottom` slot はこの scope に含めない
4. THE Chanari_Page SHALL `bottom` slot に既存 `Shared_Chat_Log_List` (`src/features/chat/components/ChatLogList/`) を `React.lazy` + `Suspense` で再利用し、本機能で新規コンポーネントを挟み込まない
5. THE Chanari_Page SHALL `Shared_Chat_Log_List` に渡す props を既存 `ChatPage` と同じ shape (`chatLog`, `isLoading`, `windowRows`, `participants`) で渡す
6. THE Chanari_Page SHALL `Shared_Chat_Log_List` の props に新規フィールド (`effect` / `fontSize` / `atField` など) を追加しない
7. THE Chanari_App SHALL 本機能において新規のログ描画コンポーネント (`ChanariChatLog` 等) を作成しない
8. WHEN `chatLog` / `isLoading` / `participants` が更新される, THE Shared_Chat_Log_List SHALL 既存の描画ロジック (`ParticipantsList` + `Divider` + `ChatMessage`) をそのまま使い、本機能から挙動が変わらない
9. THE Chanari_App SHALL `ChatRanking` コンポーネントを使用しない

### Requirement 7: `ChanariColorPicker` によるカラーピッカーの再現

**User Story:** 利用者として、rainbow.png 虹アイコンをクリックしてブラウザ標準のカラーピッカーを開き、選んだ色を名前色／発言色に反映したい。2012 年版のカラーピッカー UI を再現するため。

#### Acceptance Criteria

1. THE Chanari_Color_Picker SHALL `<label>` 要素内に `<img>` タグと `<input type="color">` タグを内包する
2. THE Chanari_Color_Picker SHALL `<img>` の `src` 属性を `iconSrc` プロパティから取得し、指定が無い場合は `${import.meta.env.BASE_URL}chanari/rainbow.png` をデフォルト値とする
3. THE Chanari_Color_Picker SHALL `<input type="color">` にスクリーンリーダ可視用のクラス (`sr-only` 等) を付与し、視覚的に隠蔽する
4. WHEN 利用者が `<img>` をクリックする, THE Chanari_Color_Picker SHALL `<input type="color">` のカラーピッカーを開く
5. WHEN 利用者がカラーピッカーで色を確定する, THE Chanari_Color_Picker SHALL Color_Normalizer を通した `#rrggbb` 形式の値を `onChange` コールバックに渡す
6. THE Chanari_Color_Picker SHALL `ariaLabel` プロパティを `<input type="color">` の `aria-label` 属性として設定する
7. WHERE `ariaLabel` プロパティが未指定, THE Chanari_Color_Picker SHALL 「カラーピッカー」等のデフォルト日本語ラベルを用いる

### Requirement 8: `ChanariCharCounter` による文字数カウンタの再現

**User Story:** 利用者として、発言入力欄の横で現在の文字数と上限超過エラーをリアルタイムに確認したい。2012 年版の `#wdcnt` / `#wderr` の挙動を再現するため。

#### Acceptance Criteria

1. THE Chanari_Char_Counter SHALL `<span id="wdcnt">{count}</span>文字` の形式で現在文字数を描画する
2. THE Chanari_Char_Counter SHALL 内部で Char_Counter 関数 (`countChars`) を呼び出して `count` を算出する
3. WHERE `maxLength` プロパティが指定される, THE Chanari_Char_Counter SHALL `maxLength` を上限値として扱う
4. WHERE `maxLength` プロパティが未指定, THE Chanari_Char_Counter SHALL `120` をデフォルト上限として扱う
5. IF `countChars(value) > maxLength`, THEN THE Chanari_Char_Counter SHALL `<span id="wderr">文字数オーバー</span>` を描画する
6. IF `countChars(value) <= maxLength`, THEN THE Chanari_Char_Counter SHALL `<span id="wderr">` を空もしくは非表示として描画する

### Requirement 9: Char_Counter (`countChars`) 純関数

**User Story:** 開発者として、発言文字列から「ユーザーが視覚的に認識する文字数」を安定して数える純関数が欲しい。文字数カウンタ UI とバリデーションの両方から同じ定義で使うため。

#### Acceptance Criteria

1. THE Char_Counter SHALL `string` を唯一の引数として受け取り、0 以上の整数を返す純関数である
2. WHEN 入力が空文字列 `''`, THE Char_Counter SHALL `0` を返す
3. FOR ALL 文字列 `a`, `b`, THE Char_Counter SHALL `countChars(a + b) === countChars(a) + countChars(b)` を満たす
4. WHEN `Intl.Segmenter` が利用可能な環境, THE Char_Counter SHALL `Intl.Segmenter` を用いて grapheme 単位でカウントする
5. WHERE `Intl.Segmenter` が利用不能な環境, THE Char_Counter SHALL `Array.from(input).length` をフォールバックとして使用しサロゲートペアを 1 文字として扱う
6. THE Char_Counter SHALL 引数以外の外部状態を読み書きせず副作用を持たない

### Requirement 10: Effect_Mapper (`effectToStyle`) 純関数（本実装では未結線）

**User Story:** 開発者として、エフェクト select の識別子 (`EffectId`) を `React.CSSProperties` に変換する純関数を、将来のログ描画拡張やプレビュー領域追加の種として保全しておきたい。本実装ではどの描画コンポーネントからも呼ばないが、契約と PBT を残して将来コストを下げるため。

### Requirement 10: エフェクト / 文字サイズ select の UI 飾り扱い

**User Story:** 利用者として、2012 年版の「エフェクト」「文字サイズ」「エフェクト無効」の select / checkbox が UI 上に存在することで当時の雰囲気を感じたい。ただし既存 `ChatLogList` / `ChatMessage` を無編集で再利用する制約のため、本実装では装飾効果を実際の描画には反映させない。

#### Acceptance Criteria

1. THE Chanari_App SHALL `EFFECT_OPTIONS` 定数（27 種のラベル + ID）を `src/features/chanari-chat/utils/effectOptions.ts` にエクスポートする
2. THE Chanari_App SHALL `FONT_SIZE_OPTIONS` 定数（21 種のラベル + ID）を `src/features/chanari-chat/utils/fontSizeOptions.ts` にエクスポートする
3. THE Chanari_Chat_Room SHALL `EFFECT_OPTIONS` / `FONT_SIZE_OPTIONS` を `<option>` 列に展開して描画する
4. THE Chanari_Chat_Room SHALL エフェクト `<select>` / 文字サイズ `<select>` / 「エフェクト無効」 `<input type="checkbox">` / 「AT フィールド」トグルボタンの選択値を自身のローカル `useState` で保持する（親コンポーネントや兄弟コンポーネントに引き上げない）
5. THE Chanari_App SHALL `EffectId` を `React.CSSProperties` に変換する関数（旧設計の `effectToStyle`）を本 spec では**実装しない**
6. THE Chanari_App SHALL `LegacyFontSize` を `React.CSSProperties` に変換する関数（旧設計の `fontSizeToStyle`）を本 spec では**実装しない**
7. THE Chanari_App SHALL 上記 select / checkbox / トグルボタンの選択値が変化しても、発言入力欄 `<input type="text">`、`Chanari_Chat_Room` 以外のコンポーネント、既存 `Shared_Chat_Log_List` のいずれにも inline style / classname / data 属性を差し込まない

### Requirement 11: Color_Normalizer (`normalizeColorCode`) 純関数

**User Story:** 開発者として、利用者が入力したあるいはカラーピッカーが返した色文字列を `#rrggbb` 形式に正規化する純関数が欲しい。CSS 適用・状態保存・比較を一貫したフォーマットで行うため。

#### Acceptance Criteria

1. THE Color_Normalizer SHALL `(input: string, fallback?: '#<rrggbb>')` を引数として受け取り `#<rrggbb>` 形式の 7 文字小文字文字列を返す純関数である
2. WHERE `fallback` プロパティが未指定, THE Color_Normalizer SHALL `#000000` をデフォルトフォールバックとして使用する
3. FOR ALL `input: string`, THE Color_Normalizer SHALL 戻り値が正規表現 `/^#[0-9a-f]{6}$/` にマッチする文字列を返す
4. WHEN `input.trim().toLowerCase()` が `#rgb` 形式, THE Color_Normalizer SHALL 各桁を 2 倍に展開した `#rrggbb` 形式を返す
5. WHEN `input.trim().toLowerCase()` が `#rrggbb` 形式, THE Color_Normalizer SHALL その文字列をそのまま返す
6. WHEN `input.trim().toLowerCase()` が既知の CSS 名前付き色 (例: `red`, `hotpink`), THE Color_Normalizer SHALL 対応する `#rrggbb` 値を返す
7. IF `input.trim() === ''` OR `input` が不正な形式, THEN THE Color_Normalizer SHALL `fallback` を返す
8. FOR ALL `s: string`, THE Color_Normalizer SHALL `normalizeColorCode(normalizeColorCode(s)) === normalizeColorCode(s)` を満たす (冪等性)
9. FOR ALL `s: string`, THE Color_Normalizer SHALL `normalizeColorCode(s.toUpperCase()) === normalizeColorCode(s.toLowerCase())` を満たす (大小文字非依存性)
10. THE Color_Normalizer SHALL 引数以外の外部状態を読み書きせず副作用を持たない

### Requirement 13: Draft_Store による発言復元 (`saveDraft` / `loadDraft`)

**User Story:** 利用者として、入室後フォームで入力中のおなまえ・色設定・発言を、ブラウザを閉じても次回入室時に「発言復元」ボタンで戻せるようにしたい。誤って閉じたときの入力を失わないため。

#### Acceptance Criteria

1. THE Draft_Store SHALL `localStorage` キー `chanari-retro-chat-ui:draft:v1` に、roomId をキーとする `ChanariDraft` オブジェクトのマップを JSON 形式で保存する
2. THE `saveDraft(draft)` 関数 SHALL `draft.roomId` が非空文字列のとき、`{ ...draft, version: 1, updatedAt: Date.now() }` の形で `localStorage` に書き込む
3. WHEN `saveDraft(d)` を呼び、その後同一プロセスで `loadDraft(d.roomId)` を呼ぶ (localStorage 利用可能時), THE Draft_Store SHALL `roomId` / `lastMessage` / `name` / `nameColor` / `speechColor` が入力と等しい `ChanariDraft` を返す
4. THE `loadDraft(roomId)` 関数 SHALL `localStorage` に該当 roomId の draft が存在しないとき `null` を返す
5. THE `loadDraft(roomId)` 関数 SHALL 保存データの `version !== 1` のとき必ず `null` を返す
6. THE `loadDraft(roomId)` 関数 SHALL `updatedAt` が `Date.now()` より未来、または `Date.now() - ONE_YEAR_MS` より過去のとき `null` を返す
7. THE `loadDraft(roomId)` 関数 SHALL `lastMessage.length > 1000` のとき `null` を返す
8. THE `loadDraft(roomId)` 関数 SHALL JSON.parse に失敗したとき `null` を返す
9. IF `localStorage` が利用不能 (SSR / Private Mode / 例外), THEN THE Draft_Store SHALL `saveDraft` を no-op とし、`loadDraft` は `null` を返し、例外を投げない
10. WHERE `saveDraft` に渡された `lastMessage.length > 1000`, THE Draft_Store SHALL 書き込みを拒否するか安全にトリムして書き込む (どちらの挙動でも可、ただしクラッシュしないこと)
11. THE Chanari_App SHALL `clearDraft` 関数を本 spec では実装しない（呼び出し箇所が無いため。将来退室時クリアの要件が出た時点で追加する）

### Requirement 14: Chanari_Settings_Hook (`useChanariSettings`) と既存 `useSettings` との整合

**User Story:** 利用者として、新 UI で設定した名前・色・直近の発言が、次回 `/chanari/:roomId` に来たときに自動で復元されるようにしたい。既存 `/chat/:roomId` 側の設定を壊さずに共存させるため。

#### Acceptance Criteria

1. THE Chanari_Settings_Hook SHALL `roomId` を引数として受け取り、`{ settings, updateSettings }` を返す React フックとして実装される
2. THE Chanari_Settings_Hook SHALL 内部で Draft_Store の `loadDraft(roomId)` を利用して初期値を取得する
3. THE `updateSettings(partial)` 関数 SHALL 内部で Draft_Store の `saveDraft` を呼び出して `localStorage` に書き込む
4. THE Chanari_Settings_Hook SHALL 既存 `features/chat/hooks/useSettings` が管理する `localStorage` キーを読み書きせず、独自の Draft_Store キー (`chanari-retro-chat-ui:draft:v1`) のみを利用する
5. WHEN `ChanariChatPage` が初期マウントされる, THE Chanari_Settings_Hook SHALL `settings.name` / `settings.nameColor` / `settings.speechColor` / `settings.lastMessage` の初期値をコンポーネントの state 初期化に提供する

### Requirement 15: Reload_Interval_Hook (`useReloadInterval`) によるリロード秒数連動

**User Story:** 利用者として、「リロード秒数」select で選んだ間隔でチャットログが自動更新されるようにしたい。2012 年版の定期 reload 挙動を再現するため。

#### Acceptance Criteria

1. THE Reload_Interval_Hook SHALL `(seconds: ReloadSeconds, onTick: () => void, enabled: boolean)` を引数として受け取る React フックとして実装される
2. WHILE `enabled === true`, THE Reload_Interval_Hook SHALL `seconds * 1000` ミリ秒ごとに `onTick` を呼ぶ `setInterval` を 1 つだけ張る
3. WHEN `enabled` が `false` に変わる, THE Reload_Interval_Hook SHALL `clearInterval` で現在の timer を解除する
4. WHEN `seconds` の値が変化する, THE Reload_Interval_Hook SHALL 旧 timer を `clearInterval` で解除してから新しい `seconds` で再度 `setInterval` を張る
5. WHEN コンポーネントが unmount される, THE Reload_Interval_Hook SHALL 張られている timer を `clearInterval` で解除する
6. THE Reload_Interval_Hook SHALL 同時に複数の timer を保持しない (常に 0 または 1 個)
7. WHEN `enabled === true` かつ `Chanari_Chat_Room` が入室済み状態, THE Chanari_Page SHALL `onTick` として Shared_Chat_Handlers の `handleReload` を渡す

### Requirement 16: AT フィールドトグルは UI 飾りのみ

**User Story:** 利用者として、2012 年版にあった「AT フィールド」ボタンが UI 上に存在することで当時の雰囲気を感じたい。ただし既存 `ChatLogList` / `useLookSound` を無編集で使うハード制約のため、本実装ではボタンはクリックできるが実際の副作用は持たないプレースホルダとする。

#### Acceptance Criteria

1. THE Chanari_Chat_Room SHALL 「AT フィールド」ボタンを UI として描画する
2. THE Chanari_Chat_Room SHALL 「AT フィールド」ボタンの押下状態を自身のローカル `useState<boolean>` で保持する（専用カスタムフックは作らない）
3. THE Chanari_App SHALL 「AT フィールド」押下状態を `useLookSound` / `Shared_Chat_Log_List` / `useChatHandlers` のいずれにも渡さない
4. THE Chanari_App SHALL `useLookSound` の内部実装・Props を変更しない
5. THE Chanari_App SHALL 「AT フィールド」押下時に BGM の自動再生など外部リソースを操作する副作用を一切発火しない (当時の `aboon_add` は再現しない)
6. THE Chanari_App SHALL `useAtField` / `shouldMute` などの専用フック / ユーティリティを本 spec では実装しない

### Requirement 17: エフェクト・文字サイズ・AT フィールドは送信にもログ描画にも影響しない

**User Story:** 開発者として、エフェクトや文字サイズ等の UI 飾りが Supabase にもログ描画にも一切影響しないことを保証したい。既存スキーマ無変更・既存 `ChatLogList` / `ChatMessage` 無編集という 2 つのハード制約を両方守るため。

#### Acceptance Criteria

1. WHEN 利用者が `ChanariChatRoom` の「チャットで発言する」ボタンを押下する, THE Chanari_App SHALL Shared_Chat_Handlers の `handleSend(msg)` を引数 1 つのみで呼び出す
2. THE Chanari_App SHALL `handleSend` の第 2 引数 `metadata` に `effect` / `fontSize` / `disableEffect` / `atField` のいずれも含めず、`undefined` のまま呼び出す
3. THE Chanari_App SHALL Supabase の `chats` テーブル (`ChatMetadata` を含む) に新たな列・フィールドを追加しない
4. THE Chanari_App SHALL 既存 `ChatMetadata` スキーマに `effect` / `fontSize` / `disableEffect` / `atField` 等のフィールドを追加しない
5. THE Chanari_App SHALL 本機能で送信されたメッセージの描画を、既存 `Shared_Chat_Log_List` / `ChatMessage` に完全に委譲する（エフェクト / 文字サイズ / 色等の独自スタイルを inline で差し込まない）
6. WHEN 利用者 A が `ChanariChatRoom` でエフェクト / 文字サイズ / エフェクト無効 / AT フィールドを切り替える, THE Chanari_App SHALL 自端末・他端末のいずれにおいてもメッセージ本文の表示を変更しない（UI 飾りのみの挙動として定義する）

### Requirement 18: スコープ付き CSS とグローバル汚染の禁止（top 領域のみ）

**User Story:** 開発者として、2012 年版の `#chat-topheader` や `#wdcnt` など ID セレクタに依存した CSS を再現しつつ、既存 UI (features/chat, TopPage, NotFoundPage) のスタイルを汚染しないことを保証したい。新旧 UI を完全に独立した見た目で共存させるため。

#### Acceptance Criteria

1. THE Chanari_App SHALL 新 UI の **top 領域のルート要素のみ** に `className="chanari-scope"` を付与する（`bottom` slot には付与しない）
2. THE Chanari_App SHALL `src/features/chanari-chat/styles/chanari.css` 内のすべての CSS セレクタを `.chanari-scope` の配下にスコープする
3. THE Chanari_App SHALL 既存の `#chat-topheader`, `#header`, `#ctitle`, `#desc`, `#wdcnt`, `#wderr`, `#main`, `#main2` 等の ID セレクタ規則を `.chanari-scope` の配下以外では有効化しない
4. THE Chanari_App SHALL 背景色 `#FFD` (クリーム色) を `.chanari-scope` の配下（= top 領域）に限定して適用し、`bottom` slot（`Shared_Chat_Log_List`）には適用しない
5. THE Chanari_App SHALL 既存 `features/chat` や `TopPage` が依存する既存 Tailwind クラス (`bg-yui-green` 等) を上書きしない
6. THE Chanari_App SHALL `!important` 指定を使わずに `.chanari-scope` スコープだけで当時のスタイルを再現する
7. THE Chanari_App SHALL `Shared_Chat_Log_List` が描画する DOM ツリーに対して独自の CSS ルールを差し込まない

### Requirement 19: アセット配置 (rainbow.png)

**User Story:** 利用者として、カラーピッカーに 2012 年版と同じ虹アイコンが表示されることで、当時の雰囲気を視覚的に感じたい。ビジュアル面での再現度を高めるため。

#### Acceptance Criteria

1. THE Chanari_App SHALL `public/chanari/rainbow.png` にカラーピッカー用の虹アイコン画像を配置する
2. THE Chanari_Color_Picker SHALL `iconSrc` プロパティのデフォルト値として `${import.meta.env.BASE_URL}chanari/rainbow.png` を参照する
3. WHEN 画像ファイルがロードできない, THE Chanari_Color_Picker SHALL `<img>` の `alt` 属性 (日本語ラベル) を表示する
4. THE Chanari_App SHALL `public/chanari/` ディレクトリ配下のアセットを既存 `features/chat` から参照しない

### Requirement 20: エラーハンドリング

**User Story:** 利用者として、空入力・文字数超過・localStorage 利用不能・Supabase オフライン・未知のエフェクトID 等の異常系でも、アプリがクラッシュせず安全に動作してほしい。堅牢なチャット体験のため。

#### Acceptance Criteria

1. IF 発言入力の `value.trim() === ''`, THEN THE Chanari_Chat_Room SHALL 「チャットで発言する」ボタン押下時に `onSend` を呼ばず、入力欄にフォーカスを戻す
2. IF `countChars(message) > 120`, THEN THE Chanari_Chat_Room SHALL 「チャットで発言する」ボタンを `disabled` にし、`Chanari_Char_Counter` の `#wderr` に「文字数オーバー」を表示する
3. IF `localStorage.setItem` が例外を投げる, THEN THE Draft_Store SHALL 例外を catch して no-op とし、アプリ全体のクラッシュを防ぐ
4. IF `chatApi.loadChatLogs` がオフライン時モックを返す, THEN THE Shared_Chat_Log_List SHALL 既存 `features/chat` と同じ挙動でモックデータを表示する
5. IF `effect` が `EFFECT_OPTIONS` に含まれない未知の ID で state に入った, THEN THE Chanari_Chat_Room SHALL その値を無視して select の選択状態を `'none'` にフォールバックする
6. IF `fontSize` が `FONT_SIZE_OPTIONS` に含まれない未知の ID で state に入った, THEN THE Chanari_Chat_Room SHALL その値を無視して select の選択状態を `'default'` にフォールバックする
7. IF ブラウザが `/chanari/<不正な roomId>` にアクセスする, THEN THE Chanari_App SHALL `matchChanariRoute` で `null` を返した後、既存 `matchRoute` に委譲し最終的に `NotFoundPage` を描画する

### Requirement 21: セキュリティ

**User Story:** 開発者として、2012 年版 UI を再現しつつ、XSS や意図しない外部送信などのセキュリティリスクを持ち込まないことを保証したい。利用者の安全を確保するため。

#### Acceptance Criteria

1. THE Chanari_App SHALL メッセージ本文・名前・色の描画において `dangerouslySetInnerHTML` を使用しない
2. THE Chanari_App SHALL `<style>` タグや文字列結合による CSS 注入を行わない（動的な inline style は React の `style` prop 経由で `CSSProperties` のみを渡す）
3. THE Draft_Store SHALL 発言 draft を `localStorage` のみに保存し、URL クエリや外部サービスに送出しない
4. THE Chanari_App SHALL 外部リンク (「なりりきりチャにもどる」「ヘルプ」) に `target="_blank"` と `rel="noreferrer noopener"` を必ず付与する
5. THE Chanari_Color_Picker SHALL カラーピッカーの値を Color_Normalizer に通してから state に格納し、不正値は `fallback` に置換する
6. THE Chanari_Chat_Room SHALL 「AT フィールド」押下時に音声再生・BGM 追加など危険な副作用を一切行わない
7. THE Chanari_App SHALL 既存 `chatApi` のバリデーションを迂回する新しい書き込み経路を作らない

### Requirement 22: パフォーマンス

**User Story:** 開発者として、上部フォームの操作（文字入力・select 切替・リロード秒数変更）が大量メッセージのレンダリングに影響して fps を落とさないことを保証したい。快適な操作感のため。

#### Acceptance Criteria

1. WHILE Reload_Interval_Hook の `enabled === false`, THE Reload_Interval_Hook SHALL `setInterval` を張らず CPU idle を維持する
2. WHEN `effect` / `fontSize` / `disableEffect` / `atField` が変化する, THE Shared_Chat_Log_List SHALL 再描画されない（これらの state は top 領域に閉じており、bottom slot の props には渡されないため）
3. THE Chanari_App SHALL 既存 `useChatLog` のキャッシュ機構 (5 分) と Supabase Realtime 購読を改変せずそのまま流用する
4. THE Chanari_Settings_Hook SHALL `updateSettings` 1 回につき `JSON.stringify` 1 回のみの直列化コストで済むよう実装する

### Requirement 23: 参加者表示は既存 `ChatLogList` に完全委譲

**User Story:** 利用者として、参加者リストの表示仕様を既存 `/chat/:roomId` と揃えたい。上部 UI だけ差し替えつつ、下部のログと参加者一覧は今まで通りの見やすい表示を維持するため。

#### Acceptance Criteria

1. THE Chanari_Page SHALL `useParticipants(chatLog)` を既存 `ChatPage` と同じ用法で呼び出し、戻り値を `Shared_Chat_Log_List` の `participants` prop にそのまま渡す
2. THE Chanari_App SHALL 参加者リストを独自に描画しない（既存 `ParticipantsList` の表示仕様に完全委譲する）
3. THE Chanari_App SHALL `ChatRanking` コンポーネントを新 UI で利用しない

## Correctness Properties 対応表

以下は design.md の「Correctness Properties（PBT 候補）」セクションで定義された P-1 〜 P-8 と、本ドキュメント内の受け入れ基準との対応関係を示す。タスク化フェーズでの実装時に property test のタグ付け ("Feature: chanari-retro-chat-ui, Property <番号>: <タイトル>") として参照する。

| Property | Title                                                    | 対応する Requirement / Acceptance Criteria |
| -------- | -------------------------------------------------------- | ------------------------------------------ |
| P-1      | `countChars` の加法性 (連結不変性)                       | Requirement 9.3                            |
| P-2      | `countChars` の非負性と空文字ゼロ性                      | Requirement 9.1, 9.2                       |
| P-3      | `normalizeColorCode` の冪等性                            | Requirement 11.8                           |
| P-4      | `normalizeColorCode` の大小文字非依存性                  | Requirement 11.9                           |
| P-5      | `normalizeColorCode` の出力形式                          | Requirement 11.3                           |
| P-6      | `draftStore` の round-trip 保存                          | Requirement 13.3                           |
| P-7      | `matchChanariRoute` の整合性 (build → match が identity) | Requirement 1.1, 1.6, 1.7                  |
| P-8      | `matchChanariRoute` の未知ルート拒否                     | Requirement 1.3, 1.8                       |
