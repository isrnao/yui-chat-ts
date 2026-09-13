# 実装計画: chanari-retro-chat-ui

## 概要

2012 年版 chanari.com「なりきりチャット」の入室前フォーム (f4 / `id="main2"`) と入室後フォーム (f1 / `id="main"`) を、既存 `src/features/chat/` を一切改変せずに再現する新 UI レイヤーを `src/features/chanari-chat/` に追加する。バックエンド・Realtime・共有フック (`useChatLog` / `useChatHandlers` / `useLookSound` / `useSettings`) は既存実装をそのまま流用し、**チャット画面の「上部」だけ**（ヘッダー + 入室前 / 入室後フォーム）を chanari 独自マークアップで書く。**チャット画面の「下部」（ログ表示）は既存 `ChatLogList` を無編集で `RetroSplitter` の bottom slot に再利用する**ため、本機能で新規のログ表示コンポーネント (`ChanariChatLog` 等) は作成しない。

エフェクト select (27 種) / 文字サイズ select (21 種) / エフェクト無効 / AT フィールドは、「既存 `ChatLogList` / `ChatMessage` を無編集で使う」ハード制約と素直に整合させるため、**UI 上には残すが本実装ではどの描画にも接続しない**。select の `<option>` 描画のため `EFFECT_OPTIONS` / `FONT_SIZE_OPTIONS` 定数だけ用意し、`effectToStyle` / `fontSizeToStyle` のような CSS 変換関数と `useAtField` / `clearDraft` は本 spec では実装しない（呼び出し箇所が無いため）。必要になった時点で追加する。

ディレクトリ構成 → 純関数 → `draftStore` / `routing` → フック → スタイル → top 用コンポーネント → ページ結線 (`RetroSplitter` の top に chanari UI、bottom に既存 `ChatLogList`) → `App.tsx` 最小差分 → 既存 `/chat/:roomId` リグレッションテストの順で段階的に積み上げる TDD 風の順序で並べる。純関数にはすべて `fast-check` による Property-Based Test (P-1 〜 P-8) を付ける。

## Tasks

- [x] 1. 新 feature ディレクトリの雛形作成と静的アセットの配置
  - [x] 1.1 `src/features/chanari-chat/` 配下のディレクトリ構造を作成する
    - `src/features/chanari-chat/components/{ChanariTopHeader,ChanariEntryForm,ChanariChatRoom,ChanariColorPicker,ChanariCharCounter}/` を用意
    - `ChanariChatLog` 系ディレクトリは**作成しない**（既存 `ChatLogList` を bottom slot で再利用するため）
    - `src/features/chanari-chat/hooks/`、`src/features/chanari-chat/utils/`、`src/features/chanari-chat/styles/` を用意
    - 既存 `src/features/chat/` は無変更のまま維持
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 6.7_
  - [x] 1.2 カラーピッカー用虹アイコンを `public/chanari/rainbow.png` に配置する
    - ソース: 旧資料 `yuichat2/` または `oldyuichat/` ディレクトリから取得
    - `public/chanari/` 配下のアセットは既存 `features/chat` から参照しない
    - _Requirements: 19.1, 19.4_

- [x] 2. 純関数 `countChars` の実装と PBT
  - [x] 2.1 `src/features/chanari-chat/utils/countChars.ts` を作成する
    - `export function countChars(input: string): number` を実装
    - `Intl.Segmenter` が利用可能なら grapheme 単位でカウント、無ければ `Array.from(input).length` にフォールバック
    - 副作用なし・外部状態参照なし
    - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6_
  - [ ]\* 2.2 `src/features/chanari-chat/utils/countChars.property.test.ts` を作成する
    - **Property P-1: countChars の加法性**
      - `∀ a, b: string. countChars(a + b) === countChars(a) + countChars(b)`
      - `fc.unicodeString()` から ZWJ 合成絵文字を除外したドメインで検証
    - **Property P-2: countChars の非負性と空文字ゼロ性**
      - `∀ s: string. countChars(s) >= 0`
      - `countChars('') === 0`
    - **Validates: Requirements 9.2, 9.3**
  - [ ]\* 2.3 `src/features/chanari-chat/utils/countChars.test.ts` を作成する
    - ASCII / 日本語 / サロゲートペア絵文字 / 改行混じりの各ケースで期待値を検証
    - _Requirements: 9.1, 9.5_

