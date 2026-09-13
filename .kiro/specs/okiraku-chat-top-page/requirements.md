# Requirements Document

## Introduction

`yui-chat-ts` プロジェクトの公開URL (https://isrnao.github.io/yui-chat-ts/) を、従来のチャット機能画面から「お気楽チャット」レガシーサイト (`docs/お気楽チャット - チャットで友達探し＆仲間作り.htm` / web.archive.org 保存版) と同じ見た目を持つ新しいトップページに置き換える。既存のチャット機能 (`EntryForm` / `ChatRoom` / `ChatLogList` 等) は別サイト (https://isrnao.github.io/superbeginner/) へ移動する前提で、本トップページからはその外部URLへのリンクとして導線を提供する。

トップページはレガシーサイトの HTML 構造・情報密度・セクション構成・ナビゲーション階層・フッター構成を忠実に再現しつつ、React 19 + TypeScript + Tailwind CSS v4 によりモダンに実装する。インラインスタイルや `<table>` レイアウトは用いず、セマンティック HTML と CSS Grid/Flexbox による 3 カラムレイアウトで同等の視覚を実現する。

本要件は新規トップページ (`TopPage`) の追加と、`App.tsx` 上のルーティング切り替えを対象とする。既存のチャット実装ファイル自体の削除や移管作業は本仕様のスコープ外とする。

## Glossary

- **TopPage**: 本仕様で新規追加する React コンポーネント。レガシーお気楽チャットトップページの見た目と情報構成を再現する単一ページ。
- **Legacy_Reference_HTML**: `yui-chat-ts/docs/お気楽チャット - チャットで友達探し＆仲間作り.htm` に保存されたレガシーサイトの HTML ソース。視覚・構成の正本として参照する。
- **Header_Region**: サイトロゴ (`お気楽チャット`) とガイドメニュー (`FAQ` 等 5 リンク) およびプライマリ/タブナビゲーションを含むページ上部領域。
- **Guide_Menu**: Header_Region 内の 5 リンクリスト (チャットのFAQ, チャットの使い方, チャットのルール・マナー, プロフィール作成, コンタクト)。
- **Primary_Nav**: Header_Region 内の 9 項目ナビゲーション (チャット, ランキング, プロフィール, 動画, 荒らし対策, モバイルチャット, リンク集, オフ会, 管理人より)。
- **Tab_Nav**: Header_Region 内の 7 項目タブ (チャット, 中学生チャット, 小学生チャット, 高校生チャット, 大学生チャット, 社会人チャット, なりきりチャット)。
- **Welcome_Section**: ページタイトル (`お気楽チャット - チャットで友達探し＆仲間作り`) とウェルカムメッセージ段落を含むセクション。
- **Chat_Directory_Sidebar**: ページ左カラム。`初心者チャット` `学生チャット` `年代別チャット` `メルヘンチャット` `アニメルーム` `地域別ルーム` `趣味別ルーム` `オフ会ルーム` `歴史的チャット` の 9 ブロックから成るチャットルーム一覧。
- **Chat_Pickup_Main**: ページ中央カラム。`チャットの最新情報` と 6 つのピックアップチャットブロック (中学生 / 小学生 / 高校生 / なりきり / 大学生 / 社会人) および `チャットのプロフィールを作成しよう！` セクションを含む。
- **Side_Content_Panel**: ページ右カラム。`@chat_aのつぶやき` `つぶやき／ブックマーク` `詩集／待ち合わせ／壁紙` `特設コーナー` `応援してくれる方／ご協力者の方へ` `チャットのルール・マナー` `チャットの使い方` から成る。
- **Community_Block**: ピックアップコミュニティ 4 項目を並べる横並びセクション (プロフィール作成 / 美人チャット / オフ会ならC-Dream / 動画)。
- **Footer_Region**: `チャット` `中学生/小学生/高校生/大学生/社会人チャット` `なりきり/プロフィール` `オフ会` の 4 ブロックと Copyright (`©1997-2012`) および Yahoo カテゴリリンクを含むページ下部領域。
- **Chat_Room_Entry**: Chat_Directory_Sidebar もしくは Chat_Pickup_Main 内の個別チャットルーム 1 行を指す。ルーム名のリンクと人数バッジから成る。
- **Room_User_Count_Badge**: 各 Chat_Room_Entry の末尾に表示される参加人数バッジ。レガシーでは `<span class="uspf0">0人</span>` 等の静的値で示される。
- **Superbeginner_URL**: 移管先の超初心者チャット URL (`https://isrnao.github.io/superbeginner/`)。
- **External_Link**: 自ドメイン外へ遷移するリンク。新規タブで開き `rel="noopener noreferrer"` を付与する対象。
- **Viewport_Desktop**: CSS メディアクエリ上で幅 1024px 以上と定義するレイアウト条件。
- **Viewport_Tablet**: 幅 768px 以上 1024px 未満と定義するレイアウト条件。
- **Viewport_Mobile**: 幅 768px 未満と定義するレイアウト条件。

## Requirements

### Requirement 1: トップページのルーティング

**User Story:** As サイト訪問者, I want `https://isrnao.github.io/yui-chat-ts/` にアクセスした直後に新しいお気楽チャット風トップページを見る, so that レガシーサイトの雰囲気でサイトの全体像を把握できる。

#### Acceptance Criteria

1. WHEN ユーザーがルートパス `/` を開く, THE TopPage SHALL 単一ページとしてレンダリングされる。
2. THE TopPage SHALL 既存のチャット機能 (`ChatRoom` `EntryForm` `ChatLogList` `ChatRanking`) を同一 DOM 上に同時表示しない。
3. WHERE URL パスが `/chat` である, THE TopPage SHALL 非表示となり、代わりに既存のチャット UI へのリンクまたは外部移管先 (Superbeginner_URL) へのリンクを提供する。
4. IF TopPage のレンダリング中に未捕捉の例外が発生する, THEN THE TopPage SHALL フォールバック UI として「ページを表示できませんでした」メッセージと再読み込みボタンを表示する。

### Requirement 2: ヘッダー領域の再現

**User Story:** As サイト訪問者, I want レガシーサイトと同じ位置にロゴ・ガイドメニュー・ナビゲーションが並ぶヘッダーを見る, so that 見慣れたレイアウトで目的のセクションに到達できる。

#### Acceptance Criteria

1. THE Header_Region SHALL サイトタイトル `お気楽チャット - チャットで友達探し＆仲間作り` をページ最上部に `<h1>` として表示する。
2. THE Header_Region SHALL Guide_Menu として、Legacy_Reference_HTML の `#guide-menu` と同順の 5 項目 (`チャットのFAQ・よくある質問`, `チャットの使い方`, `チャットのルール・マナー`, `プロフィール作成`, `コンタクト`) をリンクリストとして表示する。
3. THE Header_Region SHALL Primary_Nav として、Legacy_Reference_HTML の `#navi-must` と同順の 9 項目 (`チャット`, `ランキング`, `プロフィール`, `動画`, `荒らし対策`, `モバイルチャット`, `リンク集`, `オフ会`, `管理人より`) をリンクリストとして表示する。
4. THE Header_Region SHALL Tab_Nav として、Legacy_Reference_HTML の `#navi` と同順の 7 項目 (`チャット`, `中学生チャット`, `小学生チャット`, `高校生チャット`, `大学生チャット`, `社会人チャット`, `なりきりチャット`) をタブ風リンクリストとして表示する。
5. WHEN Primary_Nav または Tab_Nav の `チャット` 項目が現在ページに対応する, THE Header_Region SHALL 当該項目に `aria-current="page"` 属性と視覚的な選択状態スタイルを付与する。
6. THE Header_Region SHALL 各リンクが Viewport_Desktop において 1 行横並びで表示されるレイアウトを適用する。
7. WHERE Viewport_Mobile が適用される, THE Header_Region SHALL Guide_Menu / Primary_Nav / Tab_Nav を折返し表示し、水平スクロールを発生させない。
8. IF リンク先 URL が未確定のガイドメニュー・ナビゲーション項目である, THEN THE Header_Region SHALL その `href` を Legacy_Reference_HTML に記載された旧 URL (`https://www.okiraku-chat.com/...`) にフォールバック設定し External_Link として扱う。

### Requirement 3: ウェルカムセクション

**User Story:** As サイト訪問者, I want ページ上部でサイトのコンセプト説明を読む, so that 初回訪問時にサイトの目的をすぐ理解できる。

#### Acceptance Criteria

1. THE Welcome_Section SHALL `お気楽チャット - チャットで友達探し＆仲間作り` を `<h2>` として表示する。
2. THE Welcome_Section SHALL Legacy_Reference_HTML の `#welcome-message` と同一の 2 段落テキスト (「お気楽チャットは、夢と希望を持って気楽に楽しめる…」から始まる文章) を改行位置まで含めて表示する。
3. THE Welcome_Section SHALL 段落中の語 `チャット` を Legacy_Reference_HTML と同位置で `<strong>` として強調する。

### Requirement 4: 左カラム (チャットディレクトリ) の再現

**User Story:** As サイト訪問者, I want 左カラムで全ジャンルのチャットルーム一覧を見る, so that 目的のルームを素早く選択できる。

#### Acceptance Criteria

1. THE Chat_Directory_Sidebar SHALL Legacy_Reference_HTML に存在する 9 個のブロック (`初心者チャット`, `学生チャット`, `年代別チャット`, `メルヘンチャット`, `アニメルーム`, `地域別ルーム`, `趣味別ルーム`, `オフ会ルーム`, `歴史的チャット`) を記載順に表示する。
2. THE Chat_Directory_Sidebar SHALL 各ブロックに `<h3>` 見出しとキャッチコピー段落 (例: `常連さんはやさしくしてね`) を Legacy_Reference_HTML と同一文字列で表示する。
3. THE Chat_Directory_Sidebar SHALL 各ブロック内の Chat_Room_Entry について、Legacy_Reference_HTML に登場する全ルーム名・順序・リンク先 URL を保持する。
4. THE Chat_Directory_Sidebar SHALL 各 Chat_Room_Entry の末尾に Room_User_Count_Badge を表示する。
5. WHEN Chat_Directory_Sidebar の「初心者チャット」ブロックを表示する, THE Chat_Directory_Sidebar SHALL 先頭項目 `超初心者チャット` のリンク先を Superbeginner_URL に設定する。
6. THE Chat_Directory_Sidebar SHALL 各 Chat_Room_Entry のリンクを External_Link として扱い、`target="_blank"` と `rel="noopener noreferrer"` を付与する。
7. WHERE Viewport_Desktop が適用される, THE Chat_Directory_Sidebar SHALL ページ左端に固定幅 (目安 220-260px) の縦長カラムとして配置される。
8. WHERE Viewport_Mobile が適用される, THE Chat_Directory_Sidebar SHALL 全幅 1 カラムに変形し、Chat_Pickup_Main の下に配置される。

### Requirement 5: 中央カラム (注目のチャット・ピックアップ) の再現

**User Story:** As サイト訪問者, I want 中央カラムで新着ログと各学年・ジャンルの注目ルームを見る, so that 今盛り上がっているチャットを発見できる。

#### Acceptance Criteria

1. THE Chat_Pickup_Main SHALL 見出し `注目のチャット ピックアップ` を `<h2>` として表示する。
2. THE Chat_Pickup_Main SHALL サブセクション `チャットの最新情報` を `<h3>` として表示し、その直下に入室ログ項目リスト (ルーム名リンク + ユーザー名テキスト + 日時) を表示する。
3. THE Chat_Pickup_Main SHALL 入室ログ項目を 10 件まで静的データとして表示する (Legacy_Reference_HTML 同件数)。
4. THE Chat_Pickup_Main SHALL Legacy_Reference_HTML のピックアップブロックを同順で 6 件表示する: `中学生チャット`, `小学生チャット`, `高校生チャット`, `なりきりチャット`, `大学生チャット`, `社会人チャット`。
5. THE Chat_Pickup_Main SHALL 各ピックアップブロックに `<h3>` 見出し、キャッチコピー段落、ルームリンクリスト、そして末尾の `<詳しく見る>` リンクを表示する。
6. THE Chat_Pickup_Main SHALL `なりきりチャット` ブロック内のルームリンクリストについて、Legacy_Reference_HTML に登場する全 20 項目を同順で表示する。
7. THE Chat_Pickup_Main SHALL セクション `チャットのプロフィールを作成しよう！` を `<h2>` として表示し、Vururu 連携の説明文とサンプルプロフィール 16 件 (4 行 × 4 列) の顔写真グリッドを表示する。
8. IF サンプルプロフィール画像の取得に失敗する, THEN THE Chat_Pickup_Main SHALL `alt` テキストのみで項目を表示し、壊れた画像アイコンを抑止する。
9. WHERE Viewport_Tablet もしくは Viewport_Desktop が適用される, THE Chat_Pickup_Main SHALL 3 カラムレイアウトの中央カラムとして Chat_Directory_Sidebar と Side_Content_Panel の間に配置される。

### Requirement 6: 右カラム (サイドコンテンツ) の再現

**User Story:** As サイト訪問者, I want 右カラムで SNS 連携や掲示板・使い方ガイドを見る, so that メインコンテンツ以外の補足情報にも到達できる。

#### Acceptance Criteria

1. THE Side_Content_Panel SHALL Legacy_Reference_HTML の順序で以下 7 つのブロックを表示する: `@chat_aのつぶやき`, `つぶやき／ブックマーク`, `詩集／待ち合わせ／壁紙`, `特設コーナー`, `応援してくれる方／ご協力者の方へ`, `チャットのルール・マナー`, `チャットの使い方`。
2. THE Side_Content_Panel SHALL `@chat_aのつぶやき` ブロックにプレースホルダー項目 (例: `ツイート読み込み中…`) を最低 1 件表示し、外部 Twitter 埋め込みスクリプトを読み込まない。
3. THE Side_Content_Panel SHALL `つぶやき／ブックマーク` ブロックに Twitter 共有リンク, Facebook 共有リンク, はてなブックマーク追加リンクを、それぞれ現行の各サービス公式共有 URL 形式 (`intent/tweet`, `sharer.php`, `b.hatena.ne.jp/entry/...`) で生成して設置する。
4. THE Side_Content_Panel SHALL `詩集／待ち合わせ／壁紙` ブロックにレガシーと同名の 2 リンク (`お気楽チャット詩集掲示板`, `チャット待ち合わせ掲示板`) を表示する。
5. THE Side_Content_Panel SHALL `応援してくれる方／ご協力者の方へ` ブロックに `<textarea>` を配置し、初期値としてサイト紹介用 HTML スニペット (`<a href="https://isrnao.github.io/yui-chat-ts/" target="_blank">お気楽チャット - チャットで友達探し＆仲間作り</a>`) を設定する。
6. WHEN ユーザーが当該 `<textarea>` をクリックまたはフォーカスする, THE Side_Content_Panel SHALL テキスト全選択状態にする。
7. THE Side_Content_Panel SHALL `チャットのルール・マナー` ブロックに Legacy_Reference_HTML と同一文言の 5 箇条 (`お初さんを歓迎しましょう。` 他) をリスト表示する。
8. THE Side_Content_Panel SHALL `チャットの使い方` ブロックに Legacy_Reference_HTML と同一文言の 6 箇条 (`チャットに関する設定は全てココから！` 他) をリスト表示する。
9. THE Side_Content_Panel SHALL レガシーサイトに存在した Google AdSense 広告枠 (`gad336x280`) を新サイトでは描画しない。

### Requirement 7: コミュニティーブロックの再現

**User Story:** As サイト訪問者, I want 3 カラム領域の下に関連コミュニティへの横並び導線を見る, so that サイト外の関連サービスに移動できる。

#### Acceptance Criteria

1. THE Community_Block SHALL 見出し `コミュニティー` を `<h2>` として表示する。
2. THE Community_Block SHALL 以下 4 項目をカード形式で左から順に表示する: `プロフィール作成`, `美人チャット`, `オフ会ならC-Dream`, `頼むから重力に従ってくれ`。
3. THE Community_Block SHALL 各カードに見出し `<h3>`, サムネイル画像, 説明段落を表示する。
4. WHERE Viewport_Desktop が適用される, THE Community_Block SHALL 4 カード横並びレイアウトで表示する。
5. WHERE Viewport_Mobile が適用される, THE Community_Block SHALL 1 列縦積みレイアウトに変形する。

### Requirement 8: フッター領域の再現

**User Story:** As サイト訪問者, I want ページ下部でフッターリンクとコピーライトを見る, so that 主要カテゴリへ再度アクセスでき、運営元情報を確認できる。

#### Acceptance Criteria

1. THE Footer_Region SHALL Legacy_Reference_HTML と同順の 4 ブロックを横並びで表示する: `チャット`, `中学生/小学生/高校生/大学生/社会人チャット`, `なりきりチャット/プロフィール`, `オフ会`。
2. THE Footer_Region SHALL 各ブロックに Legacy_Reference_HTML と同一のリンク項目 (例: `チャットのルール・マナー`, `＠中学生チャット`, `なりきりチャット チャナリ`, `オフ会ならC-Dream` 等) を同順で表示する。
3. THE Footer_Region SHALL コピーライト文字列 `©1997-2012 チャットならお気楽チャット.` を表示する。
4. THE Footer_Region SHALL Yahoo カテゴリリンク `お気楽チャットはYahooカテゴリーに登録されています` を External_Link として表示する。
5. WHERE Viewport_Mobile が適用される, THE Footer_Region SHALL フッターブロックを 1 列縦積みで表示する。

### Requirement 9: レガシービジュアルの忠実再現

**User Story:** As サイト訪問者, I want レガシーサイトの配色・余白・フォント印象をモダン実装で受け取る, so that 2000 年代チャットサイトの雰囲気をそのまま体験できる。

#### Acceptance Criteria

1. THE TopPage SHALL 背景色・見出し配色・リンク色について Legacy_Reference_HTML 由来の配色 (背景白系、見出しオレンジ/緑、リンク青系) を CSS カスタムプロパティとして定義し、ページ全体に適用する。
2. THE TopPage SHALL 各セクション見出し `<h3>` を Legacy_Reference_HTML と同等の枠線付きバッジ風スタイル (左端ライン付き、薄背景色、小さめ太字) で描画する。
3. THE TopPage SHALL ユーザー数バッジ (`uspf0` / `uspf1` / `uspf2` / `uspf3` / `acu0`) を Legacy_Reference_HTML と同色系 (人数 0 は灰色、1-3 は緑系、4 以上はオレンジ系) で表示する。
4. THE TopPage SHALL Viewport_Desktop で 3 カラムレイアウト (左固定, 中央可変, 右固定) を CSS Grid もしくは Flexbox で構築し、`<table>` レイアウトを用いない。
5. THE TopPage SHALL Viewport_Desktop におけるコンテンツ最大幅を 960-1100px の範囲に制限し、画面中央寄せで表示する。
6. WHEN ユーザーが任意のリンクにポインタを合わせる, THE TopPage SHALL ホバー状態として下線またはテキスト色変更を即時適用する。
7. THE TopPage SHALL Flash (SWF) 埋め込みや `web.archive.org` 経由のスクリプトを一切ロードしない。

### Requirement 10: レスポンシブ対応

**User Story:** As モバイル端末利用者, I want スマートフォンでも全情報に到達できるレイアウトでトップページを見る, so that デバイスを問わずサイトを利用できる。

#### Acceptance Criteria

1. WHERE Viewport_Mobile が適用される, THE TopPage SHALL 3 カラムを 1 カラムの縦積みに再編成し、並び順を `Welcome_Section` → `Chat_Pickup_Main` → `Chat_Directory_Sidebar` → `Side_Content_Panel` → `Community_Block` → `Footer_Region` とする。
2. WHERE Viewport_Tablet が適用される, THE TopPage SHALL 2 カラムレイアウト (左: Chat_Directory_Sidebar, 右: Chat_Pickup_Main) を適用し、Side_Content_Panel は Chat_Pickup_Main の下に回り込ませる。
3. THE TopPage SHALL Viewport_Mobile において横方向スクロールバーを発生させない。
4. THE TopPage SHALL Viewport_Mobile においてタップ可能要素の最小サイズを 44x44 CSS ピクセル以上とする。

### Requirement 11: アクセシビリティ

**User Story:** As 支援技術利用者, I want セマンティックなランドマーク構造と適切なテキスト代替でトップページを読み取る, so that スクリーンリーダーやキーボード操作のみでも情報を把握できる。

#### Acceptance Criteria

1. THE TopPage SHALL `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>` ランドマーク要素で主要領域を囲う。
2. THE TopPage SHALL Primary_Nav と Tab_Nav の `<nav>` 要素にそれぞれ `aria-label` を付与し、内容を識別可能にする。
3. THE TopPage SHALL 画像 `<img>` 要素すべてに `alt` 属性を付与する (装飾目的画像は `alt=""`, 意味を持つ画像は内容を表す文字列)。
4. WHEN ユーザーが `Tab` キーでページ内を移動する, THE TopPage SHALL 視覚的フォーカスインジケータを 3:1 以上のコントラスト比で表示する。
5. THE TopPage SHALL 本文テキストと背景色のコントラスト比を 4.5:1 以上に保つ。
6. THE TopPage SHALL 見出しレベル `<h1>` → `<h2>` → `<h3>` を飛ばさずに階層化する。
7. THE TopPage SHALL 自動再生される音声または動画を含まない。

### Requirement 12: SEO とメタデータ

**User Story:** As サイト運営者, I want トップページが検索エンジンに正しくインデックスされる, so that 新訪問者の流入を得られる。

#### Acceptance Criteria

1. THE TopPage SHALL `<title>` を `お気楽チャット - チャットで友達探し＆仲間作り | ゆいちゃっとTS` に設定する。
2. THE TopPage SHALL `<meta name="description">` に 120 文字以内のサイト紹介文 (Legacy_Reference_HTML の meta description を要約したもの) を設定する。
3. THE TopPage SHALL Legacy_Reference_HTML と同様に `<meta name="keywords">` を設定し、最低でも `チャット` と `お気楽チャット` を含める。
4. THE TopPage SHALL `<link rel="canonical">` を `https://isrnao.github.io/yui-chat-ts/` に設定する。
5. THE TopPage SHALL Open Graph メタタグ (`og:title`, `og:description`, `og:type`, `og:url`) を設定する。
6. THE TopPage SHALL 既存プロジェクトの `useSEO` フックを利用し、重複 `<meta>` タグを生成しない。

### Requirement 13: 外部リンクと安全性

**User Story:** As サイト訪問者, I want 外部チャットサイトへのリンクを安全に新規タブで開く, so that 本トップページのナビゲーション状態を失わない。

#### Acceptance Criteria

1. THE TopPage SHALL 自ドメイン (`isrnao.github.io`) 以外へのリンクすべてに `target="_blank"` と `rel="noopener noreferrer"` を付与する。
2. THE TopPage SHALL Superbeginner_URL へのリンクを External_Link として扱い、同様の属性を付与する。
3. IF 外部 URL が `http://` スキームのレガシー URL である, THEN THE TopPage SHALL 該当リンクを `https://` が存在する場合は `https://` に書き換え、存在しない場合は `http://` のまま設置しつつ、視覚的にはリンク色をそのまま保つ。
4. THE TopPage SHALL `web.archive.org/web/...` で始まるアーカイブ経由 URL を外部リンクとして使用しない。

### Requirement 14: 静的データの管理

**User Story:** As プロジェクトメンテナ, I want チャットルーム一覧・ピックアップ・入室ログなどの繰り返し要素をデータ駆動で管理する, so that 将来の追加・変更を少ないコードで反映できる。

#### Acceptance Criteria

1. THE TopPage SHALL Chat_Directory_Sidebar の各ブロックを型付きデータ配列 (例: `ChatCategoryBlock[]`) として定義し、JSX 本体ではその配列を反復描画する。
2. THE TopPage SHALL Chat_Pickup_Main の 6 ピックアップブロックを型付きデータ配列として定義し、JSX 本体ではその配列を反復描画する。
3. THE TopPage SHALL 各データ配列の要素に少なくとも `id` (もしくはユニークキーとなる文字列), `label`, `href`, `userCount` (nullable) を含める。
4. IF データ配列に重複する `id` が存在する, THEN THE TopPage SHALL 開発環境のコンソールに警告を出力し、React の `key` 重複エラーを回避する一意キー付与でフォールバックする。
5. THE TopPage SHALL 各データ定義を独立した TypeScript モジュール (例: `src/features/top/data/*.ts`) に配置し、JSX コンポーネントと分離する。

### Requirement 15: パフォーマンス

**User Story:** As 初回訪問者, I want トップページが軽快に表示される, so that 情報量が多くても待たされずに閲覧できる。

#### Acceptance Criteria

1. WHEN ユーザーがトップページを初回ロードする, THE TopPage SHALL Largest Contentful Paint を 2.5 秒以内 (ローカル開発ビルドの `vite preview` + ローカルホスト計測) に完了する。
2. THE TopPage SHALL プロフィールサムネイル画像に `loading="lazy"` 属性を付与する。
3. THE TopPage SHALL レガシーサイトで読み込まれていた広告スクリプト (`show_ads.js` 等) および解析スクリプト (`urchin.js`) をロードしない。
4. THE TopPage SHALL 画像・アイコンリソースをビルド時に `dist/` 配下へバンドルし、外部 CDN への実行時フェッチに依存しない。

### Requirement 16: 既存チャット機能との共存と移管導線

**User Story:** As サイト運営者, I want トップページと既存チャット機能が同一デプロイ内で衝突せず、利用者が移管先 Superbeginner_URL に到達できる, so that 段階的に移行しても導線が切れない。

#### Acceptance Criteria

1. THE TopPage SHALL 超初心者チャットを示す主要導線 (`Chat_Directory_Sidebar` の先頭項目および任意のヒーロー CTA 1 箇所) から Superbeginner_URL に誘導する。
2. THE TopPage SHALL 既存の `ChatRoom` `EntryForm` コンポーネントをルートパス `/` 表示時に import しない。
3. WHERE 環境変数 `VITE_ENABLE_LEGACY_CHAT_ROUTE` が `"true"` である, THE TopPage SHALL パス `/chat` で既存チャット UI をレンダリングする代替ルートを維持する。
4. WHERE 上記環境変数が未設定または `"false"` である, THE TopPage SHALL パス `/chat` へのアクセスをトップページにフォールバック表示する。
5. THE TopPage SHALL 移管告知バナーとして、ページ先頭に `超初心者チャットは https://isrnao.github.io/superbeginner/ へ移動しました。` の文言を 1 回表示し、閉じるボタンで非表示化できる。
6. WHEN ユーザーが移管告知バナーの閉じるボタンを押下する, THE TopPage SHALL `localStorage` にフラグを保存し、以降の再訪問時に当該バナーを再表示しない。

### Requirement 17: テスト容易性

**User Story:** As 開発者, I want トップページの構造とデータ整合を自動テストで保証する, so that レガシーサイトとの差分を早期に検知できる。

#### Acceptance Criteria

1. THE TopPage SHALL Chat_Directory_Sidebar / Chat_Pickup_Main / Footer_Region の描画結果を `data-testid` または見出しテキストで特定可能にする。
2. THE TopPage SHALL 静的データ配列の全項目に対し、`id` が一意であること・`label` が空文字列でないこと・`href` が `https?://` で始まるか相対パスであることを検証するユーティリティ関数を公開する。
3. WHEN 上記ユーティリティ関数が不正データを検出する, THE TopPage SHALL `Error` を throw し、エラーメッセージに対象 `id` を含める。
4. THE TopPage SHALL 静的データ配列の並び順が Legacy_Reference_HTML 記載順と一致するかを検証する例示テストケースを最低 1 件提供する。
