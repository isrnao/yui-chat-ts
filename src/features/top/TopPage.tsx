import { usePageView, useSEO } from '@shared/hooks/useSEO';
import { useEffect, useRef, type ReactNode } from 'react';
import {
  chatDirectoryGroups,
  news,
  pickupGroups,
  type ChatDirectoryGroup,
  type PickupGroup,
  type RoomLink,
} from './data';
import { Header } from './components/header/Header';
import { useRoomCounts } from './hooks/useRoomCounts';
import type { RoomCountMap } from './api/roomCountsApi';

function isExternalLink(item: RoomLink): boolean {
  if (item.external === false) return false;
  if (item.external === true) return true;
  // 未指定のときは href から判定 (http(s):// を外部扱い、/ や # は内部扱い)
  return /^https?:\/\//.test(item.href);
}

/** 部屋リンクから表示用のユーザー数を決定する。
 *  `roomId` を持ち Supabase からの値があればその値、それ以外は常に 0。 */
function resolveCount(item: RoomLink, liveCounts: RoomCountMap): number {
  if (item.roomId && liveCounts[item.roomId] !== undefined) {
    return liveCounts[item.roomId] as number;
  }
  return 0;
}

function RoomAnchor({ item, className }: { item: RoomLink; className: string }) {
  const external = isExternalLink(item);
  return (
    <a
      className={className}
      href={item.href}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
    >
      {item.label}
    </a>
  );
}

const toneClass: Record<ChatDirectoryGroup['tone'] | PickupGroup['tone'], string> = {
  pink: 'text-pink-500',
  orange: 'text-orange-500',
  green: 'text-green-500',
  blue: 'text-sky-500',
  purple: 'text-fuchsia-500',
  gray: 'text-gray-500',
};

function CountBadge({ count }: { count: number }) {
  const color = count === 0 ? 'text-gray-400' : count >= 4 ? 'text-orange-500' : 'text-emerald-500';
  return <span className={`ml-1 font-bold ${color}`}>{count}人</span>;
}

function SectionTitle({ children }: { children: ReactNode }) {
  return (
    <h2 className="border-y border-gray-300 bg-white px-2 py-[7px] text-[14px] font-bold leading-none text-gray-800">
      {children}
    </h2>
  );
}