- [x] 3. 定数 `EFFECT_OPTIONS` の定義
  - [x] 3.1 `src/features/chanari-chat/utils/effectOptions.ts` を作成する
    - `EFFECT_OPTIONS` 定数（27 種、`id` + `label`）と `EffectId` 型をエクスポート
    - 本 spec では `effectToStyle` のような CSS 変換関数は**実装しない**（呼び出し箇所が無いため）
    - ファイル冒頭に「select の `<option>` 描画用の定数のみ。将来 CSS 変換が必要になった時点で関数を追加する」旨をコメントで明記
    - _Requirements: 10.1, 10.3, 10.5_

- [x] 4. 定数 `FONT_SIZE_OPTIONS` の定義
  - [x] 4.1 `src/features/chanari-chat/utils/fontSizeOptions.ts` を作成する
    - `FONT_SIZE_OPTIONS` 定数（21 種、`id` + `label` + `px | scale`）と `LegacyFontSize` 型をエクスポート
    - 本 spec では `fontSizeToStyle` のような CSS 変換関数は**実装しない**（呼び出し箇所が無いため）
    - ファイル冒頭に「select の `<option>` 描画用の定数のみ」と明記
    - _Requirements: 10.2, 10.3, 10.6_

- [x] 5. 純関数 `normalizeColorCode` の実装と PBT
  - [x] 5.1 `src/features/chanari-chat/utils/colorCode.ts` を作成する
    - `CSS_NAMED_COLORS: Record<string, string>` テーブル（最低限 `black`, `white`, `red`, `green`, `blue`, `hotpink`, `pink`, `orange`, `yellow`, `aqua`, `purple`, `lime`, `navy`, `teal`, `gray` 等）を定義
    - `export function normalizeColorCode(input: string, fallback: string = '#000000'): string` を実装
    - `#rgb` → `#rrggbb` 展開、`#rrggbb` はそのまま、名前付き色は `#rrggbb` に変換、不正値は `fallback`
    - 戻り値は必ず `/^#[0-9a-f]{6}$/` にマッチする 7 文字小文字文字列
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.10_
  - [ ]\* 5.2 `src/features/chanari-chat/utils/colorCode.property.test.ts` を作成する
    - **Property P-3: 冪等性**
      - `∀ s: string. normalizeColorCode(normalizeColorCode(s)) === normalizeColorCode(s)`
    - **Property P-4: 大小文字非依存性**
      - `∀ s: string. normalizeColorCode(s.toUpperCase()) === normalizeColorCode(s.toLowerCase())`
    - **Property P-5: 出力形式**
      - `∀ s: string. /^#[0-9a-f]{6}$/.test(normalizeColorCode(s))`
    - ジェネレーターは `fc.string()` + `fc.hexaString({ minLength: 3, maxLength: 6 }).map(s => '#' + s)` を混ぜる
    - **Validates: Requirements 11.3, 11.8, 11.9**
  - [ ]\* 5.3 `src/features/chanari-chat/utils/colorCode.test.ts` を作成する
    - `#fff` → `#ffffff`、`HOTPINK` → `#ff69b4`、`''` → `fallback`、`'not a color'` → `fallback` の各例を検証
    - _Requirements: 11.4, 11.5, 11.6, 11.7_

