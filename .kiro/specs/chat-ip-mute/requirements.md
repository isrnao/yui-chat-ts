# Requirements Document: chat-ip-mute

## Introduction

チャットログの発言をダブルタップ（ダブルクリック）すると、その発言と同じ伏せ字の IP（`ip_masked`）を持つ発言をすべて非表示にする（フィルタ）。
ダブルタップが成立したらフィルタするかを確認の窓で確かめ、「フィルタする」を押した瞬間に端末を短く震わせる（iOS を含む）。タップの間のアニメーションは出さない。フィルタした
IP は、発言フォームの「細字」チェックボックスの右にある「フィルタ」リンクから確認・解除する。

- **判定には `ip_masked` だけを使う。** クライアントには伏せ字の IP しか届かない（`chatQueries.ts` の
  `SELECT_COLUMNS`）。サーバーに手を入れず、新しい列や RPC も作らない。このため別人が同じ値になることがある
  （IPv4 は `219.*.*.253` のように第 2・第 3 オクテットを伏せ、IPv6 は先頭 16bit だけを残す `2001:*`）。
  利用者が誤って広く隠してもすぐ戻せることを要件にする（Requirement 4）
- **ダブルタップは行のどこでも効く。** 文字の上でも反応する（2026-10-05 に長押しから変更）。長押しは文字の選択や
  リンクのメニューと取り合うため、空白部分でしか使えなかった。リンク・ボタンの上だけは、それぞれの操作を優先して反応しない。
  文字は長押しやドラッグでこれまでどおり選択できる（Requirement 1）
- **フィルタは閲覧者のブラウザの中だけの設定。** サーバーにも他の利用者にも影響しない。発言は消えず、解除すれば
  元どおり表示される。自分の IP をフィルタすると自分の発言も隠れるが、防がない（「フィルタ」から戻せる）
- **React 19.3 の安定版の機能だけを使う。** `<ViewTransition>` の考え方（型で絞る）を引き継ぎ、
  フィルタを足す演出は `document.startViewTransition` を直接使う。Canary にしかない API（`onAnimationCancel` など）には依存しない。依存パッケージは増やさない

既存 spec との関係:

- [`react-2026-refactoring`](../react-2026-refactoring/requirements.md) の方針（外部ストア、純粋なレンダー、
  手書きのメモ化をしない）に従う。設定は既存の Persistent_Store（R9）で保存する。ダブルタップの判定は
  `RetroSplitter` と同じく Pointer Events で作る（R10）
- Filter_Dialog は、確認の窓（Confirm_Dialog）と同じ旧来風のモーダルで出す。下段のログはそのまま（2026-10-05 の要望で、下段に出す形から変えた）
- ログの並び順は Room_Log_Store が保つ（新しい順）。本機能は並べ直さず、取り除くだけにする

## Glossary

- **Target_Page**: 本機能を有効にするページ。通常の部屋（`/chat/<id>/`、ChatRoute）と全部屋まとめ（`/chat/all/`、AllRoomsRoute）
- **Chat_Log_List**: 発言の一覧（`src/features/chat/components/ChatLogList`）
- **Chat_Row**: 一覧の発言 1 行（`ChatMessage`）。行の外枠の要素全体（文字の右の余白を含む）
- **Masked_IP**: 発言の `ip_masked` の値。サーバーの `mask_ip()` が作る表示用の伏せ字
- **Mutable_Row**: フィルタの起点にできる Chat_Row。Requirement 1.7 の条件をすべて満たすもの
- **Interactive_Hit**: 押した位置がリンク・ボタン・フォーム部品の上であること
- **Double_Tap**: Chat_Row の Interactive_Hit でない位置で、Double_Tap_Window 以内に 2 回タップすること。2 回の位置の差は
  Double_Tap_Distance 以内で、1 回のタップの中で Tap_Tolerance を超えて動かさないこと。マウスのダブルクリックも同じに数える
