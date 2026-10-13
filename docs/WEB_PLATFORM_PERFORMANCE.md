# Web Platform First 性能比較（2026-10-13）

対象: #243 / #234。最新main `4618761e430aa052bf26fb5c1c88364e202a0e1d`とWP2cまでの積み上げhead `d195a14650278f7d059814637acb14ccb338b277`を比較する。WP2c単独の効果とは扱わない。

## 計測条件

- 同じmacOS 26.6.2端末、Node 22.22.3 / pnpm 10.34.6、Playwright Chromium 156.0.8078.4のheadless実行。
- viewport 390×844、mobile/touch有効、deviceScaleFactor 1、CPU throttle 4倍、latency 150ms、download 200,000 bytes/s、upload 96,000 bytes/s。
- 各ページ3組のcold/warm。coldは新規BrowserContext、warmはそのcontext内の2回目の文書ロード。gzip配信、資産はimmutable cache、HTMLはno-cache。Playwright routeによるcache無効化は使わず、warmのJS transferSize 0とcachedJsを確認する。
- remote HTTPS/WSSはCDPでブロック。GAを取得せず、New Relic設定5項目は空に固定。最初の操作で読み込むローカルbootstrap chunkをJS量に含めるが、Browser Agentは起動しない。
- `VITE_SUPABASE_URL=http://127.0.0.1:4182/fixture` / `VITE_SUPABASE_ANON_KEY=fixture-only`。空ログ/空人数のHTTP応答のみ。Realtime serverはない。マージ・公開・実サービスへの通報/入室/送信は行わない。
- 計測中に別のビルドや単体試験を実行しない。固定設定が揃う前の試行は集計から除外した。

## 指標の読み方

LCPはPerformanceObserverで観測した操作前の最終候補。入力可能はSSGの名前入力欄が見えて編集可能になった最初のframe。入室ボタン有効化と分ける。mainのSSGボタンは準備前から有効だったため、その有効化時刻をReact準備完了の証拠にはしない。