- [x] 6. `draftStore` の実装とテスト（副作用あり）
  - [x] 6.1 `src/features/chanari-chat/utils/draftStore.ts` を作成する
    - `STORAGE_KEY = 'chanari-retro-chat-ui:draft:v1'`、`ONE_YEAR_MS` 定数、`RELOAD_SECONDS_OPTIONS`（`[2,3,4,5,6,7,8,9,10,20,30,45,60,95,120]`）、`DEFAULT_RELOAD_SECONDS = 7` をエクスポート
    - `ChanariDraft` 型（`version: 1`、`roomId`、`name?`、`nameColor?`、`speechColor?`、`lastMessage?`、`updatedAt`）を定義
    - `saveDraft(draft)` と `loadDraft(roomId)` のみを公開する（`clearDraft` は本 spec では実装しない）
    - `canUseLocalStorage()` ヘルパーで SSR / Private Mode / 例外を吸収し、利用不能なら `saveDraft` を no-op、`loadDraft` を `null` にする
    - 1 つの `STORAGE_KEY` に roomId 別のマップを JSON で保存（他 roomId の draft を壊さない）
    - `version !== 1`、未来日 / 1 年以上過去の `updatedAt`、`lastMessage.length > 1000` は `loadDraft` で `null`
    - _Requirements: 13.1, 13.2, 13.4, 13.5, 13.6, 13.7, 13.8, 13.9, 13.10, 13.11, 20.3_
  - [ ]\* 6.2 `src/features/chanari-chat/utils/draftStore.property.test.ts` を作成する
    - **Property P-6: draftStore の round-trip 保存**
      - `∀ draft: Omit<ChanariDraft, 'version'|'updatedAt'>, roomId ∈ CHAT_ROOM_IDS.`
      - `saveDraft(draft); const loaded = loadDraft(draft.roomId); loaded !== null && loaded.roomId === draft.roomId && loaded.lastMessage === draft.lastMessage`
    - 複数 roomId の draft を混在して保存しても相互破壊しないことも同じ property で検証
    - `beforeEach` で `localStorage.clear()`
    - ジェネレーターは `fc.constantFrom(...CHAT_ROOM_IDS)` + `fc.string({ maxLength: 500 })`
    - **Validates: Requirements 13.3**
  - [ ]\* 6.3 `src/features/chanari-chat/utils/draftStore.test.ts` を作成する
    - localStorage 未定義環境でも `saveDraft` が例外を投げないこと
    - `version` を 2 に書き換えたデータで `loadDraft` が `null` を返すこと
    - `updatedAt` を未来 / 1 年以上過去に書き換えたデータで `null` を返すこと
    - JSON.parse 失敗時に `null` を返すこと
    - _Requirements: 13.5, 13.6, 13.8, 13.9_

- [x] 7. ルーティング `matchChanariRoute` / `buildChanariRoomPath` の実装と PBT
  - [x] 7.1 `src/features/chanari-chat/routing.ts` を作成する
    - `ChanariRouteMatch = { type: 'chanari-room'; roomId: RoomId } | { type: 'redirect'; to: string } | null` をエクスポート
    - `matchChanariRoute(pathname)` と `buildChanariRoomPath(roomId)` を実装
    - `import.meta.env.BASE_URL` の prefix を考慮（既存 `features/chat/routing.ts` の `stripBasePath` と同じ方針）
    - 既存 `isEnabledRoomId` / `DEFAULT_ROOM_ID` を再利用し、ホワイトリストを複製しない
    - `/chanari` プレフィックスを含まないパスは `null`
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.7, 1.8, 1.9_
  - [ ]\* 7.2 `src/features/chanari-chat/routing.property.test.ts` を作成する
    - **Property P-7: matchChanariRoute の整合性**
      - `∀ roomId ∈ CHAT_ROOM_IDS. const m = matchChanariRoute(buildChanariRoomPath(roomId)); m !== null && m.type === 'chanari-room' && m.roomId === roomId`
    - **Property P-8: 未知ルート拒否**
      - `∀ s: string where s ∉ CHAT_ROOM_IDS. matchChanariRoute('/chanari/' + s) === null`
      - `/chanari` プレフィックスを含まない任意のパスで `null` を返すこと
    - ジェネレーターは `fc.constantFrom(...CHAT_ROOM_IDS)` と `fc.string().filter(s => !CHAT_ROOM_IDS.includes(s as RoomId))`
    - **Validates: Requirements 1.1, 1.3, 1.6, 1.7, 1.8**
  - [ ]\* 7.3 `src/features/chanari-chat/routing.test.ts` を作成する
    - `/chanari` → redirect、`/chanari/superbeginner` → chanari-room、`/chanari/unknown` → null、`/` / `/chat/superbeginner` → null の個別ケース
    - BASE_URL が `/yui-chat-ts/` 相当でも正しく strip できること
    - _Requirements: 1.2, 1.4, 1.5, 1.6, 1.8_

- [ ] 8. チェックポイント - 純関数基盤の確認
  - `pnpm test -- chanari-chat/utils chanari-chat/routing` を実行して通ること
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