- **Double_Tap_Window**: 1 回目と 2 回目のタップの間に許す時間。300ms
- **Double_Tap_Distance**: 2 回のタップの位置の差として許す距離。24px
- **Tap_Tolerance**: 1 回のタップの中で許す移動量。10px
- **Filter_List**: フィルタしている Masked_IP の一覧。追加した順に並ぶ
- **Filter_Store**: Filter_List を localStorage に保存する外部ストア（Persistent_Store を使う）
- **Filter_Link**: ChatRoom の 4 行目、「細字」チェックボックスの右に置くリンク。「フィルタ」または「フィルタ(N)」
- **Filter_Dialog**: Filter_Link で開く、フィルタの一覧を出すコンパクトなモーダル
- **Confirm_Dialog**: ダブルタップのあとに出す、フィルタするかを確かめる旧来風の小さな窓（`window.confirm` の代わり）
- **Haptic_Switch**: Confirm_Dialog の「フィルタする」ボタンの上に重ねる透明な `<input type="checkbox" switch>`。iOS Safari 18
  以降は、利用者が指で switch を切り替えると本物のハプティックを鳴らす
- **Haptic_Feedback**: 端末の短い振動。iOS は Haptic_Switch、それ以外は `navigator.vibrate()`

## Requirements

### Requirement 1: ダブルタップでフィルタする

**User Story:** 閲覧者として、迷惑な発言の行をダブルタップするだけで、同じ IP からの発言をまとめて見えなくしたい。文字の上を押しても反応してほしい。

#### Acceptance Criteria

1. WHEN 閲覧者が Mutable_Row で Double_Tap を成立させ、Confirm_Dialog（Requirement 2）で「フィルタする」を選んだとき, THE Chat_Log_List SHALL その行の Masked_IP を Filter_List の末尾に追加する
2. WHEN Masked_IP が Filter_List に追加されたとき, THE Chat_Log_List SHALL その Masked_IP と一致する Chat_Row をすべて表示から外す
3. THE Chat_Row SHALL 文字の上・行の余白・アバター画像の上のどこでのダブルタップにも反応する
4. WHEN 閲覧者が Interactive_Hit の位置でタップしたとき, THE Chat_Row SHALL そのタップを数えず、リンクやボタンの操作を妨げない
5. WHEN 1 回のタップの中でポインタが一度でも Tap_Tolerance を超えて動いたか、`pointercancel` が起きたとき, THE Chat_Row SHALL 数え直す（スクロールでは成立しない）。途中で大きく動かしてから押した位置へ戻して離しても、タップにしない
6. WHEN 2 回目のタップが Double_Tap_Window を過ぎてからか、Double_Tap_Distance より離れた位置で起きたとき, THE Chat_Row SHALL 成立させず、それを新しい 1 回目として数える
7. THE Chat_Row SHALL 次のすべてを満たすときだけ Mutable_Row とする
   - Target_Page に表示されている
   - 楽観的な発言（`optimistic`）ではない
   - IP のフィルタは、Masked_IP が空文字でも `*` でもない行だけ（IP が分からない発言をまとめて隠さない）。そうした行も、
     名前と本文のダブルタップ（Requirement 9）には反応する
   - 管理人の入退室メッセージと「巫女」Bot の発言（`system`、`kind` が `admin` / `fortune`）は、呼び出した人のクライアントから
     保存され、その人の IP を持つので起点にできる（2026-10-05 の要望）。Edge Function が書く管理人の発言（機能要求の
     受付返信など）は IP が空なので、IP のフィルタの起点にならない
8. WHERE Chat_Row が Mutable_Row でないとき, THE Chat_Row SHALL ダブルタップに反応しない
9. THE Chat_Row SHALL 2 本目以降の指（`isPrimary` でないポインタ）と、マウスの主ボタン以外のタップを数えない
10. WHERE Chat_Row が Mutable_Row のとき, THE Chat_Row SHALL ダブルタップでの拡大（`touch-action: manipulation`）と、マウスのダブルクリックでの単語の選択を止める。ピンチでの拡大と、長押し・ドラッグでの文字の選択はこれまでどおりできる
11. THE Chat_Row SHALL 入室の前後どちらでもダブルタップでフィルタできる（入室前のログにも Filter_List を適用する）
12. WHEN タッチでダブルタップが成立したとき, THE Chat_Row SHALL その touchend の既定の動作を止め、ブラウザが出す互換用の mousedown / click を出させない（そのクリックが、成立と同時に開いた Confirm_Dialog の背景やボタンに届き、窓がすぐ閉じたり押していないボタンが押されたりしないように。2026-10-05 の不具合）

