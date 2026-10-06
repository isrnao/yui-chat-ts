# Implementation Plan: chat-ip-mute

## PR の順序

ストアと絞り込み・編集画面 → ダブルタップと確認 → 演出の順に出す。PR2 で「フィルタ」画面と絞り込みが入り（追加の操作はまだない）、
PR3 でダブルタップから追加できるようになる。PR4 は見た目だけで、取りやめても機能は残る。サーバーと DB は変えない。

| PR  | Task      | 要件              | 種別 | 規模   | 備考                                                        |
| --- | --------- | ----------------- | ---- | ------ | ----------------------------------------------------------- |
| PR1 | —         | —                 | spec | 小     | 本 spec。Q1〜Q4 は決定済み（2026-10-05）                    |
| PR2 | Task 1〜2 | R4 / R5 / R6 / R8 | 機能 | 中     | ストア、絞り込み、Filter_Link、Filter_Panel、下段の切り替え |
| PR3 | Task 3    | R1 / R2 / R3 / R8 | 機能 | 中     | ダブルタップ、確認の窓、振動（iOS は switch）               |
| PR4 | Task 4〜5 | R7                | 演出 | 小〜中 | フィルタを足したときの View Transition、実機の検収          |
| PR5 | Task 6    | R9                | 機能 | 中     | 名前と言葉のフィルタ（2026-10-05 の要望）                   |

## Tasks

- [x] 1. フィルタの一覧（Filter_Store）と絞り込み
  - [x] 1.1 `src/features/chat/utils/ipFilterStore.ts` を作る（`createPersistentStore`、キー `yui-chat-muted-ips`）
    - `isFilterableIp` / `addFilteredIp` / `removeFilteredIp` / `clearFilteredIps`、`parse` で文字列以外・空文字・`*`・重複を捨て末尾 50 件にする
    - _Requirements: 1.7, 6.1, 6.3, 6.4, 6.5, 6.6_
  - [x] 1.2 `src/features/chat/hooks/useIpFilter.ts` を作る（`useSyncExternalStore`）
    - _Requirements: 6.2, 6.6_
  - [x] 1.3 `src/features/chat/utils/ipFilter.ts` の `filterByIp` を作る（順序を保つ、Masked_IP ごとの件数、空集合なら同じ参照、管理人行も隠す）
    - _Requirements: 5.1, 5.2, 5.3, 5.4_
  - [x]\* 1.4 `ipFilterStore.test.ts` と `ipFilter.test.ts`（fast-check で順序と件数の性質）
    - _Requirements: 5.1, 5.2, 6.3, 6.4, 6.5, 8.4_

- [x] 2. 一覧・「フィルタ」リンク・編集画面
  - [x] 2.1 `ChatLogList` に `ipFilter` を足し、`filterByIp` → `slice(windowRows)` にする。`ParticipantsList` には未フィルタのログを渡す。0 件の文言
    - `ipFilter` がないとき（ちゃなり）は従来どおり
    - _Requirements: 5.1, 5.5, 5.6, 5.8_
  - [x] 2.2 `ChatRoom` に `filterCount` / `onToggleFilter` を足し、「細字」の右に Filter_Link を出す
    - _Requirements: 4.1, 4.2, 4.9_
  - [x] 2.3 `components/FilterListDialog` を作る（`ModalShell` のモーダル、おなまえと「IP・件数」の 1 行、解除、すべて解除、空の案内、`aria-label`）
    - 当初は下段に出す `FilterPanel` だったが、2026-10-05 の要望でコンパクトなモーダルに変えた
    - _Requirements: 4.5, 4.6, 4.7, 4.8, 4.9_
  - [x] 2.4 ChatRoute と AllRoomsRoute で `useIpFilter` を呼んで配り、「フィルタ」で `FilterListDialog` を開く。下段（ログとランキングの切り替え）は変えない
    - 「更新」と発言の送信で閉じる、ランキングを開くと閉じる
    - _Requirements: 4.3, 4.4, 4.10, 4.12, 5.7, 7.2, 7.4_
  - [x]\* 2.5 テスト: `ChatLogList`（Filter_List を先に入れた状態で行が消える、`windowRows` はフィルタ後、参加者一覧は変わらない、`ipFilter` なしなら従来どおり）、`ChatRoom`（Filter_Link）、`FilterListDialog`、ChatRoute / AllRoomsRoute でモーダルを開閉
    - _Requirements: 4.1〜4.12, 5.1, 5.5, 5.6, 5.8, 8.4_
  - [x] 2.6 `pnpm typecheck` / `pnpm lint` / `pnpm test`（Compiler_Check を含む）/ `pnpm build:prod` を通す
    - _Requirements: 8.1, 8.3_