function RoomList({ group, liveCounts }: { group: ChatDirectoryGroup; liveCounts: RoomCountMap }) {
  return (
    <section className="mb-3">
      <h3 className="text-[13px] font-bold leading-tight text-gray-800">{group.title}</h3>
      <p className={`text-[11px] font-bold leading-tight ${toneClass[group.tone]}`}>{group.note}</p>
      <ul className="mt-1 text-[12px] leading-[1.38]">
        {group.items.map((item) => (
          <li key={item.label} className="before:mr-1 before:text-orange-300 before:content-['○']">
            <RoomAnchor item={item} className="font-bold text-blue-600 hover:underline" />
            <CountBadge count={resolveCount(item, liveCounts)} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function PickupList({ group, liveCounts }: { group: PickupGroup; liveCounts: RoomCountMap }) {
  return (
    <section className="mb-[5px] break-inside-avoid">
      <h3 id={group.anchorId} className="text-[13px] font-bold leading-tight text-gray-800">
        {group.title}
      </h3>
      <p className={`text-[11px] font-bold leading-tight ${toneClass[group.tone]}`}>{group.note}</p>
      <ul className="mt-1 text-[12px] leading-[1.42]">
        {group.items.map((item) => (
          <li
            key={item.label}
            className="whitespace-nowrap before:mr-1 before:text-orange-300 before:content-['○']"
          >
            <RoomAnchor item={item} className="font-bold text-blue-600 hover:underline" />
            <CountBadge count={resolveCount(item, liveCounts)} />
          </li>
        ))}
      </ul>
      {group.moreHref && (
        <a className="mt-1 block text-[11px] text-gray-500 hover:underline" href={group.moreHref}>
          ＋ {group.title}について詳しく見る
        </a>
      )}
    </section>
  );
}

function LeftColumn({ liveCounts }: { liveCounts: RoomCountMap }) {
  return (
    <aside className="border-r border-gray-300 bg-white px-2 py-2 max-md:order-1 max-md:border-r-0">
      <SectionTitle>チャット</SectionTitle>
      <div className="pt-3">
        {chatDirectoryGroups.map((group) => (
          <RoomList key={group.title} group={group} liveCounts={liveCounts} />
        ))}
      </div>
    </aside>
  );
}

function MainColumn({ liveCounts }: { liveCounts: RoomCountMap }) {
  return (
    <section className="bg-white px-2 py-2 max-md:order-2">
      <SectionTitle>注目のチャット ピックアップ</SectionTitle>
      <section className="px-2 py-3">
        <h3 className="text-[13px] font-bold">チャットの最新情報</h3>
        <ul className="mt-2 text-[12px] leading-[1.55]">
          {news.map((item, newsIndex) => (
            <li key={newsIndex} className="text-gray-700">
              ○{' '}
              {item.parts.map((part, partIndex) =>
                typeof part === 'string' ? (
                  <span key={partIndex}>{part}</span>
                ) : (
                  <a
                    key={partIndex}
                    href={part.linkHref}
                    className="font-bold text-blue-600 hover:underline"
                  >
                    {part.linkLabel}
                  </a>
                )
              )}
            </li>
          ))}
        </ul>
      </section>
      <div className="px-2">
        {pickupGroups.map((group) => (
          <PickupList key={group.title} group={group} liveCounts={liveCounts} />
        ))}
      </div>
      <SectionTitle>応援してくれる方／ご協力者の方へ</SectionTitle>
      <section id="linkguide" className="px-2 py-3">
        <p className="text-[12px] leading-relaxed">
          当サイトを応援してくれる方は、ブログやホームページに以下のタグを設置したり、Twitterでつぶやいてお気楽チャットのご紹介をお願いいたします。
          <br />
          皆様からの暖かいご支援を心からお待ちしております。
        </p>
        <textarea
          readOnly
          rows={3}
          wrap="soft"
          defaultValue={
            '<a href="https://www.okiraku.chat/" target="_blank" rel="noopener noreferrer">お気楽チャット - チャットで友達探し＆仲間作り</a>'
          }
          onClick={(e) => e.currentTarget.select()}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="お気楽チャット紹介リンクのHTMLタグ (クリックで全選択)"
          className="mt-3 w-full resize-y rounded border border-gray-300 bg-gray-50 p-2 font-mono text-[11px] leading-relaxed text-gray-800"
        />
        <p className="mt-3 text-[12px] leading-relaxed">
          Xでつぶやいてお気楽チャットを紹介する場合は、こちらのボタンからどうぞ。
        </p>
        <a
          href={`https://x.com/intent/tweet?text=${encodeURIComponent('お気楽チャットで友達探し＆仲間作り')}&url=${encodeURIComponent('https://www.okiraku.chat/')}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 rounded border border-black bg-black px-3 py-1 text-[12px] font-bold text-white hover:bg-gray-800"
        >
          <span aria-hidden="true" className="font-black">
            𝕏
          </span>
          でツイート
        </a>
      </section>
    </section>
  );
}

const TWITTER_WIDGETS_SRC = 'https://platform.twitter.com/widgets.js';

declare global {
  interface Window {
    twttr?: {
      widgets: { load: (element?: HTMLElement | null) => void };
    };
  }
}

/**
 * 公式 widgets.js による Twitter / X タイムライン埋め込み。
 *
 * widgets.js は `.twitter-timeline` 要素を iframe に置換する。
 * SPA 内で複数回マウントされても script を重複ロードしないよう、
 * `id="twitter-wjs"` (X 公式 snippet 互換) で既存タグを検出し、
 * 既にあれば `twttr.widgets.load()` で再スキャンする。
 *
 * 親要素の高さ不足で iframe が 0px のまま見えなくなる事故を防ぐため、
 * `data-height` を指定する。
 */
function TwitterTimeline({ screenName }: { screenName: string }) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const loadWidgets = () => {
      window.twttr?.widgets.load(containerRef.current);
    };

    const existingScript = document.getElementById('twitter-wjs');
    if (existingScript) {
      loadWidgets();
      return;
    }

    const script = document.createElement('script');
    script.id = 'twitter-wjs';
    script.src = TWITTER_WIDGETS_SRC;
    script.async = true;
    script.charset = 'utf-8';
    script.onload = loadWidgets;
    document.body.appendChild(script);
  }, [screenName]);

  // screenName は呼び出し元でハードコードする想定 (XSS 経路を断つため英数字 + _ のみ許可)
  const safeScreenName = screenName.replace(/[^a-zA-Z0-9_]/g, '');

  return (
    <div ref={containerRef} className="p-2">
      <a
        className="twitter-timeline"
        data-height="500"
        data-lang="ja"
        href={`https://twitter.com/${safeScreenName}?ref_src=twsrc%5Etfw`}
      >
        Tweets by {safeScreenName}
      </a>
    </div>
  );
}

function RightColumn() {
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

function Footer() {
  return (
    <footer className="bg-blue-700 text-white">
      <div className="mx-auto grid max-w-[990px] gap-5 px-1 py-5 text-[12px] leading-7 md:grid-cols-4">
        {['チャット', '中学生チャット', 'なりきりチャット', 'オフ会'].map((title) => (
          <section key={title}>
            <h2 className="font-bold">{title}</h2>
            <ul className="text-sky-100">
              <li>○ チャットのルール・マナー</li>
              <li>○ チャットの使い方</li>
              <li>○ チャットのよくある質問</li>
            </ul>
          </section>
        ))}
        <p className="col-span-full mt-3">
          ©2026 お気楽チャットTS.
          <br />
          Inspired by 1997-2017 チャットならお気楽チャット
        </p>
      </div>
    </footer>
  );
}

export default function TopPage() {
  useSEO({
    title: 'お気楽チャット - チャットで友達探し＆仲間作り | ゆいちゃっとTS',
    description: 'お気楽チャットは気軽に楽しめる無料チャットです。友達探しと仲間作りを楽しもう。',
    keywords: ['お気楽チャット', 'チャット', '無料チャット', '友達探し', '仲間作り'],
    canonical: 'https://isrnao.github.io/yui-chat-ts/',
  });
  usePageView('お気楽チャット トップ');

  const { counts: liveCounts } = useRoomCounts();

  return (
    <div className="min-h-dvh bg-white font-yui text-[12px] text-gray-700">
      <Header />
      <main className="mx-auto max-w-[990px] border-x border-gray-300 bg-white">
        <section className="border-b border-gray-300 px-2 py-3">
          <h2 className="text-[13px] font-bold text-blue-700">
            お気楽チャット - チャットで友達探し＆仲間作り
          </h2>
          <p className="mt-1 leading-relaxed">
            このサイトは、2000年代に毎日のように過ごした思い出のチャットを再現した、私的な非公式個人サイトです。
            当時ここで出会った人たちも、今では大人になり、それぞれの人生を歩んでいると思います。
            それでも、ふとした時にあの頃の「お気楽チャット」を思い出し、懐かしい名前を探したり、誰かに一言を残したくなることがあります。
            そんな人たちがもう一度立ち寄れる、思い出の待ち合わせ場所になれば嬉しいです。
            あの頃の雰囲気や、今となっては少し恥ずかしい黒歴史も含めて、懐かしんでもらえたら嬉しいです。
          </p>
        </section>
        <div className="grid grid-cols-1 md:grid-cols-[176px_1fr] lg:grid-cols-[176px_1fr_360px]">
          <LeftColumn liveCounts={liveCounts} />
          <MainColumn liveCounts={liveCounts} />
          <RightColumn />
        </div>
      </main>
      <Footer />
    </div>
  );
}