### Requirement 2: フィルタの確認

**User Story:** 閲覧者として、うっかりダブルタップしても勝手に隠れないよう、フィルタする前に確かめたい。

#### Acceptance Criteria

1. WHEN ダブルタップが成立したとき, THE Chat_Log_List SHALL Confirm_Dialog を出し、見出しに「<Masked_IP> の発言をフィルタ（非表示に）しますか？」、説明に「同じ IP の発言がすべて隠れます。「フィルタ」から解除できます。」を表示する
2. THE Confirm_Dialog SHALL `role="alertdialog"`・`aria-modal="true"` を持ち、見出しと説明を名前と説明に結び付け、開いたときは「やめる」にフォーカスする（うっかり確定しない）。開いている間は窓の外（アプリ本体）を `inert` にして操作もフォーカスもできなくし、Tab / Shift+Tab は窓の中で回す。閉じたら、開く前にフォーカスしていた要素へフォーカスを戻す（その要素がもうないとき、たとえばフィルタで行が消えたときは戻さない）
3. WHEN 閲覧者が「フィルタする」を選んだとき, THE Chat_Log_List SHALL Confirm_Dialog を閉じ、その Masked_IP を Filter_List に追加する（Requirement 1.1）
4. WHEN 閲覧者が「やめる」を押したか、Esc を押したか（フォーカスの位置によらない）、窓の外（背景）を押したとき, THE Chat_Log_List SHALL Confirm_Dialog を閉じ、何も変えない。背景で閉じるのは、背景の上で押し始めたクリックだけにする（窓を開いた操作の続きのクリックでは閉じない）
5. THE Confirm_Dialog SHALL 「フィルタする」をポインタでは Haptic_Switch で、キーボードではボタンそのもので受け付ける。Haptic_Switch はタブ順と支援技術から外す（`tabindex="-1"`・`aria-hidden`）
6. THE Chat_Row SHALL タップの間にアニメーション（背景の変化・縮み・進捗の表示）を出さない（2026-10-05 の決定）
7. THE Chat_Row SHALL タップを数える状態を ref だけに持ち、タップで React の再レンダーを起こさない

### Requirement 3: 振動

**User Story:** スマートフォンの閲覧者として、iPhone でも Android でも、フィルタを決めた瞬間を指で感じたい。

#### Acceptance Criteria

1. WHEN 閲覧者が指で「フィルタする」を押したとき, THE Confirm_Dialog SHALL その指で Haptic_Switch を直接切り替えさせる（スクリプトからの `click()` では iOS が鳴らさないため）。iOS Safari 18 以降ではこれでハプティックが鳴る
2. WHEN 「フィルタする」が選ばれたとき, THE Chat_Log_List SHALL `navigator.vibrate` があれば 1 回だけ短く（15ms）振動させる（Android など）
3. WHERE どちらの振動もできない環境（iOS 17 以前、デスクトップ）のとき, THE Chat_Log_List SHALL 振動以外の動作を変えずにフィルタする。`switch` 属性を知らないブラウザでは Haptic_Switch は普通の checkbox として押せる
4. IF `navigator.vibrate` が例外を投げるか `false` を返したとき, THEN THE Chat_Log_List SHALL それを無視してフィルタを続ける
5. THE Chat_Log_List SHALL ダブルタップの時点では振動させない（振動は決めた瞬間の 1 回だけ）

### Requirement 4: 「フィルタ」リンクと編集画面

**User Story:** 閲覧者として、何を隠しているかを確かめて、間違えたらすぐ戻したい。

#### Acceptance Criteria