- [ ] 9. （削除済み）AT フィールド用フックは本 spec では実装しない
  - `useAtField` フックは本 spec では作成しない。AT フィールドの押下状態は task 18 で実装する `ChanariChatRoom` 内のローカル `useState<boolean>` で保持する（requirements.md R16 参照）
  - このタスク番号はトレーサビリティ保持のために空タスクとして残す（作業不要）
  - _Requirements: 16.2, 16.6_

- [x] 10. フック `useReloadInterval` の実装とテスト
  - [x] 10.1 `src/features/chanari-chat/hooks/useReloadInterval.ts` を作成する
    - `useReloadInterval(seconds: ReloadSeconds, onTick: () => void, enabled: boolean): void` を実装
    - `useEffect` 内で `enabled` が true のときだけ `setInterval(onTick, seconds * 1000)` を張る
    - クリーンアップで必ず `clearInterval` を呼ぶ。同時に複数 timer を抱えない
    - `seconds` / `enabled` / `onTick` の依存変更で再セットする
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5, 15.6, 22.1_
  - [ ]\* 10.2 `src/features/chanari-chat/hooks/useReloadInterval.test.ts` を作成する
    - `vi.useFakeTimers()` を使用
    - `enabled=true` で `seconds` 秒ごとに `onTick` が呼ばれること
    - `enabled=false` で timer が解除されること
    - `seconds` が変わると旧 timer が解除され新 `seconds` で再セットされること
    - unmount で timer が解除されること（メモリリークなし）
    - _Requirements: 15.2, 15.3, 15.4, 15.5_

- [x] 11. フック `useChanariSettings` の実装とテスト
  - [x] 11.1 `src/features/chanari-chat/hooks/useChanariSettings.ts` を作成する
    - `useChanariSettings(roomId: string): { settings: Partial<ChanariDraft>; updateSettings: (partial: ...) => void }` を実装
    - 初期値は `loadDraft(roomId)` から取得（null の場合は空オブジェクト）
    - `updateSettings(partial)` は内部で `saveDraft({ roomId, ...current, ...partial })` を呼ぶ
    - 既存 `features/chat/hooks/useSettings` の `localStorage` キーには触れない（独自キーのみ）
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 22.4_
  - [ ]\* 11.2 `src/features/chanari-chat/hooks/useChanariSettings.test.ts` を作成する
    - 既存保存済み draft があればマウント時に `settings` に反映されること
    - `updateSettings` で localStorage が更新されること
    - 既存 `features/chat` が使う他の localStorage キーを書き換えないこと
    - _Requirements: 14.2, 14.3, 14.4_

- [ ] 12. チェックポイント - フック層の確認
  - `pnpm test -- chanari-chat/hooks` を実行して通ること
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

- [x] 13. スコープ付きスタイル `chanari.css` の作成（top 領域のみ）
  - [x] 13.1 `src/features/chanari-chat/styles/chanari.css` を作成する
    - 全セレクタを `.chanari-scope` の配下にスコープ（bottom slot には絶対に波及させない）
    - `.chanari-scope` に背景色 `#FFD`（クリーム色）と最低幅を設定
    - `.chanari-scope #chat-topheader`、`.chanari-scope #chat-topheader-left`、`.chanari-scope #chat-topheader-right`、`.chanari-scope #header`、`.chanari-scope #ctitle`、`.chanari-scope #desc` のレイアウト（左右フロート + clearfix）を定義
    - `.chanari-scope #wdcnt`、`.chanari-scope #wderr` の文字色・余白
    - `@keyframes` ルール（`chanari-wave` 等）は本 spec では**定義しない**（`effectToStyle` / `fontSizeToStyle` を実装しないため）。将来 CSS 変換関数を追加する時点で併せて定義する
    - `!important` を使わない
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5, 18.6, 18.7_

- [x] 14. コンポーネント `ChanariCharCounter` の実装とテスト
  - [x] 14.1 `src/features/chanari-chat/components/ChanariCharCounter/index.tsx` を作成する
    - `ChanariCharCounterProps = { value: string; maxLength?: number }`（デフォルト 120）
    - `<span id="wdcnt">{countChars(value)}</span>文字 <span id="wderr">{countChars(value) > maxLength ? '文字数オーバー' : ''}</span>` を描画
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_
  - [ ]\* 14.2 `src/features/chanari-chat/components/ChanariCharCounter/index.test.tsx` を作成する
    - `value='abc'` で `3文字` が描画されること
    - `maxLength=5`、`value='abcdef'` で `#wderr` に `文字数オーバー` が出ること
    - _Requirements: 8.1, 8.5_

