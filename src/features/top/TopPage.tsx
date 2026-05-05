import { usePageView, useSEO } from '@shared/hooks/useSEO';
import type { CSSProperties, ReactNode } from 'react';
import {
  chatDirectoryGroups,
  guideLinks,
  latestLogins,
  pickupGroups,
  primaryNav,
  profiles,
  tabNav,
  type ChatDirectoryGroup,
  type PickupGroup,
  type RoomLink,
} from './data';
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

function PickupList({
  group,
  id,
  liveCounts,
}: {
  group: PickupGroup;
  id: string;
  liveCounts: RoomCountMap;
}) {
  return (
    <section id={id} className="mb-4 break-inside-avoid">
      <h3 className="text-[13px] font-bold leading-tight text-gray-800">{group.title}</h3>
      <p className={`text-[11px] font-bold leading-tight ${toneClass[group.tone]}`}>{group.note}</p>
      <ul className="mt-1 text-[12px] leading-[1.42]">
        {group.items.map((item) => (
          <li key={item.label} className="before:mr-1 before:text-orange-300 before:content-['○']">
            <RoomAnchor item={item} className="font-bold text-blue-600 hover:underline" />
            <CountBadge count={resolveCount(item, liveCounts)} />
          </li>
        ))}
      </ul>
      <a className="mt-1 block text-[11px] text-gray-500 hover:underline" href="#">
        ＋ {group.title}について詳しく見る
      </a>
    </section>
  );
}