1. WHILE 入室している間, THE ChatRoom SHALL 4 行目の「細字」チェックボックスの右に Filter_Link を表示する
2. THE Filter_Link SHALL Filter_List が空なら「フィルタ」、空でなければ件数を付けた「フィルタ(N)」と表示する。文字色は「細字」と同じ黒（親から受け継ぐ）にし、下線を付ける
3. WHEN 閲覧者が Filter_Link を押したとき, THE Target_Page SHALL Filter_Dialog をモーダルで開く（`role="dialog"`・`aria-modal="true"`、見出しは「フィルタ」、1 件以上なら「フィルタ（N）」）。下段のログとランキングの表示は変えない
4. THE Filter_Dialog SHALL 開いたときは「閉じる」（×）にフォーカスし、×・Esc・窓の外（背景）で閉じる。窓の外の `inert`、窓の中での Tab の循環、閉じた後のフォーカスの復帰は Confirm_Dialog と同じ（Requirement 2.2）
5. THE Filter_Dialog SHALL Filter_List の Masked_IP を追加した順に、1 件 1 行で並べる。各行は「おなまえ」を上に、その下に小さく「<Masked_IP>・<現在のログで隠れている発言の数> 件」を、右に「解除」を置く（幅の狭い窓に収める）。「おなまえ」は現在のログで隠れている発言の発言者を新しい順に重複なく並べ、その後ろにフィルタした時点で保存した名前（Requirement 6.7）を重複なく続けて「、」で区切る（管理人の入退室メッセージは本文の入室者の名前、巫女は数えない。どちらにもないときは「—」）。行が多いときは窓の中でスクロールする
6. WHEN 閲覧者が「解除」を押したとき, THE Filter_Dialog SHALL その Masked_IP を Filter_List から取り除く。該当する発言はその場でログに戻る
7. WHERE Filter_List が 2 件以上のとき, THE Filter_Dialog SHALL 「すべて解除」ボタンを出す
8. WHILE Filter_List が空の間, THE Filter_Dialog SHALL 「フィルタしているものはありません。」と表示する（#168 の Copilot Autofix に合わせ、操作の説明は省く）
9. THE Filter_Link と「解除」「すべて解除」「閉じる」 SHALL キーボードで操作でき、「解除」の `aria-label` は「<Masked_IP> のフィルタを解除」とする
10. WHEN 退室したとき, THE Target_Page SHALL Filter_Dialog を閉じる
11. WHEN ダブルタップで Masked_IP が Filter_List に追加されたとき, THE Chat_Log_List SHALL 「<Masked_IP> の発言を非表示にしました。「フィルタ」から解除できます。」を `role="status"` の領域で通知する（画面には出さず、支援技術にだけ伝える）

### Requirement 5: 一覧の表示

**User Story:** 閲覧者として、隠したあとも表示行数の設定どおりに発言を読みたい。

#### Acceptance Criteria

1. THE Chat_Log_List SHALL フィルタした発言を取り除いてから、表示行数（`windowRows`）ぶんを切り出す
2. THE Chat_Log_List SHALL 発言の順序を変えない（Room_Log_Store の新しい順のまま）
3. WHEN Realtime でフィルタ中の Masked_IP の発言が届いたとき, THE Chat_Log_List SHALL それを表示しない
4. THE Chat_Log_List SHALL Masked_IP が一致すれば、管理人の入退室メッセージと巫女の発言も隠す（呼び出した人の IP を持つ）
5. THE Chat_Log_List SHALL 参加者一覧（ParticipantsList）にはフィルタを反映しない（入室状況は隠さない）
6. WHEN フィルタの結果、表示する発言が 0 件になったとき, THE Chat_Log_List SHALL 「表示できる発言はありません（N 件をフィルタ中）。」を出す
7. THE Target_Page SHALL 通常の部屋と全部屋まとめで同じ Filter_List を使う
8. WHERE Target_Page ではないページ（ちゃなりなど）で Chat_Log_List を使うとき, THE Chat_Log_List SHALL フィルタもダブルタップも行わず、本機能を入れる前と同じに動く

### Requirement 6: 保存

**User Story:** 閲覧者として、ページを開き直しても、別の部屋へ移ってもフィルタを続けたい。