- [x] 3. ダブルタップ・確認の窓・振動
  - [x] 3.1 `src/features/chat/hooks/useDoubleTap.ts` を作る（Pointer Events、300ms・24px・タップ中 10px、リンクとボタンの上は数えない、2 本目の指と右ボタンは数えない、2 回目の mousedown を止める）
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.9, 1.10_
  - [x] 3.2 `src/features/chat/utils/haptics.ts` の `tapHaptic` を作る
    - _Requirements: 3.2, 3.3, 3.4_
  - [x] 3.3 `components/FilterConfirmDialog` を作る（`alertdialog`、「やめる」にフォーカス、Esc と背景でやめる、「フィルタする」に透明な `<input type="checkbox" switch>` を重ねる）
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 3.1, 3.3_
  - [x] 3.4 `ChatMessage` に `onFilterIp` を足し、`ChatLogList` が Mutable_Row にだけ渡す。`chat-row-filterable`（`touch-action: manipulation`）。ダブルタップで確認の窓を開き、「フィルタする」で `tapHaptic()` → 通知 → `addFilteredIp(ip)`（View Transition は Task 4 で足す）
    - _Requirements: 1.1, 1.2, 1.7, 1.8, 1.10, 1.11, 2.3, 2.7, 3.2, 3.5, 4.11, 8.2_
  - [x]\* 3.5 テスト: `useDoubleTap.test.tsx`（Fake Timers）、`haptics.test.ts`、`FilterConfirmDialog.test.tsx`、`ChatLogList.test.tsx` にダブルタップの結合テスト（文字の上で反応する、「やめる」で何もしない、「フィルタする」で隠れて振動する、ダブルタップの時点では振動しない、管理人の入退室と巫女の行はフィルタできる、IP が空の行・`*` の行・楽観的な行は反応しない）
    - _Requirements: 1.3, 1.4, 1.5, 1.6, 1.8, 1.9, 2.1〜2.5, 3.1〜3.5, 8.4_
  - [x] 3.6 `pnpm typecheck` / `pnpm lint` / `pnpm test` / `pnpm build:prod` を通す
    - _Requirements: 8.1, 8.3_

- [ ] 4. View Transition
  - [x] 4.1 `runFilterTransition`（`document.startViewTransition` + `flushSync`）を作り、「フィルタする」のあとに使う。見えている行と区切り線に一意の名前を付け（`nameRowsInView`、終わったら外す）、Filter_Link に `filter-link` を付ける。同じ IP の行はフェードアウトし、下の行は上へ詰まる（2026-10-05 の要望）
    - 外部ストアの更新は React の Transition にならないため、`startTransition` + `addTransitionType('mute')` は使わない（design.md「フィルタを足すときの View Transition」）
    - _Requirements: 7.1, 7.3, 7.4, 7.5_
  - [x]\* 4.2 `filterTransition.test.ts`（非対応・対応・動きを減らす設定・省かれたとき）
    - `nameRowsInView` と `prepare` のテストも足す
    - _Requirements: 7.1, 7.5_
  - [ ] 4.3 Chrome で確かめる: 同じ IP の行がフェードアウトし、下の行が上へ詰まる、Filter_Link が脈打つ、root は動かない、発言の到着や Suspense の解決では動かない。結果を design.md に書く
    - _Requirements: 7.1, 7.4_