- [x] 15. コンポーネント `ChanariColorPicker` の実装とテスト
  - [x] 15.1 `src/features/chanari-chat/components/ChanariColorPicker/index.tsx` を作成する
    - `<label>` で `<img>` と `<input type="color" className="sr-only" />` を囲む
    - `iconSrc` の既定値を `${import.meta.env.BASE_URL}chanari/rainbow.png` とする
    - `<input>` の `aria-label` は `ariaLabel` プロパティ、未指定なら「カラーピッカー」
    - `onChange` では `normalizeColorCode(event.target.value)` を通した値を返す
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 19.2, 19.3, 21.5_
  - [ ]\* 15.2 `src/features/chanari-chat/components/ChanariColorPicker/index.test.tsx` を作成する
    - クリックで `<input type="color">` が focus されること
    - 色を変更すると `onChange` に `#rrggbb` 形式（小文字）が渡ること
    - 未指定時の `img.src` が `chanari/rainbow.png` を含むこと
    - _Requirements: 7.2, 7.5_

- [x] 16. コンポーネント `ChanariTopHeader` の実装とテスト
  - [x] 16.1 `src/features/chanari-chat/components/ChanariTopHeader/index.tsx` を作成する
    - `<div id="chat-topheader" className="clearfix">` + 左右の子 `<div>` を描画
    - 左に「なりりきりチャにもどる」アンカー、`sloganLabel` が指定されていれば併記
    - 右に「ヘルプ」アンカー、`target="_blank" rel="noreferrer noopener"`
    - `<div id="header" className="clearfix"><h1 id="ctitle">{title}</h1><p id="desc">{description}</p></div>` を続けて描画
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 21.4_
  - [ ]\* 16.2 `src/features/chanari-chat/components/ChanariTopHeader/index.test.tsx` を作成する
    - `backHref` / `helpHref` が対応する `<a>` の `href` に反映されること
    - ヘルプアンカーに `target="_blank"` と `rel="noreferrer noopener"` が両方付くこと
    - `sloganLabel` 未指定時に当該テキストが存在しないこと
    - _Requirements: 3.2, 3.3, 3.5_

- [x] 17. コンポーネント `ChanariEntryForm` の実装とテスト
  - [x] 17.1 `src/features/chanari-chat/components/ChanariEntryForm/index.tsx` を作成する
    - ルート要素は `<form name="f4" id="main2">`
    - 隠し `<input type="hidden" name="sid" value={sid} />`
    - おなまえ `<input type="text" size={10} maxLength={20} />`（`name` 双方向バインド）
    - 名前色 `<input type="text">` + `<ChanariColorPicker>`
    - 発言色 `<input type="text">` + `<ChanariColorPicker>`
    - 「チャットに参加する」`<input type="submit">`
    - submit で `event.preventDefault()` → `name.trim() !== ''` なら `onEnter({ name, nameColor, speechColor })`
    - `isPending` 時に submit ボタンを `disabled`、`error` 非空でエラー表示
    - `metadata` 等のサーバー側フィールドは追加しない（既存 `handleEnter` と互換）
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11_
  - [ ]\* 17.2 `src/features/chanari-chat/components/ChanariEntryForm/index.test.tsx` を作成する
    - 空名前で submit しても `onEnter` が呼ばれないこと
    - 名前入力後に submit すると `onEnter` が `{ name, nameColor, speechColor }` で呼ばれること
    - `isPending=true` でボタンが disabled になること
    - `error` が非空でエラー表示が出ること
    - _Requirements: 4.7, 4.8, 4.10, 4.11_

