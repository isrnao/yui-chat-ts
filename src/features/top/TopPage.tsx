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
import { useRoomCounts } from './hooks/useRoomCounts';
import { intro } from './data';

export default function TopPage() {
  useSEO({
    title: 'お気楽チャットTS - 無料で気軽に参加できる目的別チャット',
    description:
      'お気楽チャットは、無料で気軽に参加できるチャットサービスです。初心者、学生、年代別、趣味、ゲーム、アニメ、なりきりなど目的別の部屋で友達探しや仲間作りを楽しめます。',
    canonical: buildAbsoluteUrl('/'),
    ogImage: buildAbsoluteUrl('/ogp.png'),
  });
  usePageView('お気楽チャット トップ');

  const { counts: liveCounts } = useRoomCounts();

  return (
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
        <div className="grid grid-cols-1 md:grid-cols-[176px_1fr] lg:grid-cols-[176px_1fr_360px]">
          <LeftColumn liveCounts={liveCounts} />
          <MainColumn liveCounts={liveCounts} />
          <RightColumn />
        </div>
        <CommunitySection />
      </main>
      <Footer />
    </div>
  );
}
