# Requirements Document

## Introduction

ゆいちゃっとTS（yui-chat-ts）に、オリジナルのYuiChat-Pro/yuichat2 CGIチャットが持っていたレトロ機能群を移植する。対象は7つの機能：設定永続化、URL自動リンク化、フォントスタイル変更、こっそり入室、アバター選択、おみくじ、lookコマンド（音声通知）。これらの機能により、オリジナルCGIチャットの楽しさと利便性をモダンなReact+TypeScript+Supabase環境で再現する。

## Glossary

- **Chat_App**: ゆいちゃっとTS（yui-chat-ts）アプリケーション全体
- **Entry_Form**: チャットルームへの入室前に表示されるフォームコンポーネント
- **Chat_Room**: 入室後のメッセージ送信・表示を行うコンポーネント
- **Chat_Message**: チャットログ内の個別メッセージ表示コンポーネント
- **Settings_Store**: localStorageを利用したユーザー設定の永続化モジュール
- **URL_Linker**: メッセージ内のURLを検出しクリッカブルリンクに変換するモジュール
- **Font_Style_Mode**: フォントスタイル変更モード。フォントサイズ・色・太字をメッセージ単位で指定できる拡張入力モード
- **Silent_Entry**: こっそり入室。入室システムメッセージを投稿せずにチャットルームに参加する機能
- **Avatar_Selector**: 入室フォームでキャラクターアイコンを選択するUIコンポーネント
- **Fortune_Bot**: おみくじ機能。「おみくじ」メッセージに対してランダムな運勢メッセージを返すクライアントサイドボット
- **Look_Command**: lookコマンド。全参加者に通知音を再生させる音声通知機能
- **Web_Audio_Player**: Web Audio APIを利用した音声再生モジュール

## Requirements

### Requirement 1: 設定永続化（localStorage）

**User Story:** ユーザーとして、入室時に設定した名前・色・メールアドレス・ログ行数を次回アクセス時にも保持したい。毎回入力し直す手間を省くため。

#### Acceptance Criteria

1. WHEN ユーザーがEntry_Formで名前・色・メールアドレス・ログ行数を入力して入室する, THE Settings_Store SHALL 入力値をlocalStorageに保存する
2. WHEN ユーザーがChat_Appにアクセスする, THE Entry_Form SHALL localStorageに保存された設定値を各フィールドの初期値として復元する
3. WHEN localStorageに保存された設定値が存在しない, THE Entry_Form SHALL デフォルト値（名前: 空文字、色: #ff69b4、メール: 空文字、ログ行数: 30）を使用する
4. WHEN ユーザーがChat_Appにアクセスする, THE Settings_Store SHALL 訪問回数を1加算してlocalStorageに保存する
5. WHEN ユーザーがChat_Appにアクセスする, THE Settings_Store SHALL 最終ログイン日時を現在時刻でlocalStorageに更新する
6. THE Settings_Store SHALL 保存するデータをJSON形式でシリアライズし、単一のlocalStorageキーに格納する

### Requirement 2: URL自動リンク化

**User Story:** ユーザーとして、チャットメッセージ内のURLが自動的にクリッカブルリンクになってほしい。URLをコピーペーストする手間を省くため。

#### Acceptance Criteria

1. WHEN メッセージ本文に `http://` または `https://` で始まるURLが含まれる, THE Chat_Message SHALL 該当URLをクリッカブルなハイパーリンクとして表示する
2. THE URL_Linker SHALL 生成するリンクに `target="_blank"` と `rel="noopener noreferrer"` 属性を付与する
3. WHEN メッセージ本文にURLが含まれない, THE Chat_Message SHALL メッセージをプレーンテキストとして表示する
4. WHEN メッセージ本文に複数のURLが含まれる, THE URL_Linker SHALL 各URLを個別のクリッカブルリンクに変換する
5. THE URL_Linker SHALL 構造化されたセグメント（text/url）を返し、Chat_Message SHALL テキストセグメントをReactテキストノードとしてレンダリングする。HTML文字列の構築（dangerouslySetInnerHTML、文字列結合によるHTML生成）は行わない
6. THE URL_Linker SHALL URL末尾の日本語句読点（。、）や閉じ括弧（）】」』）をURLから分離し、テキストセグメントとして扱う

### Requirement 3: フォントスタイル変更

**User Story:** ユーザーとして、メッセージのフォントサイズ・色・太字を指定して発言したい。チャットでの表現力を高めるため。

#### Acceptance Criteria

1. WHEN Chat_RoomでFont_Style_Modeチェックボックスが有効化される, THE Chat_Room SHALL フォントサイズセレクター（1〜5）、フォントカラーセレクター（15色）、太字チェックボックスを表示する
2. WHEN Font_Style_Modeが無効の状態, THE Chat_Room SHALL フォントサイズ・カラー・太字の追加コントロールを非表示にする
3. WHEN Font_Style_Modeが有効でメッセージを送信する, THE Chat_App SHALL 選択されたフォントサイズ・色・太字設定をメッセージのメタデータとしてSupabaseに保存する
4. WHEN チャットログにフォントスタイルメタデータを持つメッセージが存在する, THE Chat_Message SHALL 指定されたフォントサイズ・色・太字でメッセージ本文を表示する
5. WHEN Font_Style_Modeが無効でメッセージを送信する, THE Chat_App SHALL フォントスタイルメタデータなしでメッセージを保存する
6. THE Chat_Room SHALL Font_Style_Modeのフォントカラーセレクターに以下の15色を提供する: black, gray, silver, white, red, hotpink, orange, gold, yellow, lime, green, aqua, blue, navy, purple