トップの操作はTab→Enterで本文へ移動、部屋の操作は名前欄をクリックして`perf`を4文字入力する。操作遅延はこの少数操作の最大Event Timing（first-inputも観測）とinput delayで記録する。**実ユーザーの訪問全体のINP p75ではない**。INPの評価には実際の利用者・操作の情報が必要であり、今回の短いlabシナリオだけでは代替できない。[INPの定義とlab計測の限界](https://web.dev/articles/inp)。

JS転送量はsame-origin Resource TimingのtransferSize合計（圧縮本文＋API上のheader概算を含む）。初期のnetwork idleまでと操作後を分ける。decodedBodySizeとcache件数もraw JSONに残す。Realtime接続完了は測定不能のためnullとし、入力可能や入室ボタン有効化から推定しない。

## 再現方法

対象refの依存をfrozen installし、次の同じ公開設定で`build:prod`を実行する。mainの基準はgit archiveから別ディレクトリへ展開し、同じ依存バージョンで生成した。

```sh
VITE_SUPABASE_URL=http://127.0.0.1:4182/fixture \
VITE_SUPABASE_ANON_KEY=fixture-only \
VITE_NEW_RELIC_ACCOUNT_ID= \
VITE_NEW_RELIC_TRUST_KEY= \
VITE_NEW_RELIC_AGENT_ID= \
VITE_NEW_RELIC_BROWSER_KEY= \
VITE_NEW_RELIC_APP_ID= pnpm build:prod

node scripts/measure-web-platform.js \
  --dist=/absolute/path/to/dist --label=commit-sha \
  --output=/absolute/path/to/result.json
```

scriptはローカル4182で計測用の配信を起動し、終了時に閉じる。ブラウザはChromiumだけを使用する。実Chrome/Safari、実Android/iOS、VoiceOver、実ネットワーク/ログ/Realtimeと監視有効条件の測定は未実施。OS/最低版・担当と実機結果は#238で引き続き確認する。

## 結果

値は3回の中央値、括弧は最小〜最大。時間はms。

| ページ                    | Cache | main LCP         | 積み上げ LCP     | main 操作遅延 | 積み上げ 操作遅延 |
| ------------------------- | ----- | ---------------- | ---------------- | ------------- | ----------------- |
| `/`                       | cold  | 968 (888–980)    | 968 (924–1208)   | 16 (16–24)    | 24 (16–32)        |
| `/`                       | warm  | 320 (300–416)    | 344 (328–404)    | 16 (16–24)    | 16 (16–24)        |
| `/chat/superbeginner/`    | cold  | 2060 (2048–2108) | 2108 (2040–2132) | 96 (48–112)   | 56 (48–64)        |
| `/chat/superbeginner/`    | warm  | 532 (528–540)    | 556 (552–624)    | 56 (40–56)    | 48 (40–56)        |
| `/chat/all/`              | cold  | 1908 (1728–1912) | 1892 (1804–1912) | 48 (48–48)    | 56 (48–56)        |
| `/chat/all/`              | warm  | 236 (232–264)    | 240 (236–244)    | 48 (48–48)    | 64 (48–80)        |
| `/chanari/superbeginner/` | cold  | 856 (776–860)    | 836 (760–876)    | 48 (48–56)    | 56 (48–80)        |
| `/chanari/superbeginner/` | warm  | 308 (304–344)    | 256 (256–272)    | 56 (48–128)   | 72 (40–72)        |

ColdのJS量（KiB、中央値）。warmは全サンプルで0 bytes、トップ5/通常17/全部屋16/Chanari17資産のcache利用を確認した。

| ページ                    | main 初期 | 積み上げ 初期 | main 操作後 | 積み上げ 操作後 | 操作後の差 |
| ------------------------- | --------- | ------------- | ----------- | --------------- | ---------- |
| `/`                       | 93.20     | 93.34         | 94.51       | 94.68           | +0.17      |
| `/chat/superbeginner/`    | 160.19    | 160.87        | 160.19      | 160.87          | +0.69      |
| `/chat/all/`              | 157.73    | 158.38        | 157.73      | 158.38          | +0.64      |
| `/chanari/superbeginner/` | 157.62    | 158.52        | 157.62      | 158.52          | +0.90      |

積み上げの入力可能・入室ボタン有効化（ms）。トップには名前入力/入室ボタンがない。

| ページ                    | Cache | 名前入力が編集可能 | 入室ボタン有効   | input delay |
| ------------------------- | ----- | ------------------ | ---------------- | ----------- |
| `/chat/superbeginner/`    | cold  | 827 (822–827)      | 1738 (1711–1813) | 18 (4–19)   |
| `/chat/superbeginner/`    | warm  | 231 (227–241)      | 372 (365–440)    | 14 (4–15)   |
| `/chat/all/`              | cold  | 822 (812–844)      | 1706 (1696–1752) | 12 (12–17)  |
| `/chat/all/`              | warm  | 228 (224–232)      | 357 (329–361)    | 24 (3–36)   |
| `/chanari/superbeginner/` | cold  | 817 (743–842)      | 1654 (1608–1692) | 18 (15–37)  |
| `/chanari/superbeginner/` | warm  | 246 (245–258)      | 337 (335–398)    | 29 (4–36)   |

全48サンプルでpageerrorなし。Realtime接続時間は全件null（fixtureにserverなし）。rawデータ: [main](benchmarks/2026-10-13-main.json) / [積み上げ](benchmarks/2026-10-13-wp2c.json)。

## 採否

今回のlab条件ではcold LCPの中央値は約0.8〜2.1秒、操作遅延の最大観測は128ms。WP1〜WP2cによるcold JS増加は約0.2〜0.9KiBであり、入室安全性とルート整合を優先する。48サンプルの範囲では入力欄を先に利用でき、重複SEO更新を省いた構造で機能を維持した。3回の短いシナリオなので、小さなLCP差を改善/悪化の確証としない。

**追加のHydration範囲分割は今回見送り**。このデータには分割を正当化する操作上のボトルネックがなく、境界追加は先行入力・session・Realtime・下書きの同期負担を増やす。実機/実ログ/監視有効条件や実ユーザーINPで問題が再現した場合に、該当部分を計測して独立PRで検証する。これら未測定項目を成功・完了とは扱わない。
