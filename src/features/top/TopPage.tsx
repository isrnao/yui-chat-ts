import { usePageView, useSEO } from '@shared/hooks/useSEO';
import { buildAbsoluteUrl } from '@shared/utils/seo';
import {
  CommunitySection,
  Footer,
  Header,
  LeftColumn,
  MainColumn,
  RightColumn,
} from './components';
import { RoomCountContext } from './hooks/roomCountContext';
import { useRoomCounts } from './hooks/useRoomCounts';
import { intro } from './data';

export default function TopPage() {
  useSEO({
    ssgPathname: import.meta.env.BASE_URL,
    title: 'お気楽チャットTS - 無料で気軽に参加できる目的別チャット',
    description:
      'お気楽チャットは、無料で気軽に参加できるチャットサービスです。初心者、学生、年代別、趣味、ゲーム、アニメ、なりきりなど目的別の部屋で友達探しや仲間作りを楽しめます。',
    canonical: buildAbsoluteUrl('/'),
    ogImage: buildAbsoluteUrl('/ogp.png'),
  });
  usePageView('お気楽チャット トップ');

  const countState = useRoomCounts();
  const liveCounts = countState.counts;

  return (
    <RoomCountContext value={countState}>
      <div className="min-h-dvh bg-white font-yui text-[12px] text-gray-700">
        <a className="skip-link" href="#main-content">
          本文へ移動
        </a>
        <Header />
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-[990px] border-x border-gray-300 bg-white"
        >
          <section className="px-2 py-3">
            <h2 className="text-[13px] font-bold text-blue-700">{intro.title}</h2>
            <p className="mt-1 leading-relaxed">{intro.body.join('')}</p>
          </section>
          {/* 出すのは失敗したときだけ。取得中の表示は SSG の HTML にも入り、取得が終わると消えて
              部屋の一覧を押し上げる（レイアウトシフト）ので出さない */}
          {countState.kind !== 'ready' && countState.kind !== 'loading' && (
            <p role="status" className="px-2 text-xs">
              {countState.kind === 'partial'
                ? '一部の人数を取得できませんでした。'
                : '人数を取得できませんでした。'}
              {countState.asOf && (
                <> 前回取得: {new Date(countState.asOf).toLocaleTimeString('ja-JP')}</>
              )}
              <button type="button" disabled={countState.isLoading} onClick={countState.retry}>
                再試行
              </button>
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-[176px_1fr] lg:grid-cols-[176px_1fr_360px]">
            <LeftColumn liveCounts={liveCounts} />
            <MainColumn liveCounts={liveCounts} />
            <RightColumn />
          </div>
          <CommunitySection />
        </main>
        <Footer />
      </div>
    </RoomCountContext>
  );
}