#### Acceptance Criteria

1. THE Filter_Store SHALL Filter_List を localStorage に保存し、Target_Page のすべてで共有する
2. WHEN 別のタブで Filter_List が変わったとき, THE Target_Page SHALL その変更を反映する
3. THE Filter_Store SHALL Filter_List を最大 50 件に保ち、超えたときは古いものから捨てる
4. IF 保存値が壊れているか形が違うとき, THEN THE Filter_Store SHALL 文字列以外と空文字・`*`・重複を捨てた一覧として読む
5. WHERE localStorage が使えないとき, THE Filter_Store SHALL そのページの間だけメモリ上で動く
6. THE Target_Page SHALL SSG と hydration の間は Filter_List を空として描画し、hydration の後に保存値へ切り替える（hydration の不一致を起こさない）
7. WHEN Masked_IP を Filter_List に追加するとき, THE Filter_Store SHALL そのときのログでその Masked_IP から発言している「おなまえ」を、IP ごとに新しい順で最大 10 人まで一緒に保存する。同じ IP をもう一度追加したときは、まだない名前だけを前に足す。保存値は `{ ip, names }` の配列で、名前を保存する前の形（IP の文字列の配列）も読める

### Requirement 7: アニメーション（View Transition）

**User Story:** 閲覧者として、何が起きたかを目で追えるようにしたい。

#### Acceptance Criteria

1. WHEN ダブルタップのあと Confirm_Dialog で「フィルタする」を選んだとき, THE Target_Page SHALL 同じ IP の行（見えているもの）をすべてフェードアウトさせながら、下の行を下から上へ詰めるアニメーションを出す。Filter_Link（「フィルタ(N)」）は動かさず、件数はその場で変わる（2026-10-06 の要望）。フィルタの一覧が外部ストアにあり React がその更新を Transition にできないので、`document.startViewTransition` を直接使う（design.md「フィルタを足すときの View Transition」「同じ IP の行がフェードアウトし、下の行が上へ詰まる動き」）
2. THE Filter_Dialog SHALL 開閉にアニメーションを付けない（確認の窓と同じ）
3. THE Target_Page SHALL `view-transition-name` を全 Chat_Row には付けず、Transition の間だけ見えている範囲（画面内とその下 1 画面ぶん）の行と区切り線に付け、終わったら外す（1000 行のログで計測と命名のコストを出さない）。Filter_Link には付けない
4. THE React の `<ViewTransition>` SHALL 既存の `ranking` 以外の型と型なしの更新では何もしない（本機能は React の `<ViewTransition>` を増やさない）。フィルタを足すときの演出の CSS は、その間だけ `<html>` に付ける属性で絞る（発言の到着、ページ読み込み時の Suspense の解決では動かない。ChatRoute の `RANKING_ONLY` と同じ考え方）
5. WHERE ブラウザが View Transitions に対応していないか `prefers-reduced-motion: reduce` のとき, THE Target_Page SHALL アニメーションなしで同じ結果にする

### Requirement 8: 品質

#### Acceptance Criteria

1. THE 実装 SHALL React Compiler でコンパイルでき（Compiler_Check を通る）、`useCallback` / `useMemo` を新たに書かない
2. THE `ChatLogList` / `ChatMessage` の `memo()` SHALL 維持する
3. THE 実装 SHALL 依存パッケージを追加しない
4. THE テスト SHALL Filter_Store、ダブルタップの判定（Fake Timers と Pointer Events）、一覧の絞り込み、Filter_Link と Filter_Dialog を Vitest と Testing Library で確かめる

### Requirement 9: 名前と言葉のフィルタ

**User Story:** 閲覧者として、IP だけでなく、特定の名前の人や、特定の言葉を含む発言も隠したい（2026-10-05 の要望）。

#### Acceptance Criteria