- [x] 18. コンポーネント `ChanariChatRoom` の実装とテスト
  - [x] 18.1 `src/features/chanari-chat/components/ChanariChatRoom/index.tsx` を作成する
    - ルート要素は `<form name="f1" id="main">`、隠し `sid`
    - リロード秒数 `<select>`（`RELOAD_SECONDS_OPTIONS` の 15 種、初期値 7、Props 経由で親に引き上げ → `useReloadInterval` に渡すため）
    - 名前色 / 発言色 `<input>` + `<ChanariColorPicker>` を 2 系統
    - エフェクト `<select>`（`EFFECT_OPTIONS` 27 種）、文字サイズ `<select>`（`FONT_SIZE_OPTIONS` 21 種）**UI のみ、描画には適用しない**
    - エフェクト無効 `<input type="checkbox">` **UI のみ**
    - 発言 `<input type="text" size={60}>` + `<ChanariCharCounter>`
    - ボタン群を原典順に描画: 「チャットで発言する」 / 「更新」 / 「発言復元」 / 「ログ消去」 / 「AT フィールド」 / 「チャットから退室する」
    - submit で `event.preventDefault()` し、`message.trim() !== '' && countChars(message) <= 120` のときだけ `onSend(message)` を呼ぶ（第 2 引数の metadata は絶対に渡さない）
    - `countChars(message) > 120` で送信ボタンを `disabled`
    - 「更新」→ `onReload()`、「発言復元」→ `onRestoreDraft()`、「ログ消去」→ `onClearMyLogs()`、「チャットから退室する」→ `onExit()`
    - **`effect` / `disableEffect` / `fontSize` / `atField` は本コンポーネント内のローカル `useState` で保持する**（Props に露出させない。親 `ChanariChatPage` や `ChatLogList` には伝えない）
    - **発言 `<input>` には `effect` / `fontSize` 由来の inline style を適用しない**（caret / IME を壊さないため）
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11, 5.12, 5.13, 5.14, 5.15, 5.16, 5.17, 5.18, 5.19, 10.3, 10.4, 10.7, 16.1, 16.2, 16.3, 17.1, 17.2, 17.5, 17.6, 20.1, 20.2_
  - [ ]\* 18.2 `src/features/chanari-chat/components/ChanariChatRoom/index.test.tsx` を作成する
    - 発言入力で `ChanariCharCounter` の表示文字数が連動すること
    - 「チャットで発言する」で `onSend(msg)` が `msg` 1 引数のみで呼ばれること（metadata なし）
    - 空発言 / 120 文字超で送信ボタンが disabled になること
    - 「更新」/「発言復元」/「ログ消去」/「退室」の各ボタンが対応するハンドラを呼ぶこと
    - 「AT フィールド」ボタンで内部 `atField` state がトグルすること（外部ハンドラは呼ばれない）
    - リロード秒数 select の options が 15 種あり初期値が 7 であること
    - エフェクト select / 文字サイズ select の options が 27 / 21 種あること
    - エフェクト / 文字サイズ / エフェクト無効 / AT フィールドを切り替えても発言 `<input>` の inline style / className が変化しないこと
    - エフェクト / 文字サイズ / エフェクト無効 / AT フィールドの変化が `onSend` / `onReload` / `onRestoreDraft` / `onClearMyLogs` / `onExit` を発火させないこと
    - _Requirements: 5.3, 5.6, 5.7, 5.10, 5.11, 5.12, 5.13, 5.14, 5.15, 5.16, 5.17, 5.18, 5.19, 10.4, 10.7, 16.2, 16.3, 17.1, 17.5, 17.6_

- [ ] 19. 既存 `ChatLogList` の再利用（新規ログコンポーネントは作らない）
  - 本タスクでは新規ファイルを作成しない
  - `ChanariChatLog` 系コンポーネントは**作成しないこと**を明示する（task 21 の `ChanariChatPage` で既存 `ChatLogList` を `RetroSplitter` の bottom slot として `lazy + Suspense` で import する）
  - 既存 `src/features/chat/components/ChatLogList/` / `ChatMessage/` / `ParticipantsList/` / `shared/Divider` / `RetroSplitter/` に**一切の変更を加えない**
  - _Requirements: 2.1, 6.1, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 23.1, 23.2, 23.3_

- [ ] 20. チェックポイント - 上部 UI コンポーネント層の確認
  - `pnpm test -- chanari-chat/components` を実行して通ること
  - 新規ログ表示コンポーネント (`ChanariChatLog`) が作成されていないこと（task 19 の方針確認）
  - すべてのテストが通ることを確認し、不明点があればユーザーに質問する。