function Header() {
  const imageBase = `${import.meta.env.BASE_URL}okiraku/images`;
  const headerStyle = {
    '--okiraku-head': `url(${imageBase}/head.png)`,
    '--okiraku-navi': `url(${imageBase}/navi.png)`,
  } as CSSProperties;
  const guideIcons = ['faq.png', 'tutorial.png', 'heart.png', 'profile.png', 'email.gif'];

  return (
    <header className="bg-white" style={headerStyle}>
      <div className="okiraku-header">
        <div className="mx-auto max-w-[990px] pt-5">
          <div className="flex min-h-[86px] flex-col gap-3 px-1 md:flex-row md:items-start md:justify-between md:pb-3">
            <h1 className="m-0 h-[60px] w-[212px]">
              <a className="block h-[60px] w-[212px] no-underline" href={import.meta.env.BASE_URL}>
                <img
                  className="block h-[60px] w-[212px]"
                  src={`${imageBase}/logo.png`}
                  alt="お気楽チャット"
                  width="212"
                  height="60"
                />
              </a>
            </h1>
            <nav aria-label="ガイドメニュー" className="pt-7">
              <ul className="flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-bold text-blue-600">
                {guideLinks.map((label, index) => (
                  <li key={label} className="h-5">
                    <a className="flex items-center hover:underline" href="#">
                      <img
                        className="mr-1 h-4 w-4"
                        src={`${imageBase}/${guideIcons[index]}`}
                        alt=""
                        width="16"
                        height="16"
                      />
                      {label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </div>
        </div>
      </div>
      <div className="mx-auto max-w-[990px]">
        <nav aria-label="メインナビゲーション" className="px-0">
          <ul className="flex flex-wrap items-start text-[13px] font-normal md:h-[35px] md:flex-nowrap">
            {primaryNav.map((label, index) => (
              <li key={label} className="h-[35px] shrink-0">
                <a
                  className={`okiraku-primary-tab block h-[35px] w-[110px] text-center leading-[36px] outline-none ${
                    index === 0 ? 'okiraku-primary-tab-active' : ''
                  }`}
                  href="#"
                  aria-current={index === 0 ? 'page' : undefined}
                >
                  {label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div
          aria-hidden="true"
          className="h-[5px] bg-gradient-to-b from-[#00c7ff] via-[#00a9e8] to-[#0079c8] shadow-[inset_0_1px_0_rgba(255,255,255,0.55),inset_0_-1px_0_rgba(0,105,185,0.8)]"
        />
        <nav
          aria-label="チャット種別タブ"
          className="bg-gradient-to-b from-[#12bdf4] to-[#008ed7] px-0"
        >
          <ul className="flex flex-wrap items-start text-[13px] font-bold md:flex-nowrap">
            {tabNav.map((item, index) => (
              <li key={item.label} className="h-[44px] shrink-0">
                <a
                  className={`okiraku-secondary-tab block h-[42px] w-[138px] text-center leading-[42px] outline-none ${
                    index === 0 ? 'okiraku-secondary-tab-active leading-[48px]' : ''
                  }`}
                  href={item.href}
                  aria-current={index === 0 ? 'page' : undefined}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}

function LeftColumn({ liveCounts }: { liveCounts: RoomCountMap }) {
  return (
    <aside className="border-r border-gray-300 bg-white px-2 py-2 max-md:order-2 max-md:border-r-0">
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
  const pickupIds = [
    'pickup-junior-high',
    'pickup-elementary',
    'pickup-high-school',
    'pickup-narikiri',
    'pickup-college',
    'pickup-worker',
  ];

  return (
    <section className="bg-white px-2 py-2 max-md:order-1">
      <SectionTitle>注目のチャット ピックアップ</SectionTitle>
      <section className="px-2 py-3">
        <h3 className="text-[13px] font-bold">チャットの最新情報</h3>
        <ul className="mt-2 text-[12px] leading-[1.55]">
          {latestLogins.map((text, index) => (
            <li key={text} className="text-blue-600">
              ○ <a href="#">{text.split('に')[0]}</a>に{text.split('に').slice(1).join('に')}
              <span className="ml-2 text-sky-500">2012-11-07 10:{18 - index}:49</span>
            </li>
          ))}
        </ul>
      </section>
      <div className="columns-1 gap-7 px-2 md:columns-2">
        {pickupGroups.map((group, index) => (
          <PickupList
            key={group.title}
            group={group}
            id={pickupIds[index]}
            liveCounts={liveCounts}
          />
        ))}
      </div>
      <SectionTitle>チャットのプロフィールを作成しよう！</SectionTitle>
      <section className="px-2 py-3">
        <p className="text-[12px] leading-relaxed">
          <span className="mr-2 inline-block border-2 border-red-500 px-2 py-1 text-[22px] font-black text-red-600">
            Vururu
          </span>
          <a className="font-bold text-blue-600 hover:underline" href="#">
            プロフィール作成ならVururu
          </a>
          と連携しました。チャット入室時 Vururu
          のプロフィールIDを入力すると、プロフィールが表示されます。
        </p>
        <div className="mt-3 grid max-w-[430px] grid-cols-4 gap-x-6 gap-y-3">
          {profiles.map(([name, avatar], index) => (
            <a
              key={`${name}-${index}`}
              className="text-center text-[11px] font-bold text-blue-600 hover:underline"
              href="#"
            >
              <img
                className="mx-auto h-[72px] w-[72px] border border-gray-200 object-contain"
                src={`${import.meta.env.BASE_URL}avatars/${avatar}.gif`}
                alt=""
                loading="lazy"
              />
              <span>{name}</span>
            </a>
          ))}
        </div>
      </section>
    </section>
  );
}

function RightColumn() {
  return (
    <aside className="border-l border-gray-300 bg-white px-2 py-2 max-lg:col-span-2 max-lg:border-l-0 max-md:order-3">
      <div className="grid grid-cols-2 gap-2">
        <section className="min-h-[122px]">
          <SectionTitle>
            <span className="text-blue-600">@chat_a</span>のつぶやき
          </SectionTitle>
        </section>
        <section>
          <SectionTitle>つぶやき／ブックマーク</SectionTitle>
          <div className="p-2 text-center text-[12px]">
            <div className="mb-2 font-bold text-gray-500">つぶやいてね</div>
            <button className="rounded border border-sky-600 bg-sky-500 px-3 py-1 text-white">
              ツイート
            </button>
          </div>
        </section>
      </div>
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
        <section>
          <SectionTitle>チャットのルール・マナー</SectionTitle>
          <ul className="list-inside list-[circle] p-3 text-[12px] leading-6 text-blue-600">
            <li>お初さんを歓迎しましょう。</li>
            <li>必ずあいさつをしましょう。</li>
            <li>簡単な自己紹介をしましょう。</li>
            <li>相手の気持ちを考えて会話をしましょう。</li>
            <li>チャットのルール・マナーについて詳しく見る</li>
          </ul>
        </section>
        <section>
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

function Community() {
  const items = [
    [
      'プロフィール作成',
      'プロフィール作成ならVururu。プロフのことならVururuへGo!プロフィール作成サービス。',
    ],
    ['美人チャット', '全国のチャット美人が集まる美人チャット。真の美人とは心が美しいのです。'],
    ['オフ会ならC-Dream', 'オフ会ならココ！C-Dreamでは、毎週たくさんのオフ会が開催されています。'],
    ['頼むから重力に従ってくれ', 'ダンス動画とコミュニティーのおすすめコーナー。'],
  ];

  return (
    <section className="border-t border-gray-300 bg-white">
      <SectionTitle>コミュニティー</SectionTitle>
      <div className="grid gap-2 p-2 md:grid-cols-[1fr_1fr_1fr_2.6fr]">
        {items.map(([title, body], index) => (
          <article key={title} className="text-[12px] leading-relaxed">
            <div
              className={`mb-2 h-[96px] border border-gray-200 ${
                index === 3
                  ? 'bg-slate-900 text-white'
                  : 'bg-gradient-to-br from-orange-100 to-sky-100'
              } grid place-items-center overflow-hidden text-center text-[14px] font-bold`}
            >
              {index === 0 ? (
                <div className="w-24 bg-white p-1 text-left text-[8px] text-red-500">
                  Vururu
                  <div className="mt-1 grid grid-cols-3 gap-1">
                    {profiles.slice(0, 6).map(([, avatar], profileIndex) => (
                      <img
                        key={`${avatar}-${profileIndex}`}
                        src={`${import.meta.env.BASE_URL}avatars/${avatar}.gif`}
                        alt=""
                        className="h-5 w-5"
                      />
                    ))}
                  </div>
                </div>
              ) : (
                title
              )}
            </div>
            <h3 className="font-bold">{title}</h3>
            <p>{body}</p>
          </article>
        ))}
      </div>
    </section>
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
        <p className="col-span-full mt-3">©1997-2012 チャットならお気楽チャット.</p>
        <p className="col-span-full">お気楽チャットはYahooカテゴリーに登録されています</p>
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
            お気楽チャットは、夢と希望を持って気楽に楽しめる<strong>チャット</strong>
            です。地球と日本の将来を担う若者たちの人生経験をより豊かにすることをひとつの目標としています。
            中学生チャット、小学生チャット、高校生、社会人、主婦、まだ見ぬ親友、引きこもり、魑魅魍魎、宇宙人、魔法少女まで、みんなが楽しめるチャットです。
          </p>
        </section>
        <div className="grid grid-cols-1 md:grid-cols-[176px_1fr] lg:grid-cols-[176px_1fr_360px]">
          <LeftColumn liveCounts={liveCounts} />
          <MainColumn liveCounts={liveCounts} />
          <RightColumn />
        </div>
        <Community />
      </main>
      <Footer />
    </div>
  );
}