1. THE Chat_Row SHALL ダブルタップした場所でフィルタの種類を決める。名前 → 名前のフィルタ、本文 → 言葉のフィルタ、それ以外（時刻・IP・余白・アバター） → IP のフィルタ（Requirement 1）
2. WHEN 名前をダブルタップしたとき, THE Chat_Log_List SHALL 「「<名前>」の発言をフィルタ（非表示に）しますか？」の Confirm_Dialog を出し、「フィルタする」でその名前を Filter_List に追加する
3. THE 名前のフィルタ SHALL 発言者の名前が完全に一致する発言と、管理人の入退室メッセージのうち入室者の名前が一致するものを隠す（IP が違っても隠す）
4. WHERE 管理人の入退室メッセージのとき, THE Chat_Row SHALL 本文の入室者の名前を名前のフィルタの起点にする。「巫女」の名前は呼び出した人の名前ではないので名前のフィルタにせず、IP のフィルタにする
5. WHEN 本文をダブルタップしたとき, THE Chat_Log_List SHALL 言葉を選ぶ Confirm_Dialog を出す。発言の全文を枠に出し、その中を範囲選択すると「非表示にする言葉」の入力欄に入る。入力欄で直接書き換えてもよい。パソコンのダブルクリックでブラウザが選んだ文字があれば、それを最初の値にする
6. THE 言葉を選ぶ Confirm_Dialog SHALL 今のログでその言葉を含む発言の数を出し、言葉が空のうちは「フィルタする」を押せなくする。Enter でも「フィルタする」
7. THE 言葉のフィルタ SHALL 本文がその言葉を含む発言を隠す。全角と半角（NFKC）、英字の大文字と小文字を区別しない。管理人の入退室メッセージ（定型文）には当てない。言葉は前後の空白を除き、50 文字まで
8. WHILE 本文の上でマウスのダブルクリックをするとき, THE Chat_Row SHALL 単語の選択を止めない（選ばれた文字を言葉の最初の値に使う）。名前とそれ以外では、これまでどおり止める
9. WHERE IP が分からない行（空文字・`*`）のとき, THE Chat_Row SHALL 名前と本文のダブルタップには反応し、それ以外のダブルタップでは何もしない
10. THE Filter_Dialog SHALL IP・名前・言葉を追加した順に並べる。名前の行は名前を見出しに「名前・<N> 件」、言葉の行は「「<言葉>」」を見出しに「言葉・<N> 件」を出す。解除の `aria-label` は「名前「<名前>」のフィルタを解除」「言葉「<言葉>」のフィルタを解除」
11. THE Filter_Store SHALL 名前と言葉も同じ一覧（最大 50 件、3 種類の合計）に `{ kind: 'name', name }` / `{ kind: 'word', word }` で保存する。種類を持たない以前の形（IP の文字列、`{ ip, names }`）は IP として読む

## Non-Goals

- 正確な IP によるフィルタ（サーバー側の RPC やハッシュ列）。必要になったら別 spec にする
- フィルタの対象をトリップ・UA にすること、Filter_Dialog から IP や名前を手入力で足すこと
- 言葉のフィルタの正規表現・単語単位の一致・複数の言葉の AND
- 発言そのものの削除や通報、他の利用者への影響
- 参加者一覧・ランキング・look の効果音にフィルタを反映すること
- キーボードだけでフィルタを**追加**する操作（解除は Requirement 4.9 でキーボード操作できる）。全行をフォーカス可能に
  するとタブ順が壊れるため、v1 では入れない
- ちゃなり（`/chanari/<id>/`）とツーショットチャット（`/chat/2shot/`）。フォームの部品が別で、「細字」の位置も違う
- 入室前に Filter_Dialog を開くこと（Filter_Link は入室後のフォームにしかない。入室前もフィルタ自体は効く）
- Canary 限定の API（`onAnimationCancel`、Fragment Refs の拡張など）

## Success Metrics

- 「フィルタする」を押してからフィルタの反映（行が消える）まで、View Transition を除いて 1 フレーム以内
- 1000 行のログでフィルタを追加したとき、Long Task（50ms 超）を出さない
- Filter_List が空のとき、表示される発言の内容・順序・見た目（既存のレイアウト）が本機能を入れる前と変わらない。フィルタできる行に付くクラスと `data-*` 属性、読み上げ用の通知領域（`role="status"`、画面には出ない）は除く