- [x] 21. ページ `ChanariChatPage` の結線（`RetroSplitter` の top のみ新 UI、bottom は既存 `ChatLogList` を再利用）
  - [x] 21.1 `src/features/chanari-chat/ChanariChatPage.tsx` を作成する
    - `roomId: RoomId` を props で受け取り、`getRoomMeta(roomId)` で room を取得
    - 既存フックを流用: `useChatLog(roomId)`、`useParticipants(chatLog)`（既存 `ChatPage` と同じ用法）、`useChatHandlers({ ... })`、`useLookSound(channelRef, roomId)`
    - 新規フックを合成: `useChanariSettings(roomId)`、`useReloadInterval(reloadSeconds, handleReload, entered)`
    - `settings` から name / nameColor / speechColor / lastMessage の初期値を取得
    - `entered` state で入室前 / 入室後を切替
    - `reloadSeconds` のみ `ChanariChatPage` 側で `useState` 保持し、`ChanariChatRoom` に渡す（`useReloadInterval` のため）
    - `effect` / `fontSize` / `disableEffect` / `atField` は `ChanariChatPage` には置かない（`ChanariChatRoom` 内ローカル state）
    - 既存 `RetroSplitter` を `@features/chat/components/RetroSplitter` から **無編集で** import し、ルートとして使用
    - `top` slot: `<div className="chanari-scope">` でラップし、その中に `<ChanariTopHeader ... />` と `entered ? <ChanariChatRoom .../> : <ChanariEntryForm .../>` を配置
    - `bottom` slot: `const ChatLogList = lazy(() => import('@features/chat/components/ChatLogList'))` で既存 `ChatLogList` を lazy import し、`<Suspense>` で囲んで既存 `ChatPage` と同じ props shape (`chatLog`, `isLoading`, `windowRows`, `participants`) を渡す
    - `bottom` slot を `chanari-scope` で**包まない**（CSS の波及防止）
    - `handleSend(msg)` は第 1 引数のみで呼ぶ（metadata は渡さない）
    - 「ログ消去」は `handleSend('clear')` を呼ぶ
    - `./styles/chanari.css` を import
    - `ChatRanking` は使用しない（要件 23）
    - 既存 `useSettings` の localStorage キーには触れない
    - _Requirements: 1.1, 1.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9, 14.5, 17.1, 17.2, 17.5, 17.6, 22.2, 22.3, 23.1, 23.2, 23.3_
  - [ ]\* 21.2 `src/features/chanari-chat/ChanariChatPage.test.tsx` を作成する
    - `jsdom` 環境で `<ChanariChatPage roomId="superbeginner" />` をレンダリング
    - 入室前は `<form name="f4" id="main2">` が `chanari-scope` 配下に出ること
    - 名前を入れて「チャットに参加する」で `entered` が true になり `<form name="f1" id="main">` に切り替わること（`handleEnter` は mock）
    - 「チャットで発言する」で `handleSend` が第 1 引数のみで呼ばれること
    - bottom slot に既存 `ChatLogList`（`data-testid="chat-log-list"`）が描画されること
    - `chanari-scope` の外側に `ChatLogList` が存在すること（CSS の波及確認）
    - _Requirements: 1.1, 4.9, 5.12, 6.3, 6.4, 17.1_

- [x] 22. `App.tsx` への最小差分追加（既存 UI の保全）
  - [x] 22.1 `src/App.tsx` に `matchChanariRoute` ブランチを 1 箇所だけ追加する
    - `matchChanariRoute` を import し、`resolveRoute(pathname)` ヘルパーで「`matchChanariRoute(pathname)` が `null` でなければそれを返し、そうでなければ既存 `matchRoute(pathname)` に委譲」する
    - `useState` 初期化と `popstate` ハンドラで `resolveRoute` を使うように差し替え
    - `route.type === 'chanari-room'` のとき `<ChanariChatPage roomId={route.roomId} />` を返す分岐を、既存の `top` / `chat-room` / `redirect` / `not-found` 分岐の前に追加
    - `ChanariChatPage` は `lazy` + `Suspense` で遅延読み込みしてもよい（既存 `ChatLogList` と同じパターン）
    - 既存 `ChatPage` / `TopPage` / `NotFoundPage` / `EntryForm` / `ChatRoom` の import と JSX 構造は変更しない
    - `/` / `/chat/:roomId` 到達時に chanari 側の干渉が発生しないこと
    - _Requirements: 1.1, 1.4, 1.5, 2.1, 2.6, 20.7_
  - [ ]\* 22.2 `src/App.chanari-routing.test.tsx` を作成する
    - `window.history.replaceState` で `/chanari/superbeginner` を設定し、`<App />` をレンダリングすると `<div className="chanari-scope">` が描画されること
    - `/chanari/unknown` で `NotFoundPage` が描画されること（既存 `matchRoute` に委譲される）
    - _Requirements: 1.1, 1.3, 1.4, 20.7_