### Requirement 4: こっそり入室（Silent Entry）

**User Story:** ユーザーとして、入室メッセージを表示せずにチャットルームに参加したい。目立たずに入室するため。

#### Acceptance Criteria

1. THE Entry_Form SHALL 「こっそり」チェックボックスを表示する
2. WHEN 「こっそり」チェックボックスが有効で入室ボタンが押される, THE Chat_App SHALL 入室システムメッセージ（「おいでやすぅ」）を投稿せずにチャットルームに遷移する
3. WHEN 「こっそり」チェックボックスが無効で入室ボタンが押される, THE Chat_App SHALL 従来通り入室システムメッセージを投稿してからチャットルームに遷移する
4. WHEN こっそり入室した場合, THE Chat_App SHALL 入室後のメッセージ送信・退室・リロード機能を通常入室と同一に動作させる
5. THE Silent_Entry SHALL 入室システムメッセージの抑制のみを行い、参加者のアイデンティティ・メッセージ送信能力・将来のプレゼンス機能（Supabase Realtime Presence等）には影響しない

### Requirement 5: アバター（キャラアイコン）選択

**User Story:** ユーザーとして、チャットで使用するキャラクターアイコンを選択したい。自分の発言を視覚的に識別しやすくするため。

#### Acceptance Criteria

1. THE Entry_Form SHALL アバター選択UIをラジオボタン形式で表示する
2. THE Avatar_Selector SHALL 「なし」オプションと13種類のアバターアイコン（hoshi1〜8.gif、miko1.gif、tuki1〜4.gif）を選択肢として提供する
3. THE Avatar_Selector SHALL 各ラジオボタンの横に対応するGIF画像をインラインプレビューとして表示する
4. WHEN ユーザーがアバターを選択して入室する, THE Chat_App SHALL 選択されたアバター識別子をメッセージのメタデータとしてSupabaseに保存する
5. WHEN チャットログにアバターメタデータを持つメッセージが存在する, THE Chat_Message SHALL ユーザー名の左側に選択されたアバターアイコン画像を表示する
6. WHEN アバターが「なし」に設定されている, THE Chat_Message SHALL アイコンを表示せずユーザー名のみを表示する
7. WHEN ユーザーがアバターを選択して入室する, THE Settings_Store SHALL 選択されたアバターをlocalStorageに保存する

### Requirement 6: おみくじ機能

**User Story:** ユーザーとして、「おみくじ」と発言するとランダムな運勢メッセージを受け取りたい。チャットでの遊び要素を楽しむため。

#### Acceptance Criteria

1. WHEN ユーザーが「おみくじ」というメッセージを送信する, THE Fortune_Bot SHALL ユーザーの発言を通常通り投稿した後、ランダムな運勢メッセージをシステムメッセージとして投稿する
2. THE Fortune_Bot SHALL 運勢メッセージを「巫女」という名前、hotpinkの色で投稿する
3. THE Fortune_Bot SHALL 定義済みの運勢メッセージリスト（10件以上）からランダムに1件を選択する
4. THE Fortune_Bot SHALL 運勢メッセージに発言者の名前を含める（形式: 「{運勢メッセージ}＞{ユーザー名}さん」）
5. WHEN 「おみくじ」以外のメッセージが送信される, THE Fortune_Bot SHALL 反応しない

### Requirement 7: lookコマンド（音声通知）

**User Story:** ユーザーとして、「look」と発言して全参加者に通知音を鳴らしたい。注意を引きたいため。

#### Acceptance Criteria

1. WHEN ユーザーが「look」というメッセージを送信する, THE Chat_App SHALL 通常のメッセージとして「look」を投稿する
2. WHEN チャットログに「look」メッセージがリアルタイムで受信される, THE Web_Audio_Player SHALL 通知音（rin.mp3またはrin.webm）を再生する
3. WHEN 過去のチャットログ読み込み時に「look」メッセージが含まれる場合, THE Web_Audio_Player SHALL 通知音を再生しない（リアルタイム受信時のみ再生する）
4. WHEN ユーザーが「unlook」というメッセージを送信する, THE Web_Audio_Player SHALL 現在再生中の通知音を停止する
5. THE Web_Audio_Player SHALL Web Audio APIを使用して音声を再生する
6. IF ブラウザが音声再生を自動再生ポリシーによりブロックする, THEN THE Web_Audio_Player SHALL ユーザーインタラクション後に音声再生を有効化する
7. THE Chat_Room SHALL 音声通知を有効化するためのUIボタン（「🔔 通知音を有効にする」）を表示し、ユーザーのクリックにより AudioContext.resume() を呼び出す
8. THE Chat_App SHALL 通知音ファイル（rin.mp3、rin.webm）を `public/sounds/` ディレクトリに配置する
9. THE Web_Audio_Player SHALL ブラウザの対応フォーマットに応じてmp3またはwebmを選択する