- [ ] 5. 見た目と検収
  - [x] 5.1 `App.css` に `[data-filter-transition]` の間のアニメーションを足す。タップの間の見た目は入れない
    - _Requirements: 2.6, 7.5_
  - [ ]\* 5.2 Storybook: `FilterListDialog` の 0 / 1 / 3 件、`FilterConfirmDialog`
    - _Requirements: 2.1, 4.5_
  - [ ] 5.3 実機で確かめる
    - iOS Safari 18 以降: ダブルタップで確認の窓、「フィルタする」でハプティックが鳴る、ダブルタップで拡大しない、文字を長押しで選択できる
    - Android Chrome: ダブルタップで確認の窓、「フィルタする」で振動する、文字の上でも反応する、ダブルタップで拡大しない、ピンチで拡大できる、スクロールでは反応しない
    - デスクトップ Chrome / Safari / Firefox: ダブルクリックで確認の窓、単語が選択されない、ドラッグで文字を選択できる、リンクのダブルクリックでは反応しない、キーボードで「フィルタする」「やめる」、Esc、View Transition なしの Firefox
    - `prefers-reduced-motion`
    - _Requirements: 1.3, 1.4, 1.10, 2.2, 2.4, 2.5, 3.1, 3.2, 7.5_
  - [ ] 5.4 1000 行のログで Chrome の Performance パネルを取り、Long Task がないことを確かめる
    - _Requirements: Success Metrics_

- [x] 6. 名前と言葉のフィルタ（Requirement 9）
  - [x] 6.1 `ipFilterStore` を `FilterEntry`（ip / name / word）にし、`filterKey`・`addFilteredName`・`addFilteredWord`・`removeFilter`・`clearFilters` を足す。古い形も読む
    - _Requirements: 9.11_
  - [x] 6.2 `filterByIp` を IP・名前・言葉に広げる（`speakerName`・`normalizeForMatch`・`countWordMatches`）
    - _Requirements: 9.3, 9.7_
  - [x] 6.3 `ChatMessage` に `data-filter-target` を付け、`resolveFilterRequest` で種類を決める。`useDoubleTap` に押した要素と `keepSelectionIn` を足す
    - _Requirements: 9.1, 9.4, 9.8, 9.9_
  - [x] 6.4 `FilterConfirmDialog` を見出しと説明を受け取る形にし、`WordPicker` を足す。`ChatLogList` で 3 種類の確認を出し分ける
    - _Requirements: 9.2, 9.5, 9.6_
  - [x] 6.5 `FilterListDialog` を `entries` で 3 種類に対応させる
    - _Requirements: 9.10_
  - [x]\* 6.6 テスト（ストア・絞り込み・確認の窓・一覧・ChatLogList の結合）と、ヘッドレスの Chrome での確認
    - _Requirements: 9.1〜9.11, 8.4_

- [x] 7. レビューの指摘への対応（PR #167・#169 の Copilot のレビュー、2026-10-06）
  - [x] 7.1 `ModalShell`: body の直下に出して背後を inert にし、Tab を窓の中で回し、Esc を document で受け、閉じたら元の要素へフォーカスを戻す
    - _Requirements: 2.2, 2.4, 4.4_
  - [x] 7.2 `useDoubleTap`: `onPointerMove` で途中の移動を記録し、10px を超えたタップは元の位置に戻しても数えない
    - _Requirements: 1.5_
  - [x] 7.3 requirements.md の Success Metrics の「DOM が同じ」を、発言の内容・順序・見た目が変わらないことに直す
  - [x]\* 7.4 テスト（`ModalShell.test.tsx`、`useDoubleTap` の往復の移動）と、ヘッドレスの Chrome でのキーボード操作の確認
    - _Requirements: 1.5, 2.2, 2.4, 8.4_