- [ ] 23. 既存 `/chat/:roomId` のリグレッションテスト
  - [ ]\* 23.1 `src/App.chat-regression.test.tsx` を作成する
    - `window.history.replaceState` で `/chat/superbeginner` を設定し、`<App />` をレンダリング
    - 既存 `EntryForm` 由来のラベル（「おなまえ」「参加」等、既存 UI で使われているテキスト）がそのまま描画されること
    - `chanari-scope` クラスを持つ要素が DOM に存在しないこと
    - 既存 `ChatPage` の main 要素が `bg-yui-green` クラスを持つこと（既存の Tailwind クラスが上書きされていないこと）
    - 既存 `ChatLogList`（`data-testid="chat-log-list"`）がそのまま描画されること
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 6.8, 18.5, 18.7_

- [x] 24. 最終確認 - プロジェクト全体のビルド / 型 / Lint / テスト
  - [x] 24.1 `pnpm typecheck` が 0 exit で通ること
    - 型エラーがあれば該当ファイルを修正
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.8_
  - [x] 24.2 `pnpm lint` が 0 exit で通ること
    - ESLint のエラーがあれば該当ファイルを修正
    - _Requirements: 21.1, 21.2_
  - [x] 24.3 `pnpm test` が 0 exit で通り、カバレッジ 70% を維持すること
    - PBT を含む全テストが通ることを確認
    - 70% 閾値を下回っていたらユニットテストを追加
    - _Requirements: テスト戦略（カバレッジ 70%）_
  - [x] 24.4 `pnpm build` が 0 exit で通ること
    - Vite ビルドと TypeScript 宣言出力が両方成功すること
    - _Requirements: 2.6_

- [ ] 25. 最終チェックポイント - 全機能の統合確認
  - すべてのテストが通ること、既存 `/chat/:roomId` UI が無変更であること、`/chanari/:roomId` が新 UI で描画されることを確認
  - 不明点があればユーザーに質問する。

## Notes

- `*` マーク付きのサブタスクはオプションであり、MVP 実装時にはスキップ可能
- 各タスクは Requirements 番号（該当する場合は Property 番号も）を参照しており、トレーサビリティを確保
- チェックポイントで段階的に検証を行い、問題を早期発見する
- Property-Based Tests は `fast-check` を使用し、`fc.constantFrom(...CHAT_ROOM_IDS)` のようにドメインを絞ることで stable に実行できる
- テスト命名は日本語で記述する（プロジェクト規約に準拠）
- pnpm をパッケージマネージャーとして使用
- Vitest + fast-check でプロパティベーステストを実行
- **上下分割方針**: `ChanariChatPage` は既存 `RetroSplitter` を無編集で使い、top slot だけを chanari 専用 UI (`chanari-scope`)、bottom slot は既存 `ChatLogList` を lazy import で再利用する。ログ描画用の新規コンポーネント (`ChanariChatLog` 等) は作成しない
- **UI 飾り扱い**: エフェクト select (27 種) / 文字サイズ select (21 種) / エフェクト無効 / AT フィールドは UI 上には残すが、本 spec ではどの描画コンポーネントにも接続しない（Supabase にも送らない、`ChatLogList` にも渡さない、発言 `<input>` にも適用しない）。これらの state は `ChanariChatRoom` 内のローカル `useState` に閉じる
- **非実装リスト**: `effectToStyle` / `fontSizeToStyle` / `useAtField` / `clearDraft` は本 spec では実装しない（呼び出し箇所が無いため）。必要になった時点で追加する
- 既存 `src/features/chat/` 配下のファイルは一切編集しない（`App.tsx` のみ最小差分を追加する）
- Supabase の `chats` テーブル・`ChatMetadata` 型は一切変更しない（要件 17 / 2.7 / 2.8）
