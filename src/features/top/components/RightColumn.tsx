import { SectionTitle } from './SectionTitle';
import { TwitterTimeline } from './TwitterTimeline';

export function RightColumn() {
  return (
    <aside className="border-l border-gray-300 bg-white px-2 py-2 max-lg:col-span-2 max-lg:border-l-0 max-md:order-3">
      <section className="min-h-[122px]">
        <SectionTitle>
          <span className="text-blue-600">@chat_a</span>のつぶやき
        </SectionTitle>
        <TwitterTimeline screenName="chat_a" />
      </section>
      <div className="mt-3 space-y-3">
        <section>
          <SectionTitle>詩集／待ち合わせ／壁紙</SectionTitle>
          <div className="p-3 text-center text-[12px]">
            <img
              className="mx-auto mb-2 h-[82px] w-[134px]"
              src={`${import.meta.env.BASE_URL}okiraku/images/town.gif`}
              alt=""
              width="134"
              height="82"
              loading="lazy"
            />
            <a className="block font-bold text-blue-600 hover:underline" href="#">
              お気楽チャット詩集掲示板
            </a>
            <a className="block font-bold text-blue-600 hover:underline" href="#">
              チャット待ち合わせ掲示板
            </a>
          </div>
        </section>
        <section>
          <SectionTitle>特設コーナー</SectionTitle>
          <div className="p-3 text-[12px] leading-relaxed">
            <img
              className="mx-auto mb-2 h-[88px] w-[300px] border border-gray-300"
              src={`${import.meta.env.BASE_URL}okiraku/images/rosenmembers_s.jpg`}
              alt=""
              width="300"
              height="88"
              loading="lazy"
            />
            <a className="font-bold text-blue-600 hover:underline" href="#">
              ローゼンメイデンチャット
            </a>
            の「ねこ」さんが、ユーザーの皆さんのステキな似顔絵を書いてくれました。
          </div>
        </section>
        <section id="chat-rules">
          <SectionTitle>チャットのルール・マナー</SectionTitle>
          <ul className="list-inside list-[circle] p-3 text-[12px] leading-6 text-blue-600">
            <li>お初さんを歓迎しましょう。</li>
            <li>必ずあいさつをしましょう。</li>
            <li>簡単な自己紹介をしましょう。</li>
            <li>相手の気持ちを考えて会話をしましょう。</li>
            <li>チャットのルール・マナーについて詳しく見る</li>
          </ul>
        </section>
        <section id="chat-howto">
          <SectionTitle>チャットの使い方</SectionTitle>
          <ul className="list-inside list-[circle] p-3 text-[12px] leading-6 text-blue-600">
            <li>チャットに関する設定は全てココから！</li>
            <li>文字を装飾するエフェクト</li>
            <li>Filter（フィルタ）設定ボタンの使い方</li>
            <li>おみくじの追加方法</li>
            <li>チャットの使い方について詳しく見る</li>
          </ul>
        </section>
      </div>
    </aside>
  );
}
