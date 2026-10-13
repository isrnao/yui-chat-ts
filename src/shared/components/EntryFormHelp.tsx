/** JS が使えない場合も読める。hydration 前後で同じ領域を保つ。 */
export default function EntryFormHelp() {
  return (
    <details className="text-xs mt-1">
      <summary>入室できないとき</summary>
      <p>
        入室にはJavaScriptが必要です。有効にして
        <a href="" className="underline">
          再読み込み
        </a>
        してください。
        <a href={import.meta.env.BASE_URL} className="underline">
          トップへ戻る
        </a>
      </p>
    </details>
  );
}
